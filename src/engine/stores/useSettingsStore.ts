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

      update: async (key, value) => {
        const current = get();
        const next = { ...current, [key]: value };
        set({ [key]: value });
        try {
          await tauri.settings.save({ [key]: value });
        } catch (e) {
          // Revert on failure
          set({ [key]: current[key] });
          console.error(`Failed to save setting ${key}:`, e);
        }
      },

      updateMany: async (partial) => {
        const current = get();
        set(partial);
        try {
          await tauri.settings.save(partial);
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

// Apply theme to document
export function applyTheme(settings: Pick<AppSettings, "appearance" | "accentColor">) {
  const root = document.documentElement;
  const isDark = settings.appearance === "dark" || 
    (settings.appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  
  root.classList.toggle("dark", isDark);
  
  // Accent color CSS variable
  const accents: Record<string, string> = {
    blue: "#3474d4",
    purple: "#8b5cf6",
    green: "#27845f",
    orange: "#ea7a1a",
    pink: "#db2777",
    red: "#dc2626",
  };
  root.style.setProperty("--accent", accents[settings.accentColor] || accents.blue);
}

// Listen for system theme changes
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const settings = useSettingsStore.getState();
    if (settings.appearance === "system") {
      applyTheme(settings);
    }
  });
}