import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppSettings } from "../types/settings";
import { defaultSettings } from "../types/settings";
import { tauri } from "../commands/tauri";

interface SettingsState extends AppSettings {
  // Hydration state
  _hydrated: boolean;
  _loading: boolean;

  // Actions
  hydrate: () => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  updateMany: (partial: Partial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      _hydrated: false,
      _loading: false,

      hydrate: async () => {
        set({ _loading: true });
        try {
          const saved = await tauri.settings.get();
          set({ ...saved, _hydrated: true, _loading: false });
        } catch {
          // Tauri not available (web preview) - use persisted or defaults
          set({ _hydrated: true, _loading: false });
        }
      },

      update: async (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
        const current = get();
        if (key === "sidebarWidth") {
          // Hard clamp so the layout stays within the bounds the CSS was authored
          // for (180px - 360px).
          value = Math.min(360, Math.max(180, Number(value) || 220)) as AppSettings["sidebarWidth"];
        }
        const patch: Partial<AppSettings> = { [key]: value } as Partial<AppSettings>;
        set((state) => ({ ...state, ...patch }));
        try {
          await tauri.settings.save(patch);
        } catch (e) {
          // Revert on failure
          set((state) => ({ ...state, [key]: current[key] }));
          console.error(`Failed to save setting ${key}:`, e);
        }
      },

      updateMany: async (partial) => {
        const current = get();
        const next = { ...current, ...partial };
        if ("sidebarWidth" in partial) {
          // Hard clamp so the layout stays within the bounds the CSS was
          // authored for (180px - 360px).
          next.sidebarWidth = Math.min(360, Math.max(180, Number(partial.sidebarWidth) || 220));
        }
        set(next);
        try {
          // Persist the clamped value so stored state and store state never
          // drift.
          await tauri.settings.save(next);
        } catch (e) {
          set(current);
          console.error("Failed to save settings:", e);
        }
      },

      reset: async () => {
        set({ ...defaultSettings, _hydrated: true });
        try {
          await tauri.settings.save(defaultSettings);
        } catch (e) {
          console.error("Failed to reset settings:", e);
        }
      },
    }),
    {
      name: "stillroom-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { _hydrated, _loading, ...settings } = state;
        return settings;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
        }
      },
    }
  )
);

// Selectors for common use
export const useAppearance = () => useSettingsStore((s) => s.appearance);
export const useAccentColor = () => useSettingsStore((s) => s.accentColor);
export const useSidebarWidth = () => useSettingsStore((s) => s.sidebarWidth);
export const useDefaultLayout = () => useSettingsStore((s) => s.defaultLayout);
export const useVaultEnabled = () => useSettingsStore((s) => s.vaultEnabled);
export const useVaultAutoLockMinutes = () => useSettingsStore((s) => s.vaultAutoLockMinutes);

// Apply theme to the native app frame.
export function applyTheme(settings: Pick<AppSettings, "appearance" | "accentColor">) {
  const frame = document.querySelector<HTMLElement>(".app-frame");
  if (!frame) return;
  const isDark =
    settings.appearance === "dark" ||
    (settings.appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  frame.classList.toggle("dark", isDark);
  frame.style.setProperty("--accent", resolveAccent(settings.accentColor, isDark));
  frame.style.setProperty(
    "--accent-soft",
    mixColors(resolveAccent(settings.accentColor, isDark), isDark ? "#171c23" : "#ffffff", 0.12)
  );
}

// Resolve a single accent into its light / dark surface palette value.
function resolveAccent(accent: string, isDark: boolean): string {
  const palettes: Record<string, Record<string, string>> = {
    light: {
      blue: "#3474d4",
      purple: "#8b5cf6",
      green: "#27845f",
      orange: "#ea7a1a",
      pink: "#db2777",
      red: "#dc2626",
    },
    dark: {
      blue: "#8ab4ff",
      purple: "#b79bff",
      green: "#6bc69a",
      orange: "#f0a45c",
      pink: "#f489b8",
      red: "#f28585",
    },
  };
  const palette = palettes[isDark ? "dark" : "light"];
  return palette?.[accent] ?? palette?.blue ?? palettes.light.blue;
}

// Deterministic blend of a foreground color toward a target color.
// Used to derive the accent soft tint without relying on CSS color-mix, which
// is not available on older WebViewKit/Safari builds.
function mixColors(hex: string, mixTo: string, ratio: number): string {
  const toRgb = (h: string): [number, number, number] => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] as [number, number, number];
  };

  const [r1, g1, b1] = toRgb(hex);
  const [r2, g2, b2] = toRgb(mixTo);
  return `rgb(${Math.round(r1 + (r2 - r1) * ratio)}, ${Math.round(g1 + (g2 - g1) * ratio)}, ${Math.round(b1 + (b2 - b1) * ratio)})`;
}

// Whether the OS is currently in dark mode. Exposed as a selector so callers
// only have to subscribe to the resolved value.
export function useSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Listen for system theme changes so a "system" choice follows the OS.
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const settings = useSettingsStore.getState();
    if (settings.appearance === "system") {
      applyTheme(settings);
    }
  });
}