import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { MediaItem } from "../types/media";
import { useLibraryStore } from "./useLibraryStore";

interface SlideshowState {
  // State
  playing: boolean;
  interval: number;        // seconds
  shuffle: boolean;
  transition: "fade" | "slide" | "none";
  currentItem: MediaItem | null;

  // Actions
  start: () => void;
  stop: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  setInterval: (seconds: number) => void;
  setShuffle: (shuffle: boolean) => void;
  setTransition: (transition: "fade" | "slide" | "none") => void;
}

let slideshowTimer: ReturnType<typeof setInterval> | null = null;

export const useSlideshowStore = create<SlideshowState>()(
  devtools(
    (set, get) => ({
      playing: false,
      interval: 5,
      shuffle: false,
      transition: "fade",
      currentItem: null,

      start: () => {
        const { playableItems, inspectedId } = useLibraryStore.getState();
        if (playableItems.length === 0) return;

        // Never stack timers. Clicking the Slideshow nav again (or re-entering
        // the screen) used to create a second interval while the old one kept
        // running: each leaked timer called navigatePhoto → refreshDerived and
        // re-rendered the whole app every few seconds.
        if (slideshowTimer) {
          clearInterval(slideshowTimer);
          slideshowTimer = null;
        }
        
        const current = playableItems.find((i) => i.id === inspectedId) || playableItems[0];
        set({ playing: true, currentItem: current });
        
        // Set initial inspection target (selection is left alone)
        if (!inspectedId && playableItems[0]) {
          useLibraryStore.getState().inspectItem(playableItems[0].id);
        }
        
        if (playableItems.length >= 2) {
          slideshowTimer = setInterval(() => {
            // Defensive: a timer that somehow outlives stop() must not keep
            // driving the library.
            if (!get().playing) return;
            const { shuffle } = get();
            if (shuffle) {
              const { playableItems: items, inspectedId: currentId } = useLibraryStore.getState();
              const candidates = items.filter((i) => i.id !== currentId);
              if (candidates.length) {
                const randomIndex = Math.floor(Math.random() * candidates.length);
                const targetItem = candidates[randomIndex];
                useLibraryStore.getState().inspectItem(targetItem.id);
              }
            } else {
              useLibraryStore.getState().navigatePhoto(1);
            }
            const { playableItems: items, inspectedId: currentId } = useLibraryStore.getState();
            const currentItem = items.find((i) => i.id === currentId);
            if (currentItem) set({ currentItem });
          }, get().interval * 1000);
        }
      },

      stop: () => {
        if (slideshowTimer) {
          clearInterval(slideshowTimer);
          slideshowTimer = null;
        }
        set({ playing: false });
      },

      toggle: () => {
        if (get().playing) get().stop(); else get().start();
      },

      next: () => {
        useLibraryStore.getState().navigatePhoto(1);
        const { playableItems, inspectedId } = useLibraryStore.getState();
        const current = playableItems.find((i) => i.id === inspectedId);
        if (current) set({ currentItem: current });
      },

      previous: () => {
        useLibraryStore.getState().navigatePhoto(-1);
        const { playableItems, inspectedId } = useLibraryStore.getState();
        const current = playableItems.find((i) => i.id === inspectedId);
        if (current) set({ currentItem: current });
      },

      setInterval: (seconds) => set({ interval: Math.max(1, Math.min(60, seconds)) }),

      setShuffle: (shuffle) => set({ shuffle }),

      setTransition: (transition) => set({ transition }),
    }),
    { name: "slideshow-store" }
  )
);

// Cleanup on unmount
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (slideshowTimer) clearInterval(slideshowTimer);
  });
}

export const useSlideshowPlaying = () => useSlideshowStore((s) => s.playing);
export const useSlideshowInterval = () => useSlideshowStore((s) => s.interval);
export const useSlideshowShuffle = () => useSlideshowStore((s) => s.shuffle);
export const useSlideshowTransition = () => useSlideshowStore((s) => s.transition);
export const useSlideshowCurrentItem = () => useSlideshowStore((s) => s.currentItem);