import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { MediaItem, BatchExportRequest, BatchExportResult } from "../types/media";
import { tauri } from "../commands/tauri";
import { useLibraryStore } from "./useLibraryStore";

interface BatchState {
  // Config
  pattern: string;
  format: "jpeg" | "png" | "webp" | "heic" | "avif" | "source";
  quality: number;
  stripMetadata: boolean;
  maxDimension: number | null;

  // UI State
  step: 1 | 2 | 3;
  busy: boolean;
  progress: { current: number; total: number; currentFile: string } | null;
  result: BatchExportResult | null;

  // Actions
  setPattern: (pattern: string) => void;
  setFormat: (format: BatchState["format"]) => void;
  setQuality: (quality: number) => void;
  setStripMetadata: (strip: boolean) => void;
  setMaxDimension: (dim: number | null) => void;
  setStep: (step: 1 | 2 | 3) => void;
  exportBatch: () => Promise<void>;
  reset: () => void;
}

const defaultConfig = {
  pattern: "{name}_{number}",
  format: "jpeg" as const,
  quality: 88,
  stripMetadata: true,
  maxDimension: null,
};

export const useBatchStore = create<BatchState>()(
  devtools(
    (set, get) => ({
      ...defaultConfig,
      step: 1,
      busy: false,
      progress: null,
      result: null,

      setPattern: (pattern) => set({ pattern }),
      setFormat: (format) => set({ format }),
      setQuality: (quality) => set({ quality: Math.max(1, Math.min(100, quality)) }),
      setStripMetadata: (stripMetadata) => set({ stripMetadata }),
      setMaxDimension: (maxDimension) => set({ maxDimension }),
      setStep: (step) => set({ step }),

      exportBatch: async () => {
        const { selectedIds } = useLibraryStore.getState();
        const items = useLibraryStore.getState().items.filter((i) => selectedIds.includes(i.id));
        
        if (items.length === 0) return;

        const { pattern, format, quality, stripMetadata, maxDimension } = get();
        set({ busy: true, progress: { current: 0, total: items.length, currentFile: "" }, result: null });

        try {
          const request: BatchExportRequest = {
            items: items.map((item, index) => ({
              id: item.id,
              sourcePath: item.path,
              index,
            })),
            outputFolder: "", // TODO: get from dialog
            pattern,
            format,
            quality: quality / 100,
            stripMetadata,
            maxDimension: maxDimension || undefined,
          };

          const result = await tauri.batch.export(request);
          set({ busy: false, progress: null, result, step: 3 });
        } catch (e) {
          set({ busy: false, progress: null, result: { exported: 0, failed: [{ itemId: "", error: String(e) }], outputs: [] } });
        }
      },

      reset: () => set({ ...defaultConfig, step: 1, busy: false, progress: null, result: null }),
    }),
    { name: "batch-store" }
  )
);

export const useBatchConfig = () => useBatchStore((s) => ({
  pattern: s.pattern,
  format: s.format,
  quality: s.quality,
  stripMetadata: s.stripMetadata,
  maxDimension: s.maxDimension,
}));

export const useBatchState = () => useBatchStore((s) => ({
  step: s.step,
  busy: s.busy,
  progress: s.progress,
  result: s.result,
}));