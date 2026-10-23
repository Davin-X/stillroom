import { useSyncExternalStore } from "react";
import { create } from "zustand";
import type { AppSettings } from "../types/settings";
import { defaultSettings } from "../types/settings";
import { tauri } from "../commands/tauri";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * A small debounce window for settings persistence. Controls in the Settings
 * screen (range sliders, toggles, radio groups) can fire many updates during a
 * single interaction — e.g. every tick while dragging the sidebar width slider.
 * Persisting each one as its own Tauri IPC round-trip is what made the screen
 * feel laggy. We still apply the change optimistically to the store/state
 * immediately so the UI is snappy, and only the disk write is debounced.
 */
const SAVE_DEBOUNCE_MS = 220;

// Pending partial patch + flush timer. A single shared timer coalesces every
// update() call that happens within the window into one save() of the merged
// patch, so a slider drag of 40 ticks -> 1 IPC call instead of 40.
let pendingPatch: Partial<AppSettings> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Optimistic state is applied by callers immediately; this only persists to
 *  disk. On failure we keep the optimistic value (it will be retried on the
 *  next interaction / app restart) rather than fighting the user by reverting
 *  controls mid-drag. */
function scheduleSave(patch: Partial<AppSettings>): void {
  pendingPatch = { ...(pendingPatch ?? {}), ...patch };
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    const toSave = pendingPatch;
    pendingPatch = null;
    flushTimer = null;
    if (!toSave || Object.keys(toSave).length === 0) return;
    try {
      await tauri.settings.save(toSave);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Flush any pending writes synchronously (e.g. on app quit / reset). */
export function flushSettingsSaves(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const toSave = pendingPatch;
  pendingPatch = null;
  if (!toSave || Object.keys(toSave).length === 0) return;
  // Fire-and-forget; reset()/hydrate() don't depend on this resolving.
  void tauri.settings.save(toSave);
}

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
  (set, get) => ({
      ...defaultSettings,
      _hydrated: false,
      _loading: false,

      hydrate: async () => {
        set({ _loading: true });
        try {
          const saved = await tauri.settings.get();
          // Older builds exposed layout names that the library no longer
          // supports. Keep persisted preferences safe when upgrading.
          const savedLayout = (saved as Partial<AppSettings>)?.defaultLayout;
          const defaultLayout = savedLayout === "details" || savedLayout === "timeline" ? savedLayout : "grid";
          set({ ...saved, defaultLayout, _hydrated: true, _loading: false });
        } catch {
          // Tauri not available (web preview) - use persisted or defaults
          set({ _hydrated: true, _loading: false });
        }
      },

      update: async (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
        if (key === "sidebarWidth") {
          // Hard clamp so the layout stays within the bounds the CSS was authored
          // for (180px - 360px).
          value = Math.min(360, Math.max(180, Number(value) || 220)) as AppSettings["sidebarWidth"];
        }
        const patch: Partial<AppSettings> = { [key]: value } as Partial<AppSettings>;
        // Optimistic update — the UI follows the thumb immediately.
        set((state) => ({ ...state, ...patch }));
        scheduleSave(patch);
      },

      updateMany: async (partial: Partial<AppSettings>) => {
        const next = { ...get(), ...partial };
        if ("sidebarWidth" in partial) {
          // Hard clamp so the layout stays within the bounds the CSS was
          // authored for (180px - 360px).
          next.sidebarWidth = Math.min(360, Math.max(180, Number(partial.sidebarWidth) || 220));
        }
        // Optimistic update with the fully-clamped merged state.
        set(next);
        scheduleSave(next);
      },

      reset: async () => {
        // Reset is a single committed action: flush any in-flight writes first
        // so we don't race a pending save, then write the defaults immediately.
        flushSettingsSaves();
        set({ ...defaultSettings, _hydrated: true });
        try {
          await tauri.settings.save(defaultSettings);
        } catch (e) {
          console.error("Failed to reset settings:", e);
        }
      },
    })
  )
;

// Selectors for common use
export const useAppearance = () => useSettingsStore((s) => s.appearance);
export const useAccentColor = () => useSettingsStore((s) => s.accentColor);
export const useSidebarWidth = () => useSettingsStore((s) => s.sidebarWidth);
export const useDefaultLayout = () => useSettingsStore((s) => s.defaultLayout);
export const useThumbnailSize = () => useSettingsStore((s) => s.thumbnailSize);

// Apply theme to the native app frame.
//
// The accent is expanded into a small set of derived tokens so that every
// part of the UI can use it correctly:
//   --accent           the raw fill color (button backgrounds, borders)
//   --accent-hover     the fill color for :hover / :active states
//   --accent-text      the accent color WEIGHTED FOR TEXT on the surface.
//                      This is darker in light mode and lighter in dark mode
//                      so accent-colored labels stay readable.
//   --accent-soft      a low-opacity tint of the accent for chip/badge fills
//   --accent-contrast  readable text color to place ON TOP of --accent
//   --field-focus-inner  the focus ring tint, derived from the accent
export function applyTheme(settings: Pick<AppSettings, "appearance" | "accentColor">) {
  const frame = document.querySelector<HTMLElement>(".app-frame");
  if (!frame) return;
  const isDark =
    settings.appearance === "dark" ||
    (settings.appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  frame.classList.toggle("dark", isDark);
  const base = resolveAccent(settings.accentColor, isDark);
  const surface = isDark ? "#0b0d12" : "#ffffff";
  // Push the accent away from the surface so it reads as a distinct hue:
  // darken for light mode, lighten for dark mode.
  const toward = isDark ? "#ffffff" : "#000000";

  // --accent-soft is a TINT of the accent over the surface, i.e. mostly the
  // surface with a little accent in it. mixColors(base, surface, r) blends
  // toward the surface, so r must be high (0.88) to keep only 12% accent —
  // this matches the `color-mix(in srgb, var(--accent) 12%, var(--surface))`
  // fallback declared in the CSS.
  const soft = mixColors(base, surface, 0.88);

  // --accent-text has to work on BOTH the plain surface and the soft tint
  // (active nav items, filter chips and badges all put accent text on the
  // soft fill). Mixing 18% toward black is not enough for warm accents like
  // orange, so darken/lighten the accent until it clears 4.5:1 against both
  // backgrounds. This keeps the accent hue visible instead of falling back to
  // a generic grey.
  const text = accentTextFor(base, soft, isDark ? "#ffffff" : "#000000", surface);

  frame.style.setProperty("--accent", base);
  frame.style.setProperty("--accent-hover", mixColors(base, toward, isDark ? 0.16 : 0.12));
  frame.style.setProperty("--accent-text", text);
  frame.style.setProperty("--accent-soft", soft);
  frame.style.setProperty("--accent-contrast", contrastOn(base));
  frame.style.setProperty("--field-focus-inner", rgba(base, isDark ? 0.26 : 0.24));
  // Expose --surface on <html> so <body> (an ancestor of .app-frame) inherits
  // the correct dark/light surface color. This prevents the parent-window
  // background from flashing during live window resizes when .app-frame
  // hasn't yet resized to fill the viewport.
  document.documentElement.style.setProperty("--surface", surface);

  // Sync the native window background color to match the surface so that any
  // gap between the webview backing store and the native window edge during
  // macOS live resize shows the correct color instead of a white/light stripe.
  try {
    void getCurrentWindow().setBackgroundColor(surface);
  } catch {
    // Tauri not available (web preview) or API call failed — ignore.
  }
}

// The accent palette. Each accent has a light-mode and a dark-mode value so
// the swatch shown in Settings matches the color that will actually be applied
// to the running theme.
export const ACCENT_PALETTE: { id: string; label: string; light: string; dark: string }[] = [
  { id: "blue", label: "Blue", light: "#3474d4", dark: "#3b82f6" },
  { id: "purple", label: "Purple", light: "#8254ea", dark: "#b79bff" },
  { id: "green", label: "Green", light: "#27845f", dark: "#6bc69a" },
  { id: "orange", label: "Orange", light: "#dd6b16", dark: "#f0a45c" },
  { id: "pink", label: "Pink", light: "#db2777", dark: "#f489b8" },
  { id: "red", label: "Red", light: "#dc2626", dark: "#f28585" },
];

// Resolve a single accent into its light / dark surface palette value.
function resolveAccent(accent: string, isDark: boolean): string {
  const palette = ACCENT_PALETTE.reduce<Record<string, { light: string; dark: string }>>(
    (acc, entry) => {
      acc[entry.id] = { light: entry.light, dark: entry.dark };
      return acc;
    },
    {}
  );
  const entry = palette[accent] ?? palette.blue;
  return isDark ? entry.dark : entry.light;
}

// Pick black or white — whichever reads better on top of the given fill.
// Uses the WCAG relative-luminance formula so accent fills always get a
// readable label (important for light/yellow accents, where white text fails).
function contrastOn(hex: string): string {
  const base = parseColor(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [16, 20, 24];
  const vsWhite = contrastRatio(white, base);
  const vsBlack = contrastRatio(black, base);
  return vsWhite >= vsBlack ? "#ffffff" : "#101418";
}

// Same fill color with an explicit alpha, for focus rings and tints.
function rgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(52, 116, 212, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

// Deterministic blend of a foreground color toward a target color.
// Used to derive the accent soft tint without relying on CSS color-mix, which
// is not available on older WebViewKit/Safari builds.
function mixColors(hex: string, mixTo: string, ratio: number): string {
  const [r1, g1, b1] = parseColor(hex);
  const [r2, g2, b2] = parseColor(mixTo);
  return `rgb(${Math.round(r1 + (r2 - r1) * ratio)}, ${Math.round(g1 + (g2 - g1) * ratio)}, ${Math.round(b1 + (b2 - b1) * ratio)})`;
}

// Parse a color into RGB. Accepts "#rrggbb", "#rgb"-style shorthand is not
// needed, plus the "rgb(r, g, b)" strings this module produces itself.
function parseColor(value: string): [number, number, number] {
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
  if (hex) {
    return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  }
  const rgb = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return [0, 0, 0];
}

// Derive an accent color that is safe to use as TEXT on both the plain
// surface and the soft accent tint.
//
// The accent is blended toward `toward` (black in light mode, white in dark
// mode) until it clears the target contrast ratio against BOTH backgrounds.
// A binary search is used because contrast is monotonic in the blend ratio, so
// the smallest ratio that satisfies both bounds is the one that keeps the
// accent hue as visible as possible.
function accentTextFor(
  base: string,
  soft: string,
  toward: string,
  surface: string
): string {
  const target = 4.5;
  const baseRgb = parseColor(base);
  const softRgb = parseColor(soft);
  const surfaceRgb = parseColor(surface);
  const towardRgb = parseColor(toward);

  const ok = (c: [number, number, number]) =>
    contrastRatio(c, surfaceRgb) >= target && contrastRatio(c, softRgb) >= target;

  // Already good as-is (common in dark mode, where the palette is pastel).
  if (ok(baseRgb)) return formatRgb(baseRgb);

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(blend(baseRgb, towardRgb, mid))) hi = mid;
    else lo = mid;
  }
  return formatRgb(blend(baseRgb, towardRgb, hi));
}

function formatRgb(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function blend(
  a: [number, number, number],
  b: [number, number, number],
  ratio: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * ratio),
    Math.round(a[1] + (b[1] - a[1]) * ratio),
    Math.round(a[2] + (b[2] - a[2]) * ratio),
  ];
}

// WCAG relative luminance.
function relativeLuminance(rgb: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Whether the OS is currently in dark mode. A real subscription so changing
// the system appearance re-renders "system" followers live.
function subscribeSystemDark(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
}

// Listen for system theme changes so a "system" choice follows the OS.
if (typeof window !== "undefined") {
  const osThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const osThemeHandler = (e: MediaQueryListEvent) => {
    const settings = useSettingsStore.getState();
    if (settings.appearance === "system") {
      applyTheme(settings);
    }
  };
  // `addEventListener` on MediaQueryList is deprecated but is the only API
  // WKWebView exposes for this; `addListener` is the legacy fallback.
  if (typeof osThemeQuery.addEventListener === "function") {
    osThemeQuery.addEventListener("change", osThemeHandler);
  } else if (typeof (osThemeQuery as any).addListener === "function") {
    (osThemeQuery as any).addListener(osThemeHandler);
  }
}

// Flush any debounced writes before the window (and therefore the Tauri app)
// is torn down, so the last settings edits are not lost on quit.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushSettingsSaves();
  });
}
