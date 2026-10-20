import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { EditValues, MediaItem } from "../types/media";
import { defaultEdits } from "../commands/tauri";

interface EditState {
  // State
  item: MediaItem | null;
  values: EditValues;
  crop: CropState;
  history: EditValues[];
  historyIndex: number;

  // Actions
  open: (item: MediaItem) => void;
  close: () => void;
  setValue: <K extends keyof EditValues>(key: K, value: EditValues[K]) => void;
  setValues: (values: Partial<EditValues>) => void;
  reset: () => void;
  auto: () => void;
  rotate: (degrees: number) => void;
  flip: () => void;
  setCrop: (crop: Partial<CropState>) => void;
  resetCrop: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface CropState {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number | "free";
}

const defaultCrop: CropState = {
  enabled: false,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  aspectRatio: "free",
};

const autoEdits: EditValues = {
  exposure: 15,
  contrast: 12,
  warmth: 10,
  shadows: 10,
  highlights: -10,
  saturation: 10,
  rotation: 0,
  flip: false,
};

export const useEditStore = create<EditState>()(
  devtools(
    (set, get) => ({
      item: null,
      values: defaultEdits,
      crop: defaultCrop,
      history: [defaultEdits],
      historyIndex: 0,

      open: (item) => {
        set({
          item,
          values: defaultEdits,
          crop: defaultCrop,
          history: [defaultEdits],
          historyIndex: 0,
        });
      },

      close: () => set({ item: null, values: defaultEdits, crop: defaultCrop, history: [defaultEdits], historyIndex: 0 }),

      setValue: (key, value) => {
        const { values, history, historyIndex } = get();
        const next = { ...values, [key]: value };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(next);
        if (newHistory.length > 50) newHistory.shift();
        set({ values: next, history: newHistory, historyIndex: newHistory.length - 1 });
      },

      setValues: (partial) => {
        const { values, history, historyIndex } = get();
        const next = { ...values, ...partial };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(next);
        if (newHistory.length > 50) newHistory.shift();
        set({ values: next, history: newHistory, historyIndex: newHistory.length - 1 });
      },

      reset: () => {
        const { history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(defaultEdits);
        set({ values: defaultEdits, crop: defaultCrop, history: newHistory, historyIndex: newHistory.length - 1 });
      },

      auto: () => {
        const { history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(autoEdits);
        set({ values: autoEdits, history: newHistory, historyIndex: newHistory.length - 1 });
      },

      rotate: (degrees) => {
        const { values, history, historyIndex } = get();
        const next = { ...values, rotation: (values.rotation + degrees + 360) % 360 };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(next);
        set({ values: next, history: newHistory, historyIndex: newHistory.length - 1 });
      },

      flip: () => {
        const { values, history, historyIndex } = get();
        const next = { ...values, flip: !values.flip };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(next);
        set({ values: next, history: newHistory, historyIndex: newHistory.length - 1 });
      },

      setCrop: (partial) => set((s) => ({ crop: { ...s.crop, ...partial } })),

      resetCrop: () => set({ crop: defaultCrop }),

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const nextIndex = historyIndex - 1;
          set({ values: history[nextIndex], historyIndex: nextIndex });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          set({ values: history[nextIndex], historyIndex: nextIndex });
        }
      },

      get canUndo() {
        return get().historyIndex > 0;
      },

      get canRedo() {
        const { history, historyIndex } = get();
        return historyIndex < history.length - 1;
      },
    }),
    { name: "edit-store" }
  )
);

export const useEditItem = () => useEditStore((s) => s.item);
export const useEditValues = () => useEditStore((s) => s.values);
export const useEditCrop = () => useEditStore((s) => s.crop);
export const useEditHistory = () => useEditStore((s) => ({ canUndo: s.canUndo, canRedo: s.canRedo }));