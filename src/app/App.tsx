import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { tauri, events } from "../engine/commands/tauri";
import {
  useLibraryStore,
  useViewerStore,
  useEditStore,
  useVaultStore,
  useSlideshowStore,
  useBatchStore,
  useSettingsStore,
  useSystemDark,
  applyTheme,
} from "../engine/stores";
import { getTypeIdentity, getKindIcon } from "../engine/utils/mediaTypes";

// Helper: render a kind badge using centralized type identity
function KindBadge({ kind }: { kind: "photo" | "video" | "raw" }) {
  const { label, softColor, color } = getTypeIdentity(kind);
  return (
    <span className={`kind-badge ${kind}`} style={{ background: softColor, color }} title={label}>
      {label}
    </span>
  );
}

// Helper: render a kind dot
function KindDot({ kind }: { kind: "photo" | "video" | "raw" }) {
  const { color } = getTypeIdentity(kind);
  return <span className={`kind-dot ${kind}`} style={{ background: color }} />;
}

// Helper: get icon for kind
function KindIcon({ kind, size = 14 }: { kind: "photo" | "video" | "raw"; size?: number }) {
  return <span dangerouslySetInnerHTML={{ __html: getKindIcon(kind, 14) }} />;
}
import type { MediaItem, MediaKind, Filter } from "../engine/types/media";
import type { LibraryFolder } from "../engine/types/commands";
import { SettingsScreen } from "../design/components/SettingsScreen";
import { SourcesManager } from "../design/components/SourcesManager";
import { SlideshowOverlay } from "../design/components/SlideshowOverlay";
import { ContextMenu } from "../design/components/ContextMenu";
import { BrandMark } from "../design/components/BrandMark";
import { GearIcon, SunIcon, MoonIcon, LibraryIcon, AlbumsIcon, ViewerIcon, ExploreIcon, DuplicatesIcon, EditIcon, BatchIcon, VaultIcon, SearchIcon, PlusIcon, MinusIcon, MoreIcon, InspectorIcon, FolderIcon, GridIcon, OverviewIcon, ColumnsIcon, DetailsIcon, TimelineIcon, HeartIcon, EyeIcon, EyeOffIcon, FullscreenIcon, RotateIcon, CropIcon, FlipIcon, PlayIcon, PauseIcon, SparkleIcon, UsersIcon, TagIcon, ImageOffIcon, LockIcon, ShareIcon, CheckIcon } from "../design/components/icons";

type Screen = "Library" | "Albums" | "Viewer" | "Explore" | "Duplicates" | "Edit" | "Batch" | "Vault" | "Settings";

const initialEdits = { exposure: 0, contrast: 0, warmth: 0, shadows: 0, highlights: 0, saturation: 0, rotation: 0, flip: false };

const MEDIA_EXTENSIONS = [
  "avif", "bmp", "gif", "heic", "heif", "jfif", "jpe", "jpeg", "jpg", "jxl", "png", "tif", "tiff", "webp",
  "3fr", "ari", "arw", "bay", "cap", "cr2", "cr3", "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef", "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "x3f",
  "m4v", "mov", "mp4", "mpeg", "mpg", "webm",
];

/** Tauri rejects with a plain string, but anything else can surface too. */
function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Modifier glyph for the "focus search" hint - Command on macOS, Ctrl elsewhere. */
function searchShortcutLabel(): string {
  if (typeof navigator === "undefined") return "⌘F";
  // `userAgentData` is not in the default TS lib yet, so read it defensively.
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘F" : "Ctrl F";
}

function App() {
  const [screen, setScreen] = useState<Screen>("Library");
  // Context menu state (declared here because the component references it in
  // JSX but it was previously an implicit global, which left the render blank).
  const [contextMenu, setContextMenu] = useState<{ items: any[]; x: number; y: number } | null>(null);
  const systemDark = useSystemDark();
  const appearance = useSettingsStore((s) => s.appearance);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  // Resolved appearance: the user's choice, or the OS setting when "system".
  const dark = appearance === "dark" || (appearance === "system" && systemDark);
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [albumDialogMode, setAlbumDialogMode] = useState<"create" | "rename">("create");
  const [albumName, setAlbumName] = useState("");
  const [albumSeedIds, setAlbumSeedIds] = useState<string[] | null>(null);
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const albumInputRef = useRef<HTMLInputElement | null>(null);

  const [albumPendingDelete, setAlbumPendingDelete] = useState<any | null>(null);
  const [itemPendingDelete, setItemPendingDelete] = useState<string[] | null>(null);
  const [albumRemovePending, setAlbumRemovePending] = useState<{ albumId: string; itemIds: string[] } | null>(null);
  const [deletingAlbum, setDeletingAlbum] = useState(false);

  // Removing a folder is confirmed through its own dialog so a stray click in
  // the sidebar can never drop a chunk of the library.
  const [folderPendingRemove, setFolderPendingRemove] = useState<LibraryFolder | null>(null);
  const [removingFolder, setRemovingFolder] = useState(false);
  const [sourcesSheetOpen, setSourcesSheetOpen] = useState(false);

  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [albumPickerItemIds, setAlbumPickerItemIds] = useState<string[]>([]);
  const [albumSearch, setAlbumSearch] = useState("");
  const [addingToAlbumId, setAddingToAlbumId] = useState<string | null>(null);
  const albumSearchRef = useRef<HTMLInputElement | null>(null);
  const [albumDragOver, setAlbumDragOver] = useState(false);
  const importPathsIntoAlbumRef = useRef<(paths: string[], albumId: string) => Promise<void>>(async () => {});

  // Opening our own menu has to cancel the event, otherwise the webview shows
  // its default menu (Reload / Copy / Open in new tab) on top of it.
  const openContextMenu = useCallback((items: any[], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ items, x: e.clientX, y: e.clientY });
  }, []);

  // Suppress the webview's default menu everywhere else too, so the app never
  // exposes browser chrome. Editable fields keep it, for Paste / Select All.
  useEffect(() => {
    const suppress = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const editable =
        el.isContentEditable ||
        ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !el.hasAttribute("disabled"));
      if (!editable) e.preventDefault();
    };
    document.addEventListener("contextmenu", suppress);
    return () => document.removeEventListener("contextmenu", suppress);
  }, []);

  const library = useLibraryStore();

  // Sidebar summary in one pass. The rows used to run a filter + reduce over
  // the whole library each, i.e. a dozen scans per render, which is costly at
  // 10k+ items and made every unrelated state change feel slow.
  const libraryStats = useMemo(() => {
    const stats = {
      photos: 0, videos: 0, raws: 0, favorites: 0, hidden: 0,
      photoSize: 0, videoSize: 0, rawSize: 0, favoriteSize: 0, hiddenSize: 0, totalSize: 0,
    };
    for (const item of library.items) {
      stats.totalSize += item.size;
      if (item.hidden) { stats.hidden += 1; stats.hiddenSize += item.size; }
      if (item.favorite) { stats.favorites += 1; stats.favoriteSize += item.size; }
      if (item.kind === "photo") { stats.photos += 1; stats.photoSize += item.size; }
      else if (item.kind === "video") { stats.videos += 1; stats.videoSize += item.size; }
      else if (item.kind === "raw") { stats.raws += 1; stats.rawSize += item.size; }
    }
    return stats;
  }, [library.items]);

  const viewer = useViewerStore();
  const edit = useEditStore();
  const vault = useVaultStore();
  const batch = useBatchStore();
  const settings = useSettingsStore();

  // Leaving the Viewer screen must close the viewer store too, otherwise its
  // isOpen flag lingers and a later "Viewer" nav click would look like a
  // no-op. Navigating away is the user's signal to stop viewing.
  useEffect(() => {
    if (screen !== "Viewer" && viewer.isOpen) {
      viewer.close();
    }
    // Also ensure screen state matches viewer state on mount/hydration
    if (screen === "Viewer" && !viewer.isOpen) {
      viewer.open();
    }
  }, [screen, viewer.isOpen, viewer.close, viewer.open]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // The library search input lives in LibraryScreen, but the Cmd+F shortcut
  // is owned here. Sharing the node through a ref keeps the shortcut working
  // without depending on the DOM shape (a class-name query would break the
  // moment the field is restructured).
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // The topbar is our own drag region. Drag after a few pixels of movement
  // (not on mousedown) so a double-click is not mistaken for a drag, then use
  // double-click to toggle fill / centered small window. preventDefault keeps
  // the status text from being selected by the first click.
  const dragCandidateRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const preFillSizeRef = useRef<{ width: number; height: number } | null>(null);

  const beginTopbarDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='button'], [data-no-drag]")) return;
    e.preventDefault();
    if (e.detail > 1) return;
    dragCandidateRef.current = { x: e.clientX, y: e.clientY, dragging: false };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragCandidateRef.current;
      if (!drag || drag.dragging) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.dragging = true;
      getCurrentWindow().startDragging().catch(() => {});
    };
    const clear = () => {
      dragCandidateRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", clear);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // First double-click fills the monitor's work area (fully on-screen).
  // The next one restores the saved inner size and centers it.
  const handleTopbarDoubleClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='button']")) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const win = getCurrentWindow();
      const monitor = await currentMonitor();
      if (!monitor) return;
      const work = monitor.workArea ?? { position: monitor.position, size: monitor.size };
      const scale = monitor.scaleFactor || 1;
      const workWidth = work.size.width / scale;
      const workHeight = work.size.height / scale;
      const outer = await win.outerSize();
      const filled = outer.width >= work.size.width - 8 && outer.height >= work.size.height - 8;

      if (filled) {
        const saved = preFillSizeRef.current;
        const width = saved?.width && saved.width < workWidth - 40 ? saved.width : Math.min(1280, workWidth - 80);
        const height = saved?.height && saved.height < workHeight - 40 ? saved.height : Math.min(852, workHeight - 80);
        await win.setSize(new LogicalSize(width, height));
        await win.center();
        preFillSizeRef.current = null;
      } else {
        const inner = await win.innerSize();
        const outerBefore = await win.outerSize();
        const chromeHeight = Math.max(0, (outerBefore.height - inner.height) / scale);
        preFillSizeRef.current = { width: inner.width / scale, height: inner.height / scale };
        await win.setPosition(new PhysicalPosition(work.position.x, work.position.y));
        await win.setSize(new LogicalSize(Math.max(1, workWidth - 2), Math.max(1, workHeight - chromeHeight - 2)));
      }
    } catch {
      // Ignore: the browser preview has no Tauri window to resize.
    }
  }, []);

  // The system Fill can leave part of the window off-screen, and the restore
  // returns to the old frame instead of centering. Watch the native window and
  // correct both, without intercepting the titlebar gesture itself.
  useEffect(() => {
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let adjusting = false;
    let wasFilled = false;
    const unlisteners: Array<() => void> = [];

    const adjust = async () => {
      if (disposed || adjusting) return;
      try {
        const monitor = await currentMonitor();
        if (!monitor) return;
        const work = monitor.workArea ?? { position: monitor.position, size: monitor.size };
        const outer = await win.outerSize();
        const pos = await win.outerPosition();
        const filled = outer.width >= work.size.width - 8 && outer.height >= work.size.height - 8;

        if (filled) {
          wasFilled = true;
          const maxX = Math.max(work.position.x, work.position.x + work.size.width - outer.width);
          const maxY = Math.max(work.position.y, work.position.y + work.size.height - outer.height);
          const x = Math.min(Math.max(pos.x, work.position.x), maxX);
          const y = Math.min(Math.max(pos.y, work.position.y), maxY);
          if (x !== pos.x || y !== pos.y) {
            adjusting = true;
            await win.setPosition(new PhysicalPosition(x, y)).catch(() => {});
            adjusting = false;
          }
        } else if (wasFilled) {
          wasFilled = false;
          adjusting = true;
          await win.center().catch(() => {});
          adjusting = false;
        }
      } catch {
        // Ignore: the browser preview has no Tauri window to query.
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void adjust();
      }, 140);
    };

    win
      .onResized(schedule)
      .then((un) => (disposed ? un() : unlisteners.push(un)))
      .catch(() => {});
    win
      .onMoved(schedule)
      .then((un) => (disposed ? un() : unlisteners.push(un)))
      .catch(() => {});

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unlisteners.forEach((un) => un());
    };
  }, []);

  // Convert local file path to Tauri asset URL
  const assetUrl = useCallback((path: string) => {
    if (!path) return "";
    if (path.startsWith("blob:") || path.startsWith("data:") || path.startsWith("http")) return path;
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  }, []);

  // Latest render values, so long-lived event handlers never read stale stores.
  const liveRef = useRef({ library, viewer, edit, settings, vault, screen, albumDialogOpen, albumPickerOpen, albumPendingDelete, itemPendingDelete, folderPendingRemove, sourcesSheetOpen });
  liveRef.current = { library, viewer, edit, settings, vault, screen, albumDialogOpen, albumPickerOpen, albumPendingDelete, itemPendingDelete, folderPendingRemove, sourcesSheetOpen };

  // Handlers are declared further down; stable listeners reach them through a ref.
  const handlersRef = useRef<{
    importFolder: () => void;
    importFiles: () => void;
    showNotice: (text: string) => void;
  }>({ importFolder: () => {}, importFiles: () => {}, showNotice: () => {} });

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");

    // Load persisted data exactly once on mount.
    liveRef.current.library.loadLibrary();
    liveRef.current.settings.hydrate();
    liveRef.current.vault.loadStatus();

    // Listen for native menu events (cleaned up on unmount / StrictMode remount).
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const listen = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const register = async (event: string, handler: () => void) => {
        const unlisten = await listen(event, handler);
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      };
      await register("menu-open-folder", () => handlersRef.current.importFolder());
      await register("menu-import-files", () => handlersRef.current.importFiles());
      await register("menu-export", () => handlersRef.current.showNotice("Export - coming soon"));
      await register("menu-toggle-sidebar", () => liveRef.current.library.toggleSidebar());
      await register("menu-toggle-inspector", () => liveRef.current.library.toggleInspector());
      await register("menu-zoom-in", () => liveRef.current.viewer.zoomIn());
      await register("menu-zoom-out", () => liveRef.current.viewer.zoomOut());
      await register("menu-about", () => handlersRef.current.showNotice("Stillroom v0.1.0 - Native macOS Photo Gallery"));
      await register("menu-check-updates", () => handlersRef.current.showNotice("Check for updates - coming soon"));

      // Listen for native import progress events from scan/import commands.
      const unlistenProgress = await events.onImportProgress(({ phase, processed, total }) => {
        liveRef.current.library.setBusy(true);
        liveRef.current.library.setProgress({ phase, processed, total });
        if (processed >= total && total > 0) {
          liveRef.current.library.setBusy(false);
          liveRef.current.library.setProgress(null);
        }
      });
      unlisteners.push(unlistenProgress);
    };
    listen();

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const { library, viewer, screen, albumDialogOpen, albumPickerOpen, albumPendingDelete, itemPendingDelete, folderPendingRemove, sourcesSheetOpen } = liveRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // A slideshow owns the keyboard while it is open: its overlay handles
      // Escape/arrows/Space itself, and nothing underneath should react.
      if (useSlideshowStore.getState().isOpen) return;

      // While a modal is open, every key belongs to it (the dialogs own Enter
      // and Escape) instead of the global shortcut map.
      if (albumDialogOpen || albumPickerOpen || albumPendingDelete || itemPendingDelete || folderPendingRemove || sourcesSheetOpen) return;

      if (mod && key === "o") { e.preventDefault(); handlersRef.current.importFolder(); return; }
      if (mod && key === "i") { e.preventDefault(); handlersRef.current.importFiles(); return; }
      if (mod && key === "e") { e.preventDefault(); handlersRef.current.showNotice("Export - coming soon"); return; }
      if (mod && e.key === "\\") { e.preventDefault(); library.toggleSidebar(); return; }
      if (mod && e.altKey && key === "i") { e.preventDefault(); library.toggleInspector(); return; }
      if (mod && key === "f") {
        const target = e.target as HTMLElement;
        const isEditable = target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
        if (!isEditable) {
          e.preventDefault();
          const focusSearch = () => {
            const input = searchInputRef.current
              || (document.querySelector(".search-field input") as HTMLInputElement | null);
            input?.focus();
            input?.select();
          };
          // The search field only exists on the Library screen, so jump there
          // first and focus once the field has mounted. React needs a frame to
          // render the Library screen, so retry over a few frames.
          if (screen !== "Library") {
            setScreen("Library");
            let attempts = 0;
            const tryFocus = () => {
              const input = searchInputRef.current
                || (document.querySelector(".search-field input") as HTMLInputElement | null);
              if (input) {
                input.focus();
                input.select();
                return;
              }
              if (attempts++ < 10) requestAnimationFrame(tryFocus);
            };
            requestAnimationFrame(tryFocus);
          } else {
            focusSearch();
          }
        }
        return;
      }
      if (e.key === "ArrowRight") viewer.navigate(1);
      if (e.key === "ArrowLeft") viewer.navigate(-1);
      if (screen === "Viewer" && !mod && !e.altKey) {
        // "r" rotates, "x" flips horizontally - both are view-only transforms.
        // Plain F/H/E are reserved for Favorite/Hide/Edit per the shortcut map.
        const target = e.target as HTMLElement;
        const isEditable = target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
        if (isEditable) return;
        if (key === "r") { viewer.rotate(90); return; }
        if (key === "x") { viewer.toggleFlip(); return; }
      }
      if (e.key === "Escape") {
        if (screen === "Viewer") {
          viewer.close();
          setScreen("Library");
        } else if (library.showInspector) {
          library.toggleInspector();
        }
      }
      if (e.key === "Enter" && mod && screen === "Library" && library.inspectedId) {
        viewer.open();
        setScreen("Viewer");
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      unlisteners.forEach((un) => un());
    };
    // Mount-only. Handlers read fresh state through liveRef / handlersRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull the authoritative settings from SQLite once at startup so the app
  // chrome (appearance, accent, sidebar width) is correct even if the user
  // never opens Settings.
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  // Keep the in-app theme and the native window chrome (traffic lights /
  // window background) in sync with the resolved appearance. This lives here
  // (always mounted) rather than in Settings so closing Settings never leaves
  // the app frame on a stale theme.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        applyTheme({ appearance, accentColor });
        await getCurrentWindow().setTheme(dark ? "dark" : "light");
      } catch {
        /* browser preview - no native window */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dark, appearance, accentColor, systemDark]);

  const showNotice = useCallback((text: string) => {
    library.showNotice(text);
  }, [library]);

  // Slideshow is a mode over the current context, not a separate screen:
  // play the selection when there is one, otherwise the collection on screen
  // (album, folder, filter or search results).
  const playSlideshow = useCallback((ids?: string[]) => {
    const selection = ids && ids.length ? new Set(ids) : null;
    const scope = selection
      ? library.items.filter((item: MediaItem) => selection.has(item.id))
      : library.visibleItems;
    if (scope.length === 0) {
      showNotice("Add photos or videos to start a slideshow.");
      return;
    }
    // Read the action off the store instead of subscribing to it: advancing
    // slides should only re-render the overlay, never the whole app.
    useSlideshowStore.getState().open(scope, library.inspectedId);
  }, [library.items, library.visibleItems, library.inspectedId, showNotice]);

  const openAlbumDialog = useCallback((seedIds?: string[]) => {
    setAlbumDialogMode("create");
    setRenamingAlbumId(null);
    setAlbumSeedIds(seedIds && seedIds.length ? seedIds : null);
    setAlbumName("");
    setAlbumDialogOpen(true);
  }, []);

  const openRenameAlbumDialog = useCallback((album: any) => {
    setAlbumDialogMode("rename");
    setRenamingAlbumId(album.id);
    setAlbumSeedIds(null);
    setAlbumName(album.name);
    setAlbumDialogOpen(true);
  }, []);

  const closeAlbumDialog = useCallback(() => {
    if (creatingAlbum) return;
    setAlbumDialogOpen(false);
    setAlbumName("");
    setAlbumSeedIds(null);
    setRenamingAlbumId(null);
    setAlbumDialogMode("create");
  }, [creatingAlbum]);

  // Focus the name field as soon as the dialog mounts, and keep Escape working
  // even if focus somehow leaves the form.
  useEffect(() => {
    if (!albumDialogOpen) return;
    const frame = requestAnimationFrame(() => {
      albumInputRef.current?.focus();
      albumInputRef.current?.select();
    });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeAlbumDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [albumDialogOpen, closeAlbumDialog]);

  const submitAlbum = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = albumName.trim();
    if (!name || creatingAlbum) return;
    setCreatingAlbum(true);
    try {
      if (albumDialogMode === "rename" && renamingAlbumId) {
        await library.renameAlbum(renamingAlbumId, name);
        showNotice(`Renamed album to "${name}"`);
      } else {
        const seedIds = albumSeedIds ?? undefined;
        // The store updates the album list and posts the success notice.
        await library.createAlbum(name, seedIds);
      }
      setAlbumDialogOpen(false);
      setAlbumName("");
      setAlbumSeedIds(null);
      setRenamingAlbumId(null);
      setAlbumDialogMode("create");
    } catch (error) {
      showNotice(
        `Could not ${albumDialogMode === "rename" ? "rename" : "create"} album: ${describeError(error)}`
      );
    } finally {
      setCreatingAlbum(false);
    }
  };

  const openAlbumPicker = useCallback((itemIds?: string[]) => {
    const ids = (itemIds && itemIds.length ? itemIds : library.selectedIds).filter(Boolean);
    if (!ids.length) {
      showNotice("Select photos first, then add them to an album.");
      return;
    }
    setAlbumPickerItemIds(ids);
    setAlbumSearch("");
    setAlbumPickerOpen(true);
  }, [library.selectedIds, showNotice]);

  useEffect(() => {
    if (!albumPickerOpen) return;
    const frame = requestAnimationFrame(() => albumSearchRef.current?.focus());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setAlbumPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [albumPickerOpen]);

  const addPickedItemsToAlbum = async (album: any) => {
    if (!albumPickerItemIds.length || addingToAlbumId) return;
    setAddingToAlbumId(album.id);
    try {
      await library.addToAlbum(album.id, albumPickerItemIds);
      setAlbumPickerOpen(false);
    } catch (error) {
      showNotice(`Could not add to album: ${describeError(error)}`);
    } finally {
      setAddingToAlbumId(null);
    }
  };

  const createAlbumFromPicker = () => {
    const seedIds = albumPickerItemIds;
    setAlbumPickerOpen(false);
    openAlbumDialog(seedIds);
  };

  const confirmRemoveFromAlbum = async () => {
    if (!albumRemovePending) return;
    try {
      await library.removeFromAlbum(albumRemovePending.albumId, albumRemovePending.itemIds);
      showNotice(`Removed ${albumRemovePending.itemIds.length} item${albumRemovePending.itemIds.length === 1 ? "" : "s"} from album.`);
      setAlbumRemovePending(null);
    } catch (error) {
      showNotice(`Could not remove: ${describeError(error)}`);
    }
  };
  const confirmDeleteItem = async () => {
    if (!itemPendingDelete) return;
    try {
      await library.deleteItems(itemPendingDelete);
      showNotice(`Moved ${itemPendingDelete.length} item${itemPendingDelete.length === 1 ? "" : "s"} to Trash.`);
      setItemPendingDelete(null);
    } catch (error) {
      showNotice(`Could not delete: ${describeError(error)}`);
    }
  };

  useEffect(() => {
    if (!itemPendingDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setItemPendingDelete(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [itemPendingDelete]);
  const confirmDeleteAlbum = async () => {
    if (!albumPendingDelete || deletingAlbum) return;
    const wasActiveAlbum = library.activeAlbum === albumPendingDelete.id;
    setDeletingAlbum(true);
    try {
      await library.deleteAlbum(albumPendingDelete.id);
      if (wasActiveAlbum) setScreen("Albums");
      showNotice(`Deleted album "${albumPendingDelete.name}". Your photos remain in the library.`);
      setAlbumPendingDelete(null);
    } catch (error) {
      showNotice(`Could not delete album: ${describeError(error)}`);
    } finally {
      setDeletingAlbum(false);
    }
  };

  useEffect(() => {
    if (!albumPendingDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!deletingAlbum) setAlbumPendingDelete(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [albumPendingDelete, deletingAlbum]);

  const confirmRemoveFolder = async () => {
    if (!folderPendingRemove || removingFolder) return;
    setRemovingFolder(true);
    try {
      const removed = await library.removeFolder(folderPendingRemove.path);
      showNotice(
        removed > 0
          ? `Removed “${folderPendingRemove.name}” from Stillroom. ${removed.toLocaleString()} item${removed === 1 ? "" : "s"} dropped from the library — your files are still on disk.`
          : `Removed empty folder “${folderPendingRemove.name}” from Stillroom.`
      );
      setFolderPendingRemove(null);
    } catch (error) {
      showNotice(`Could not remove folder: ${describeError(error)}`);
    } finally {
      setRemovingFolder(false);
    }
  };

  useEffect(() => {
    if (!folderPendingRemove) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!removingFolder) setFolderPendingRemove(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [folderPendingRemove, removingFolder]);

  // The sources sheet owns Escape unless the remove-confirmation is stacked on
  // top of it (that dialog has its own handler above).
  useEffect(() => {
    if (!sourcesSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || folderPendingRemove) return;
      e.preventDefault();
      setSourcesSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sourcesSheetOpen, folderPendingRemove]);

  const importPathsIntoAlbum = async (paths: string[], albumId: string) => {
    const album = library.albums.find((a: any) => a.id === albumId);
    if (!album) {
      showNotice("That album no longer exists.");
      return;
    }
    if (!paths.length) return;

    try {
      showNotice(`Importing ${paths.length.toLocaleString()} file(s) into "${album.name}"…`);
      library.setBusy(true);
      library.setProgress({ phase: "importing", processed: 0, total: paths.length });
      const result = await tauri.library.importFiles(paths);
      if (!result.items.length) {
        library.setBusy(false);
        library.setProgress(null);
        showNotice("No supported media files selected.");
        return;
      }
      await tauri.albums.addItems(albumId, result.items.map((item: any) => item.id));
      await library.loadLibrary();
      library.setActiveAlbum(albumId);
      library.setBusy(false);
      library.setProgress(null);
      library.setFilter("All");
      setScreen("Library");
      showNotice(
        `Added ${result.items.length.toLocaleString()} ${result.items.length === 1 ? "item" : "items"} to "${album.name}".`
      );
    } catch (error) {
      library.setBusy(false);
      library.setProgress(null);
      showNotice(`Could not add items to the album: ${describeError(error)}`);
    }
  };

  const addItemsToAlbum = async (albumId: string) => {
    let paths: string[];
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }],
      });
      if (!selected) return;
      paths = Array.isArray(selected) ? selected : [selected];
    } catch (error) {
      showNotice(`Could not open the file picker: ${describeError(error)}`);
      return;
    }
    await importPathsIntoAlbum(paths, albumId);
  };
  importPathsIntoAlbumRef.current = importPathsIntoAlbum;

  // Native Finder drops are window-level events. While an album is open, a
  // drop adds the selected files to that album instead of doing nothing.
  useEffect(() => {
    if (screen !== "Library" || !library.activeAlbum) {
      setAlbumDragOver(false);
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const stop = await getCurrentWindow().onDragDropEvent((event: any) => {
          const payload = event.payload;
          if (payload.type === "over") {
            setAlbumDragOver(true);
          } else if (payload.type === "leave") {
            setAlbumDragOver(false);
          } else if (payload.type === "drop") {
            setAlbumDragOver(false);
            const albumId = liveRef.current.library.activeAlbum;
            if (albumId && payload.paths?.length) {
              void importPathsIntoAlbumRef.current(payload.paths, albumId);
            }
          }
        });
        if (cancelled) stop();
        else unlisten = stop;
      } catch {
        /* browser preview has no native drag/drop */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
      setAlbumDragOver(false);
    };
  }, [screen, library.activeAlbum]);

  // Force WebKit to relayout during macOS live window drags. The vh unit and
  // backing store don't update continuously while dragging a window edge,
  // exposing the native window background. Reading offsetHeight in a rAF loop
  // whenever the inner size changes triggers a layout pass so .app-frame
  // (position: fixed; inset: 0) tracks the real viewport edges.
  useEffect(() => {
    let raf: ReturnType<typeof requestAnimationFrame> | null = null;
    let prevW = window.innerWidth;
    let prevH = window.innerHeight;

    const loop = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w !== prevW || h !== prevH) {
        prevW = w;
        prevH = h;
        // Force a synchronous layout read so WebKit recalculates the viewport.
        void document.documentElement.offsetHeight;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const openAlbumMenu = (album: any, e: React.MouseEvent) => {
    openContextMenu(
      [
        {
          label: "Open Album",
          onClick: () => {
            library.setActiveAlbum(album.id);
            library.setFilter("All");
            library.setQuery("");
            setScreen("Library");
          },
        },
        { label: "Rename Album…", onClick: () => openRenameAlbumDialog(album) },
        { label: "Add Items…", onClick: () => addItemsToAlbum(album.id) },
        { divider: true },
        { label: "Delete Album…", danger: true, onClick: () => setAlbumPendingDelete(album) },
      ],
      e
    );
  };

  const openScreen = (next: Screen) => {
    // The Library item in the sidebar is the way back to the whole
    // collection; without this, an active album kept filtering the grid and
    // Library still looked empty after leaving the album.
    if (next === "Library" && library.activeAlbum) {
      library.setActiveAlbum(null);
    }
    // The Albums screen is an overview, so a previously opened album should
    // not stay highlighted in the sidebar while every album is on screen.
    if (next === "Albums" && library.activeAlbum) {
      library.setActiveAlbum(null);
    }
    // Navigating away from Viewer should close it
    if (screen === "Viewer" && next !== "Viewer") {
      viewer.close();
    }
    if (next === "Viewer") {
      viewer.open();
      if (!library.inspectedId && library.viewerItems.length > 0) {
        library.inspectItem(library.viewerItems[0].id);
      }
    }
    if (next === "Edit") {
      const selectedItem = library.items.find(i => i.id === library.inspectedId);
      if (selectedItem && selectedItem.kind === "photo") {
        edit.open(selectedItem);
      }
    }
    if (next === "Vault") vault.loadStatus();
    setScreen(next);
  };

  const navigatePhoto = (delta: number) => {
    if (library.playableItems.length === 0) return;
    const nextIndex = (library.currentIndex + delta + library.playableItems.length) % library.playableItems.length;
    // Arrow keys move inspection only - the multi-selection survives.
    library.inspectItem(library.playableItems[nextIndex].id);
  };


const importFiles = async () => {
  let paths: string[];
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }]
    });
    if (!selected) return;
    paths = Array.isArray(selected) ? selected : [selected];
  } catch (e) {
    showNotice(`Could not open the file picker: ${describeError(e)}`);
    return;
  }

  try {
    showNotice(`Importing ${paths.length.toLocaleString()} file(s)…`);
    library.setBusy(true);
    library.setProgress({ phase: "importing", processed: 0, total: paths.length });
    const result = await tauri.library.importFiles(paths);
    await library.loadLibrary();
    library.setBusy(false);
    library.setProgress(null);
    showNotice(
      result.items.length
        ? `Imported ${result.items.length.toLocaleString()} file(s).`
        : "No supported media files selected."
    );
  } catch (e) {
    library.setBusy(false);
    library.setProgress(null);
    showNotice(`Import failed: ${describeError(e)}`);
  }
};

const importFolder = async () => {
  // Pick the folder first, so a picker problem is never reported as a scan
  // problem (and a genuine cancel stays silent).
  let rootPath: string;
  try {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    rootPath = Array.isArray(selected) ? selected[0] : selected;
  } catch (e) {
    showNotice(`Could not open the folder picker: ${describeError(e)}`);
    return;
  }

  try {
    showNotice(`Scanning ${rootPath}…`);
    library.setBusy(true);
    library.setProgress({ phase: "scanning", processed: 0, total: 0 });
    const result = await tauri.library.scan(rootPath);
    await library.loadLibrary();
    library.setBusy(false);
    library.setProgress(null);
    showNotice(
      result.items.length
        ? `Imported ${result.items.length.toLocaleString()} ${result.items.length === 1 ? "item" : "items"} from ${rootPath}`
        : "No media files found in that folder."
    );
  } catch (e) {
    library.setBusy(false);
    library.setProgress(null);
    showNotice(`Scan failed: ${describeError(e)}`);
  }
};

handlersRef.current = { importFolder, importFiles, showNotice };

  return (
    <div
      className={`app-frame ${dark ? "dark" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <header className="topbar" onMouseDown={beginTopbarDrag} onDoubleClick={handleTopbarDoubleClick}>
        <div className="topbar-brand"><BrandMark size={26} /><b>Stillroom</b></div>
        <div className="topbar-context">
          {(() => {
            const activeAlbumRecord = library.activeAlbum
              ? library.albums.find((a: any) => a.id === library.activeAlbum)
              : null;
            const activeAlbumName = library.activeAlbum ? activeAlbumRecord?.name : null;
            const inAlbum = Boolean(library.activeAlbum);
            const filter = library.filter;

            if (screen === "Library") {
              if (inAlbum) return <span>{activeAlbumName}</span>;
              return <span className="muted">Library</span>;
            }
            if (screen === "Albums") return <span>Albums</span>;
            return <span>{screen}</span>;
          })()}
          {library.busy && <span className="topbar-busy">Indexing…</span>}
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={library.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={library.sidebarOpen ? "Hide sidebar (⌥⌘S)" : "Show sidebar (⌥⌘S)"}
            onClick={() => library.toggleSidebar()}
          >
            <LibraryIcon size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={library.showInspector ? "Hide inspector" : "Show inspector"}
            title={library.showInspector ? "Hide inspector (⌥⌘I)" : "Show inspector (⌥⌘I)"}
            onClick={() => library.toggleInspector()}
          >
            <InspectorIcon size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
            title={dark ? "Switch to light appearance" : "Switch to dark appearance"}
            onClick={() => settings.update("appearance", dark ? "light" : "dark")}
          >
            {dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <button className="icon-button" type="button" aria-label="Settings" title="Settings" onClick={() => openScreen("Settings")}>
            <GearIcon size={18} />
          </button>
        </div>
      </header>

      <div className={`app-body ${library.sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-label">WORKSPACE</div>
            <nav className="primary-nav" aria-label="Main navigation">
              {[
                { label: "Library", Icon: LibraryIcon, screen: "Library" as Screen },
                { label: "Albums", Icon: AlbumsIcon, screen: "Albums" as Screen },
                { label: "Viewer", Icon: ViewerIcon, screen: "Viewer" as Screen },
                { label: "Explore", Icon: ExploreIcon, screen: "Explore" as Screen },
                { label: "Duplicates", Icon: DuplicatesIcon, screen: "Duplicates" as Screen },
                { label: "Edit", Icon: EditIcon, screen: "Edit" as Screen },
                { label: "Batch", Icon: BatchIcon, screen: "Batch" as Screen },
                { label: "Vault", Icon: VaultIcon, screen: "Vault" as Screen },
              ].map(({ label, Icon, screen: target }) => (
                <button
                  key={label}
                  type="button"
                  className={`nav-item ${screen === target ? "active" : ""}`}
                  onClick={() => openScreen(target)}
                >
                  <span className="nav-icon"><Icon size={18} /></span>
                  <span>{label}</span>
                  {(label === "Library" && library.items.length > 0) ||
                  (label === "Albums" && library.albums.length > 0) ? (
                    <span className="nav-badge">
                      {label === "Library" ? library.items.length : library.albums.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>

          <div className="sidebar-divider" aria-hidden="true" />

          <div className="sidebar-section sources-entry-section">
            <button
              type="button"
              className="sources-entry"
              onClick={() => setSourcesSheetOpen(true)}
              title="Manage library sources"
            >
              <span className="sources-entry-icon"><FolderIcon size={16} /></span>
              <span className="sources-entry-text">
                <span className="sources-entry-name">All Sources</span>
                <span className="sources-entry-count">
                  {library.folders.length.toLocaleString()} folder{library.folders.length === 1 ? "" : "s"}
                  {" · "}
                  {library.folders.reduce((total: number, folder: LibraryFolder) => total + folder.itemCount, 0).toLocaleString()} items
                </span>
              </span>
              <span className="sources-entry-chevron" aria-hidden="true">›</span>
            </button>
          </div>

          <div className="sidebar-divider" aria-hidden="true" />

          <div className="sidebar-section">
            <div className="sidebar-section-label">LIBRARY</div>
            <div className="library-stats">
              <div className="stat-row">
                <KindDot kind="photo" />
                <span className="stat-label">Photos</span>
                <span className="stat-value">
                  {libraryStats.photos.toLocaleString()}
                  <span className="stat-size">· {formatBytesSimple(libraryStats.photoSize)}</span>
                </span>
              </div>
              <div className="stat-row">
                <KindDot kind="video" />
                <span className="stat-label">Videos</span>
                <span className="stat-value">
                  {libraryStats.videos.toLocaleString()}
                  <span className="stat-size">· {formatBytesSimple(libraryStats.videoSize)}</span>
                </span>
              </div>
              <div className="stat-row">
                <KindDot kind="raw" />
                <span className="stat-label">RAW</span>
                <span className="stat-value">
                  {libraryStats.raws.toLocaleString()}
                  <span className="stat-size">· {formatBytesSimple(libraryStats.rawSize)}</span>
                </span>
              </div>
              <div className="stat-row">
                <KindDot kind="photo" />
                <span className="stat-label">Favorites</span>
                <span className="stat-value">
                  {libraryStats.favorites.toLocaleString()}
                  <span className="stat-size">· {formatBytesSimple(libraryStats.favoriteSize)}</span>
                </span>
              </div>
              <div className="stat-row hidden">
                <KindDot kind="photo" />
                <span className="stat-label">Hidden</span>
                <span className="stat-value">
                  {libraryStats.hidden.toLocaleString()}
                  <span className="stat-size">· {formatBytesSimple(libraryStats.hiddenSize)}</span>
                </span>
              </div>
              <div className="stat-row size">
                <span className="stat-label">Total</span>
                <span className="stat-value">
                  {library.items.length.toLocaleString()} · {formatBytesSimple(libraryStats.totalSize)}
                </span>
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          {screen === "Library" && <LibraryScreen
            items={library.visibleItems}
            inspectedId={library.inspectedId}
            selectedIds={library.selectedIds}
            filter={library.filter}
            query={library.query}
            layout={library.layout}
            showInspector={library.showInspector}
            activeAlbum={library.activeAlbum}
            albums={library.albums}
            onInspectItem={library.inspectItem}
            onToggleSelect={library.toggleSelection}
            onSelectRange={library.selectRange}
            onToggleSelectAll={library.toggleSelectAll}
            onClearSelection={library.clearSelection}
            onChangeFilter={library.setFilter}
            onChangeQuery={library.setQuery}
            onChangeLayout={library.setLayout}
            onToggleInspector={library.toggleInspector}
            onSetActiveAlbum={library.setActiveAlbum}
            onOpenAlbums={() => openScreen("Albums")}
            onAddItems={(albumId: string) => addItemsToAlbum(albumId)}
            onOpenAlbumPicker={(itemIds?: string[]) => openAlbumPicker(itemIds)}
            onAlbumMenu={(e: React.MouseEvent) => {
              const album = library.albums.find((a: any) => a.id === library.activeAlbum);
              if (album) openAlbumMenu(album, e);
            }}
            albumDragOver={albumDragOver}
            onToggleFavorite={library.toggleFavorite}
            onToggleHidden={library.toggleHidden}
            onSetFavoriteForIds={library.setFavoriteForIds}
            onSetHiddenForIds={library.setHiddenForIds}
            onUpdateTags={library.updateItemTags}
            onDeleteItems={library.deleteItems}
            onRequestDeleteItems={(ids: string[]) => setItemPendingDelete(ids)}
            onRequestRemoveFromAlbum={(albumId: string, itemIds: string[]) => setAlbumRemovePending({ albumId, itemIds })}
            onOpenViewer={(id?: string) => { viewer.open(id); setScreen("Viewer"); }}
            onOpenEdit={(item: any) => { edit.open(item); setScreen("Edit"); }}
            onImportFolder={() => importFolder()}
            onImportFiles={() => importFiles()}
            onPlaySlideshow={playSlideshow}
            onCreateAlbum={openAlbumDialog}
            searchInputRef={searchInputRef}
            onContextMenu={openContextMenu}
            busy={library.busy}
            progress={library.progress}
            notice={showNotice}
            assetUrl={assetUrl}
            hiddenCount={library.hiddenCount}
          />}

          {screen === "Albums" && <AlbumsScreen
            albums={library.albums}
            items={library.items}
            assetUrl={assetUrl}
            onCreateAlbum={openAlbumDialog}
            onAlbumContextMenu={openAlbumMenu}
            onOpenAlbum={(albumId: string) => {
              library.setActiveAlbum(albumId);
              library.setFilter("All");
              library.setQuery("");
              setScreen("Library");
            }}
          />}

          {screen === "Viewer" && <ViewerScreen
            items={library.viewerItems}
            selected={library.viewerSelected}
            zoom={viewer.zoom}
            fitMode={viewer.fitMode}
            rotation={viewer.rotation}
            flipX={viewer.flipX}
            onNavigate={viewer.navigate}
            onSetPhoto={(id: string) => library.inspectItem(id)}
            onSetZoom={viewer.setZoom}
            onZoomIn={viewer.zoomIn}
            onZoomOut={viewer.zoomOut}
            onResetZoom={viewer.resetZoom}
            onToggleFitMode={viewer.toggleFitMode}
            onRotate={viewer.rotate}
            onToggleFlip={viewer.toggleFlip}
            onResetTransform={viewer.resetTransform}
            onToggleFullscreen={viewer.toggleFullscreen}
            onClose={viewer.close}
            onToggleFavorite={library.toggleFavorite}
            onToggleHidden={library.toggleHidden}
            onOpenEdit={(item: any) => { edit.open(item); setScreen("Edit"); }}
            onPlaySlideshow={playSlideshow}
            onContextMenu={openContextMenu}
            assetUrl={assetUrl}
          />}

          {screen === "Edit" && <EditScreen
            item={edit.item}
            values={edit.values}
            crop={edit.crop}
            history={edit.history}
            historyIndex={edit.historyIndex}
            onSetValue={edit.setValue}
            onSetValues={edit.setValues}
            onReset={edit.reset}
            onAuto={edit.auto}
            onRotate={edit.rotate}
            onFlip={edit.flip}
            onSetCrop={edit.setCrop}
            onResetCrop={edit.resetCrop}
            onUndo={edit.undo}
            onRedo={edit.redo}
            canUndo={edit.canUndo}
            canRedo={edit.canRedo}
            onClose={edit.close}
            onSaveDraft={edit.saveDraft}
            onBack={() => setScreen("Library")}
            onExport={async (inPlace = false) => {
              const item = edit.item;
              if (!item) return;
              if (inPlace) {
                const ok = window.confirm("This will overwrite the original file with the edited version. This cannot be undone. Continue?");
                if (!ok) return;
              }
              try {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = assetUrl(item.path);
                await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; });
              const v = edit.values || {};
              const crop = edit.crop || { enabled: false, x:0,y:0,width:1,height:1 };
              const useCrop = !!crop.enabled;
              const srcX = useCrop ? crop.x * img.naturalWidth : 0;
              const srcY = useCrop ? crop.y * img.naturalHeight : 0;
              const srcW = useCrop ? crop.width * img.naturalWidth : img.naturalWidth;
              const srcH = useCrop ? crop.height * img.naturalHeight : img.naturalHeight;
              const rot = ((v.rotation || 0) % 360 + 360) % 360;
              const swap = rot === 90 || rot === 270;
              const baseW = srcW;
              const baseH = srcH;
              const canvas = document.createElement("canvas");
              canvas.width = swap ? baseH : baseW;
              canvas.height = swap ? baseW : baseH;
              const ctx = canvas.getContext("2d");
              if (!ctx) { showNotice("Export failed"); return; }
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((rot * Math.PI) / 180);
              ctx.scale(v.flip ? -1 : 1, 1);
              ctx.filter = "brightness(" + (100 + (v.exposure || 0)) + "%) contrast(" + (100 + (v.contrast || 0)) + "%) saturate(" + (100 + (v.saturation || 0)) + "%)";
              ctx.drawImage(img, srcX, srcY, srcW, srcH, -baseW / 2, -baseH / 2, baseW, baseH);
                const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
                if (!blob) { showNotice("Export failed"); return; }
                let path: any;
                if (inPlace) {
                  path = item.path;
                } else {
                  path = await save({
                    defaultPath: String(item.name).replace(/\.[^.]+$/, "") + "_edited.jpg",
                    filters: [{ name: "JPEG image", extensions: ["jpg", "jpeg"] }],
                  });
                  if (!path) { showNotice("Export cancelled"); return; }
                }
                const buf = await blob.arrayBuffer();
                await invoke("save_file", { path, bytes: Array.from(new Uint8Array(buf)) });
                try { localStorage.removeItem(`edit:draft:${item.id}`); } catch {}
                showNotice(inPlace ? "Replaced original" : "Exported edited copy");
              } catch (e) {
                showNotice("Export failed");
              }
            }}
            onClearDraft={edit.clearDraft}
            onNotice={showNotice}
            assetUrl={assetUrl}
            items={library.items.filter((i: any) => i.kind === "photo")}
            onOpenEdit={(item: any) => { edit.saveDraft(); edit.open(item); }}
          />}

          {screen === "Batch" && <BatchScreen
            items={library.items.filter((i: any) => library.selectedIds.includes(i.id))}
            selectedIds={library.selectedIds}
            config={batch}
            state={batch}
            onSetPattern={batch.setPattern}
            onSetFormat={batch.setFormat}
            onSetQuality={batch.setQuality}
            onSetStripMetadata={batch.setStripMetadata}
            onSetMaxDimension={batch.setMaxDimension}
            onSetStep={batch.setStep}
            onExportBatch={batch.exportBatch}
            onReset={batch.reset}
            onOpenLibrary={() => setScreen("Library")}
            busy={batch.busy}
            progress={batch.progress}
            result={batch.result}
            assetUrl={assetUrl}
          />}

          {screen === "Vault" && <VaultScreen
            enabled={vault.enabled}
            unlocked={vault.unlocked}
            items={vault.items}
            autoLock={vault.autoLockMinutes}
            onUnlock={vault.unlock}
            onLock={vault.lock}
            onAddItems={(ids: any) => { vault.addItems(ids); }}
            onRemoveItems={vault.removeItems}
            onToggleEnabled={(e: any) => vault.toggleEnabled(e)}
            onSetAutoLock={(m: any) => vault.setAutoLock(m)}
            notice={showNotice}
          />}

          {screen === "Explore" && <ExploreScreen items={library.items.filter((i: any) => !i.hidden)} assetUrl={assetUrl} onNavigate={setScreen} />}

          {screen === "Duplicates" && <DuplicatesScreen
            groups={library.duplicates}
            onScan={library.scanDuplicates}
            onClear={library.clearDuplicates}
            busy={library.busy}
            assetUrl={assetUrl}
          />}

          {screen === "Settings" && <SettingsScreen
            onAddFolder={() => importFolder()}
            onRemoveFolder={(folder: LibraryFolder) => setFolderPendingRemove(folder)}
          />}
        </main>
      </div>

      {library.busy && library.progress && (
        <div className="busy-indicator" role="status">
          <span className="spinner" />
          {library.progress.phase} {library.progress.processed}/{library.progress.total}
        </div>
      )}

      {library.notice && (
        <div className="toast" role="status" onClick={() => library.showNotice("")}>
          <span>✓</span>{library.notice}
        </div>
      )}

      {albumDialogOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAlbumDialog();
          }}
        >
          <form
            className="album-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="album-dialog-title"
            onSubmit={submitAlbum}
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">ORGANISE</p>
                <h2 id="album-dialog-title">
                  {albumDialogMode === "rename" ? "Rename album" : "New album"}
                </h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close"
                onClick={closeAlbumDialog}
                disabled={creatingAlbum}
              >
                ×
              </button>
            </div>
            <div className="dialog-field">
              <label htmlFor="album-name">Album name</label>
              <input
                id="album-name"
                ref={albumInputRef}
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
                placeholder="e.g. Summer 2026"
                maxLength={80}
                autoComplete="off"
                disabled={creatingAlbum}
              />
            </div>
            <p className="dialog-hint">
              {albumDialogMode === "rename"
                ? "This only changes the album name. Photos stay in this album."
                : (() => {
                    const count = albumSeedIds?.length ?? (library.selectedIds.length || (library.inspectedId ? 1 : 0));
                    return count
                      ? `Adds ${count.toLocaleString()} item${count === 1 ? "" : "s"} to the new album.`
                      : "You can add photos to it from the library or an album at any time.";
                  })()}
            </p>
            <div className="dialog-actions">
              <button type="button" className="quiet-button" onClick={closeAlbumDialog} disabled={creatingAlbum}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={!albumName.trim() || creatingAlbum}>
                {creatingAlbum
                  ? albumDialogMode === "rename" ? "Saving…" : "Creating…"
                  : albumDialogMode === "rename" ? "Save name" : "Create album"}
              </button>
            </div>
          </form>
        </div>
      )}

      {albumPickerOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !addingToAlbumId) setAlbumPickerOpen(false);
          }}
        >
          <div
            className="album-dialog album-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="album-picker-title"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">ORGANISE</p>
                <h2 id="album-picker-title">Add to album</h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close"
                onClick={() => setAlbumPickerOpen(false)}
                disabled={Boolean(addingToAlbumId)}
              >
                ×
              </button>
            </div>
            <p className="album-picker-subtitle">
              {albumPickerItemIds.length.toLocaleString()} selected item{albumPickerItemIds.length === 1 ? "" : "s"}
            </p>

            <div className="album-picker-search">
              <SearchIcon size={15} />
              <input
                ref={albumSearchRef}
                value={albumSearch}
                onChange={(e) => setAlbumSearch(e.target.value)}
                placeholder="Search albums"
                aria-label="Search albums"
                disabled={Boolean(addingToAlbumId)}
              />
              {albumSearch && (
                <button
                  type="button"
                  className="album-picker-search-clear"
                  aria-label="Clear album search"
                  onClick={() => {
                    setAlbumSearch("");
                    albumSearchRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </div>

            <div className="album-picker-list" role="listbox" aria-label="Albums">
              {(() => {
                const selectedItems = library.items.filter((item: any) =>
                  albumPickerItemIds.includes(item.id)
                );
                const query = albumSearch.trim().toLowerCase();
                const matching = library.albums.filter((album: any) =>
                  !query || album.name.toLowerCase().includes(query)
                );
                if (!matching.length) {
                  return (
                    <div className="album-picker-empty">
                      <AlbumsIcon size={24} />
                      <b>{library.albums.length ? "No matching albums" : "No albums yet"}</b>
                      <p>
                        {library.albums.length
                          ? "Try a different search."
                          : "Create an album and these photos will be added to it."}
                      </p>
                    </div>
                  );
                }
                return matching.map((album: any, index: number) => {
                  const alreadyAdded = selectedItems.length > 0 && selectedItems.every((item: any) =>
                    item.albumIds?.includes(album.id)
                  );
                  const busy = addingToAlbumId === album.id;
                  return (
                    <button
                      key={album.id}
                      type="button"
                      className="album-picker-row"
                      onClick={() => addPickedItemsToAlbum(album)}
                      disabled={Boolean(addingToAlbumId) || alreadyAdded}
                      role="option"
                      aria-selected="false"
                    >
                      <i className={`album-dot ${["coral", "violet", "blue", "green"][index % 4]}`} />
                      <span className="album-picker-name">{album.name}</span>
                      <span className="album-picker-count">
                        {alreadyAdded
                          ? "Already added"
                          : (() => {
                              const count = album.itemCount || 0;
                              return `${count.toLocaleString()} ${count === 1 ? "item" : "items"}`;
                            })()}
                      </span>
                      {busy && <span className="spinner album-picker-spinner" />}
                    </button>
                  );
                });
              })()}
            </div>

            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setAlbumPickerOpen(false)}
                disabled={Boolean(addingToAlbumId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={createAlbumFromPicker}
                disabled={Boolean(addingToAlbumId)}
              >
                <PlusIcon size={14} /> New album
              </button>
            </div>
          </div>
        </div>
      )}

      {albumPendingDelete && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deletingAlbum) setAlbumPendingDelete(null);
          }}
        >
          <div
            className="album-dialog delete-album-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-album-title"
            aria-describedby="delete-album-description"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">ALBUM</p>
                <h2 id="delete-album-title">Delete Album?</h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close"
                onClick={() => setAlbumPendingDelete(null)}
                disabled={deletingAlbum}
              >
                ×
              </button>
            </div>
            <p className="delete-album-copy">
              Are you sure you want to delete <b>“{albumPendingDelete.name}”</b>?
            </p>
            <div className="delete-album-safety" id="delete-album-description">
              <span><AlbumsIcon size={19} /></span>
              <p>
                <b>Your photos are safe.</b> This only removes the album and its grouping.
                {" "}
                {albumPendingDelete.itemCount
                  ? `${albumPendingDelete.itemCount.toLocaleString()} item${albumPendingDelete.itemCount === 1 ? "" : "s"} will remain in your library.`
                  : "The items remain in your library."}
              </p>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setAlbumPendingDelete(null)}
                disabled={deletingAlbum}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmDeleteAlbum}
                disabled={deletingAlbum}
              >
                {deletingAlbum ? "Deleting…" : "Delete Album"}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemPendingDelete && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setItemPendingDelete(null); }}
        >
          <div className="album-dialog delete-album-dialog" role="alertdialog" aria-modal="true">
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">PHOTO</p>
                <h2>Delete Item?</h2>
              </div>
              <button type="button" className="dialog-close" aria-label="Close" onClick={() => setItemPendingDelete(null)}>×</button>
            </div>
            <p className="delete-album-copy">
              Are you sure you want to delete <b>{itemPendingDelete.length} item{itemPendingDelete.length === 1 ? "" : "s"}</b>? They will be moved to Trash.
            </p>
            <div className="dialog-actions">
              <button type="button" className="quiet-button" onClick={() => setItemPendingDelete(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={confirmDeleteItem}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {albumRemovePending && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAlbumRemovePending(null); }}>
          <div className="album-dialog delete-album-dialog" role="alertdialog" aria-modal="true">
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">ALBUM</p>
                <h2>Remove from Album?</h2>
              </div>
              <button type="button" className="dialog-close" aria-label="Close" onClick={() => setAlbumRemovePending(null)}>×</button>
            </div>
            <p className="delete-album-copy">
              Remove {albumRemovePending.itemIds.length} item{albumRemovePending.itemIds.length === 1 ? "" : "s"} from this album?
            </p>
            <div className="dialog-actions">
              <button type="button" className="quiet-button" onClick={() => setAlbumRemovePending(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={confirmRemoveFromAlbum}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {sourcesSheetOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSourcesSheetOpen(false);
          }}
        >
          <div
            className="album-dialog sources-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sources-sheet-title"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">LIBRARY</p>
                <h2 id="sources-sheet-title">Sources</h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close"
                onClick={() => setSourcesSheetOpen(false)}
              >
                ×
              </button>
            </div>
            <SourcesManager
              variant="sheet"
              onAddFolder={() => importFolder()}
              onRemoveFolder={(folder: LibraryFolder) => setFolderPendingRemove(folder)}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setSourcesSheetOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {folderPendingRemove && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !removingFolder) setFolderPendingRemove(null);
          }}
        >
          <div
            className="album-dialog delete-album-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-folder-title"
            aria-describedby="remove-folder-description"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">FOLDER</p>
                <h2 id="remove-folder-title">Remove Folder?</h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Close"
                onClick={() => setFolderPendingRemove(null)}
                disabled={removingFolder}
              >
                ×
              </button>
            </div>
            <p className="delete-album-copy">
              Remove <b>“{folderPendingRemove.name}”</b> from Stillroom?
            </p>
            <div className="delete-album-safety" id="remove-folder-description">
              <span><FolderIcon size={19} /></span>
              <p>
                <b>Your files are safe.</b>{" "}
                {folderPendingRemove.itemCount > 0
                  ? `This only unstages the folder and its ${folderPendingRemove.itemCount.toLocaleString()} item${folderPendingRemove.itemCount === 1 ? "" : "s"} from the library.`
                  : "This only removes the empty folder entry from the library."}{" "}
                Nothing is deleted from disk — import the folder again to bring it back.
              </p>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setFolderPendingRemove(null)}
                disabled={removingFolder}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmRemoveFolder}
                disabled={removingFolder}
              >
                {removingFolder ? "Removing…" : "Remove Folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SlideshowOverlay assetUrl={assetUrl} />

      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ===== SCREEN COMPONENTS =====

// A <video> on its own only paints a poster once playback starts, so every video
// tile used to render solid black. Seeking a fraction of a second after the
// metadata arrives makes the webview decode and paint a real frame.
function VideoThumb({ src, name, className }: { src: string; name?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const seek = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      try {
        video.currentTime = Math.min(0.15, duration / 2);
      } catch {
        /* seeking can fail on very short or broken files; the frame stays blank */
      }
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => video.removeEventListener("loadedmetadata", seek);
  }, [src]);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      title={name}
      muted
      playsInline
      preload="metadata"
    />
  );
}

function VideoPlayer({ src, name, onFullscreen }: { src: string; name?: string; onFullscreen?: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    setPlaying(false);
    setTime(0);
    setDuration(0);

    const onMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      try { video.currentTime = Math.min(0.15, (video.duration || 1) / 2); } catch { /* ignore */ }
    };
    const onTimeUpdate = () => setTime(video.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    return () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
    };
  }, [src]);

  // Keyboard shortcuts for video (when focused)
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, video.currentTime - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(Math.min(video.duration || 0, video.currentTime + 5));
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        onFullscreen?.();
      }
    };
    video.addEventListener("keydown", handleKeyDown);
    return () => video.removeEventListener("keydown", handleKeyDown);
  }, [onFullscreen]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  const seek = (value: number) => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = value;
    setTime(value);
  };

  return (
    <>
      <video ref={ref} className="viewer-video" src={src} title={name} playsInline preload="metadata" onClick={toggle} tabIndex={0} />
      {/* macOS hides a video's native control bar unless the pointer is over the
          frame, so playback gets a permanent bar of our own instead. */}
      <div className="viewer-video-controls">
        <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
        </button>
        <span className="video-time">{formatDuration(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
        />
        <span className="video-time">{formatDuration(duration)}</span>
        {onFullscreen && (
          <button type="button" onClick={onFullscreen} aria-label="Full screen"><FullscreenIcon size={14} /></button>
        )}
      </div>
    </>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// How many tiles to mount before the user scrolls further. Small enough to
// keep filtering/typing snappy, large enough to fill a tall window.
const GALLERY_PAGE_SIZE = 180;

function LibraryScreen(props: any) {
  const library = useLibraryStore();
  const assetUrl = props.assetUrl;
  // `activeAlbum` is the album id; the heading needs its display name.
  const activeAlbumRecord = props.activeAlbum
    ? props.albums?.find((album: any) => album.id === props.activeAlbum)
    : null;
  const activeAlbumName = props.activeAlbum ? activeAlbumRecord?.name ?? "Album" : null;
  const inAlbum = Boolean(props.activeAlbum);
  const activeAlbumItems = useMemo(
    () => props.activeAlbum
      ? library.items.filter((item: any) => item.albumIds?.includes(props.activeAlbum))
      : [],
    [library.items, props.activeAlbum],
  );
  const activeAlbumPhotos = useMemo(
    () => activeAlbumItems
      .filter((item: any) => item.kind === "photo" || item.kind === "video")
      .slice(0, 3),
    [activeAlbumItems],
  );
  const activeAlbumCount = activeAlbumItems.length || activeAlbumRecord?.itemCount || 0;
  const albumEmpty = inAlbum && activeAlbumCount === 0;
  // Filter counts should describe the collection on screen, not the whole
  // library while an album or a source is selected.
  const sourceItems = useMemo(() => {
    if (!library.activeSource) return library.items;
    const prefix = `${library.activeSource.replace(/\/$/, "")}/`;
    return library.items.filter(
      (item: any) => item.path === library.activeSource || item.path.startsWith(prefix),
    );
  }, [library.items, library.activeSource]);
  const filterSource = inAlbum ? activeAlbumItems : sourceItems;
  // The SHOW row used to run one full filter pass per chip on every render.
  // One pass keeps the counts in sync and is O(n) instead of 6 × O(n).
  const filterCounts = useMemo(() => {
    const counts = { All: 0, Photos: 0, Videos: 0, RAW: 0, Favorites: 0, Hidden: 0 };
    for (const item of filterSource) {
      if (item.hidden) {
        counts.Hidden += 1;
        continue;
      }
      counts.All += 1;
      if (item.kind === "photo") counts.Photos += 1;
      else if (item.kind === "video") counts.Videos += 1;
      else if (item.kind === "raw") counts.RAW += 1;
      if (item.favorite) counts.Favorites += 1;
    }
    return counts;
  }, [filterSource]);
  const clearEmptyView = () => {
    props.onChangeQuery("");
    props.onChangeFilter("All");
    library.setActiveSource(null);
  };

  const emptyView = () => (
    <div
      className={`empty-state${albumEmpty ? " album-empty-dropzone" : ""}${albumEmpty && props.albumDragOver ? " is-dragging" : ""}`}
      style={{ gridColumn: "1/-1" }}
    >
      <span>{albumEmpty ? <AlbumsIcon size={30} /> : <ImageOffIcon size={28} />}</span>
      <b>{albumEmpty ? (props.albumDragOver ? "Drop to add to this album" : "This album is empty") : "No photos match"}</b>
      <p>
        {albumEmpty
          ? "Drag files here or use Add Items. You can also select photos in Library and choose Add to album."
          : "Try another filter or search."}
      </p>
      {albumEmpty ? (
        <div className="album-empty-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => props.onAddItems?.(props.activeAlbum)}
          >
            <PlusIcon size={14} /> Add Items
          </button>
          <button
            className="quiet-button"
            type="button"
            onClick={() => {
              props.onSetActiveAlbum?.(null);
              props.onChangeFilter?.("All");
              props.onChangeQuery?.("");
            }}
          >
            Browse Library
          </button>
        </div>
      ) : (
        <button type="button" onClick={clearEmptyView}>Clear filters</button>
      )}
    </div>
  );

  // Progressive rendering. A library can hold tens of thousands of items and
  // mounting a tile for every one makes typing, clicking and filtering janky
  // (the whole grid reconciles on each state change). Render a page at a time
  // and extend it as the user scrolls, so the DOM stays small.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [renderLimit, setRenderLimit] = useState(GALLERY_PAGE_SIZE);

  // A new view starts at the top of the list again.
  useEffect(() => {
    setRenderLimit(GALLERY_PAGE_SIZE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [props.filter, props.query, props.activeAlbum, library.activeSource, props.layout]);

  const loadMore = () => {
    setRenderLimit((n) => Math.min(n + GALLERY_PAGE_SIZE, props.items.length));
  };

  const handleGridScroll = () => {
    const el = scrollRef.current;
    if (!el || renderLimit >= props.items.length) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 800) loadMore();
  };

  const renderedItems = props.items.slice(0, renderLimit);

  // Group items by year-month for timeline layout
  const timelineGroups: { label: string; items: any[] }[] = props.layout === "timeline"
    ? (Object.entries(
        renderedItems.reduce((acc: Record<string, any[]>, item: any) => {
          const d = new Date(item.modifiedAt);
          const key = d.toLocaleString("en", { year: "numeric", month: "long" });
          (acc[key] = acc[key] || []).push(item);
          return acc;
        }, {} as Record<string, any[]>)
      ) as [string, any[]][]).map(([label, items]) => ({ label, items }))
    : [];

  const lastClickedRef = useRef<string | null>(null);

  // Interaction contract:
  //  - plain single click → inspect the item (Inspector follows; selection untouched)
  //  - shift-click → range-select from the last clicked tile
  //  - Cmd/Ctrl-click → toggle selection membership (inspection untouched)
  //  - double click → inspect + open the viewer on exactly that item
  //  - checkbox → toggle selection membership only
  const handleTileClick = (item: any, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== item.id) {
      props.onSelectRange?.(lastClickedRef.current, item.id);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      props.onToggleSelect?.(item.id);
      lastClickedRef.current = item.id;
      return;
    }
    props.onInspectItem?.(item.id);
    lastClickedRef.current = item.id;
  };

  const handleTileDoubleClick = (item: any) => {
    lastClickedRef.current = item.id;
    props.onInspectItem?.(item.id);
    props.onOpenViewer?.(item.id);
  };

  const tileClass = (item: any) =>
    `gallery-tile${props.inspectedId === item.id ? " inspected" : ""}${props.selectedIds.includes(item.id) ? " selected" : ""}`;

  // Right-clicking a photo is the most direct place to manage its album
  // membership. The picker itself carries the album list and search.
  const itemContextMenu = (item: any) => [
    { label: "Open", onClick: () => props.onOpenViewer(item.id) },
    ...(item.kind === "photo" ? [{ label: "Edit", onClick: () => { props.onOpenEdit?.(item); } }] : []),
    { label: "Open in Finder", onClick: () => tauri.items.revealInFinder(item.path) },
    { divider: true },
    { label: "Add to Album…", onClick: () => props.onOpenAlbumPicker?.([item.id]) },
    ...(props.activeAlbum
      ? [{
          label: "Remove from this Album",
          danger: true,
          onClick: () => props.onRequestRemoveFromAlbum?.(props.activeAlbum, [item.id]),
        }]
      : []),
    { label: "New Album…", onClick: () => props.onCreateAlbum?.([item.id]) },
    { divider: true },
    { label: "Favorite", onClick: () => props.onToggleFavorite(item.id) },
    { label: item.hidden ? "Show in Gallery" : "Remove from Gallery", onClick: () => props.onToggleHidden(item.id) },
    { label: "Delete", danger: true, onClick: () => props.onRequestDeleteItems?.([item.id]) },
  ];

  // Batch actions live in the contextual selection bar, so resolve the
  // selected items once and derive the toggled labels from them.
  const selectedItems = useMemo(() => {
    if (!props.selectedIds.length) return [];
    const ids = new Set(props.selectedIds);
    return library.items.filter((i: any) => ids.has(i.id));
  }, [library.items, props.selectedIds]);
  const anySelectedFavorite = selectedItems.some((i: any) => i.favorite);
  const anySelectedHidden = selectedItems.some((i: any) => i.hidden);

  return (
    <div className={`library-layout ${props.showInspector ? "with-inspector" : ""}`}>
      <section className="library-center">
        <header className="library-header">
          {inAlbum ? (
            <div className="album-detail-top">
              <button className="album-breadcrumb" type="button" onClick={() => props.onOpenAlbums?.()}>
                <AlbumsIcon size={15} /> All albums
              </button>
              <div className="album-detail-heading">
                <div className={`album-detail-cover${activeAlbumPhotos.length ? "" : " is-empty"}`}>
                  {activeAlbumPhotos.length ? (
                    <AlbumPhotoStack photos={activeAlbumPhotos} assetUrl={assetUrl} albumItems={activeAlbumItems} />
                  ) : (
                    <AlbumsIcon size={27} />
                  )}
                </div>
                <div className="album-detail-copy">
                  <p className="eyebrow">ALBUM</p>
                  <h1>{activeAlbumName}</h1>
                  <p className="page-subtitle">
                    {activeAlbumCount.toLocaleString()} {activeAlbumCount === 1 ? "item" : "items"}
                    {" · "}
                    {props.items.length.toLocaleString()} shown
                  </p>
                </div>
                <div className="album-detail-actions">
                  <button
                    className="play-button"
                    type="button"
                    onClick={() => props.onPlaySlideshow?.(props.selectedIds)}
                    disabled={props.busy || props.items.length === 0}
                    title="Play this album as a slideshow"
                  >
                    <PlayIcon size={14} /> Play
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => props.onAddItems?.(props.activeAlbum)}
                    disabled={props.busy}
                  >
                    <PlusIcon size={15} /> Add Items
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={(e) => props.onAlbumMenu?.(e)}
                    title="Album options"
                    aria-label="Album options"
                  >
                    <MoreIcon size={18} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <header className="library-header-row">
              <div className="header-left">
                <p className="eyebrow">YOUR COLLECTION</p>
                <h1>All Photos</h1>
                <p className="page-subtitle">
                  {props.items.length.toLocaleString()} shown · {library.items.length.toLocaleString()} in library
                  {props.hiddenCount ? ` · ${props.hiddenCount.toLocaleString()} hidden` : ""}
                </p>
              </div>
              <div className="header-actions">
                <button
                  className="quiet-button icon-only"
                  type="button"
                  onClick={() => props.onPlaySlideshow?.(props.selectedIds)}
                  disabled={props.busy || props.items.length === 0}
                  title="Play the current view as a slideshow (Space)"
                  aria-label="Play slideshow"
                >
                  <PlayIcon size={16} />
                </button>
                <label className="source-select" title="Filter the library by folder">
                  <FolderIcon size={14} />
                  <span className="source-select-label">Folder</span>
                  <select
                    value={library.activeSource ?? ""}
                    onChange={(e) => library.setActiveSource(e.target.value || null)}
                    aria-label="Filter the library by folder"
                  >
                    <option value="">All folders</option>
                    {library.folders.map((folder: LibraryFolder) => (
                      <option key={folder.path} value={folder.path}>{folder.name}</option>
                    ))}
                  </select>
                </label>
                <div className="action-divider" aria-hidden="true" />
                <button className="primary-button" type="button" onClick={() => props.onImportFolder?.()} disabled={props.busy} title="Open folder (⌘O)" aria-label="Open folder">
                  <FolderIcon size={15} /><span className="btn-label">Open folder</span>
                </button>
                <button className="quiet-button" type="button" onClick={() => props.onImportFiles?.()} disabled={props.busy} title="Add files (⌘I)" aria-label="Add files">
                  <PlusIcon size={15} /><span className="btn-label">Add files</span>
                </button>
              </div>
            </header>
          )}

          <div className="collection-toolbar">
            <div className="search-field">
              <span className="search-icon"><SearchIcon size={15} /></span>
              <input
                ref={props.searchInputRef}
                value={props.query}
                onChange={(e) => props.onChangeQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape" && props.query) props.onChangeQuery(""); }}
                placeholder="Search filenames, tags, camera…"
                aria-label="Search library"
              />
              {props.query ? (
                <button
                  type="button"
                  className="clear-btn visible"
                  onClick={() => { props.onChangeQuery(""); }}
                  aria-label="Clear search"
                  title="Clear (Esc)"
                >
                  ×
                </button>
              ) : (
                <kbd title="Focus search">{searchShortcutLabel()}</kbd>
              )}
            </div>
            <div className="toolbar-right">
              <div className="toolbar-actions">
                <button className="toolbar-button" type="button" onClick={() => props.onCreateAlbum?.()} title="Create album (⌘N)"><PlusIcon size={14} /> Album</button>
                <span className="toolbar-divider" aria-hidden="true" />
                <div className="layout-switcher" aria-label="Gallery layout">
                  {(["grid", "columns", "details", "timeline"] as const).map((l) => {
                    const Icon = l === "grid" ? GridIcon : l === "columns" ? ColumnsIcon : l === "details" ? DetailsIcon : TimelineIcon;
                    return (
                      <button key={l} type="button" aria-label={l} title={l} className={props.layout === l ? "selected" : ""} onClick={() => props.onChangeLayout(l)}><Icon size={14} /></button>
                    );
                  })}
                </div>
              </div>
              <div className="selection-cluster">
                {(() => {
                  const visibleCount = library.visibleItems.length;
                  const selectedCount = library.selectedIds.length;
                  const allSelected = visibleCount > 0 && selectedCount >= visibleCount;
                  return (
                    <button
                      key="select-all"
                      type="button"
                      className={`quick-filter select-all-toggle ${allSelected ? "active" : ""}`}
                      onClick={() => props.onToggleSelectAll?.()}
                      title="Select/deselect all (⌘A)"
                    >
                      <span className="select-all-icon"><CheckIcon size={12} /></span>
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                  );
                })()}
              </div>
              <div className="filter-cluster">
                <span className="smart-label">SHOW</span>
                {["All", "Photos", "Videos", "RAW", "Favorites", "Hidden"].map((f) => {
                  const count = filterCounts[f as keyof typeof filterCounts] ?? 0;
                  return (
                    <button key={f} type="button" className={`quick-filter ${props.filter === f ? "active" : ""}`} onClick={() => props.onChangeFilter(f)}>
                      {f}
                      <span className="filter-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {props.selectedIds.length > 0 && (
            <div className="selection-bar" role="toolbar" aria-label="Selection actions">
              <span className="selection-bar-count">
                {props.selectedIds.length.toLocaleString()} selected
              </span>
              <span className="selection-bar-divider" aria-hidden="true" />
              <button
                type="button"
                className="selection-bar-action"
                onClick={() => props.onPlaySlideshow?.(props.selectedIds)}
                title="Play selected items as a slideshow"
              >
                <PlayIcon size={13} /> Play
              </button>
              <button
                type="button"
                className="selection-bar-action"
                onClick={() => props.onSetFavoriteForIds(props.selectedIds, !anySelectedFavorite)}
                title={anySelectedFavorite ? "Remove favorite from all selected" : "Favorite all selected"}
              >
                <HeartIcon size={13} filled={anySelectedFavorite} />
                {anySelectedFavorite ? "Unfavorite" : "Favorite"}
              </button>
              <button
                type="button"
                className="selection-bar-action"
                onClick={() => props.onSetHiddenForIds(props.selectedIds, !anySelectedHidden)}
                title={anySelectedHidden ? "Unhide all selected" : "Hide all selected"}
              >
                {anySelectedHidden ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
                {anySelectedHidden ? "Unhide" : "Hide"}
              </button>
              <button
                type="button"
                className="selection-bar-action"
                onClick={() => props.onOpenAlbumPicker?.(props.selectedIds)}
                title="Add selected items to an album"
              >
                <AlbumsIcon size={13} /> Add to album
              </button>
              {inAlbum && (
                <button
                  type="button"
                  className="selection-bar-action"
                  onClick={() => library.removeFromAlbum(props.activeAlbum, props.selectedIds)}
                  title="Remove selected items from this album (photos stay in the library)"
                >
                  <MinusIcon size={13} /> Remove from album
                </button>
              )}
              <button
                type="button"
                className="selection-bar-action"
                onClick={() => props.onClearSelection?.()}
                title="Clear selection (inspection is kept)"
              >
                Clear
              </button>
            </div>
          )}
        </header>

        {props.layout === "details" && (
          <div className="details-header-sticky">
            <div className="details-col" title="Thumbnail"><span className="header-icon"><ImageOffIcon size={11} /></span></div>
            <div className="details-col">Name</div>
            <div className="details-col">Date</div>
            <div className="details-col">Kind</div>
            <div className="details-col">Size</div>
          </div>
        )}

        <div className="library-grid-container" ref={scrollRef} onScroll={handleGridScroll}>
          {(() => {
            if (props.layout === "details") {
              return (
                <div className="gallery-grid layout-details">
                    {renderedItems.map((item: any) => (
                    <article key={item.id} className={tileClass(item)} onContextMenu={(e: any) => props.onContextMenu(itemContextMenu(item), e)}>
                      <div className="tile-select-check">
                        <input type="checkbox" checked={props.selectedIds.includes(item.id)} onChange={() => props.onToggleSelect(item.id)} title={props.selectedIds.includes(item.id) ? "Remove from selection" : "Add to selection"} onClick={(e: any) => e.stopPropagation()} />
                      </div>
                      <button type="button" className="tile-open-button" onClick={(e) => handleTileClick(item, e)} onDoubleClick={() => handleTileDoubleClick(item)}>
                        <span className="tile-image">
                          {item.kind === "video" ? <VideoThumb src={assetUrl(item.path)} name={item.name} /> : item.kind === "photo" ? <img src={assetUrl(item.path)} alt={item.name} loading="lazy" /> : <span className="raw-tile"><KindBadge kind={item.kind} /></span>}
                          {item.kind === "video" && <span className="video-label"><PlayIcon size={10} /></span>}
                          {item.kind === "raw" && <span className="format-label"><KindBadge kind={item.kind} /></span>}
                        </span>
                        <span className="tile-caption">
                                <b>{item.name}</b>
                                <small className="tile-date">{new Date(item.modifiedAt).toLocaleDateString()}</small>
                                <small className="tile-kind">
                                  <KindDot kind={item.kind} />
                                  {item.kind === 'video' ? 'Video' : item.kind === 'raw' ? 'RAW' : 'Photo'}
                                </small>
                                <small className="tile-size">{item.size > 1024*1024 ? (item.size/1024/1024).toFixed(1)+' MB' : (item.size/1024).toFixed(0)+' KB'}</small>
                              </span>
                      </button>
                    </article>
                  ))}
                  {props.items.length === 0 && emptyView()}
                </div>
              );
            }
            if (props.layout === "timeline") {
              return (
                <div className="gallery-grid layout-timeline">
                  {timelineGroups.length === 0 ? emptyView() : (
                    timelineGroups.map(({ label, items }) => (
                      <React.Fragment key={label}>
                        <div className="timeline-group"><h3>{label}</h3></div>
                        {items.map((item: any) => (
                          <article key={item.id} className={tileClass(item)} onContextMenu={(e: any) => props.onContextMenu(itemContextMenu(item), e)}>
                            <div className="tile-select-check">
                              <input type="checkbox" checked={props.selectedIds.includes(item.id)} onChange={() => props.onToggleSelect(item.id)} title={props.selectedIds.includes(item.id) ? "Remove from selection" : "Add to selection"} onClick={(e: any) => e.stopPropagation()} />
                            </div>
                            <button type="button" className="tile-open-button" onClick={(e) => handleTileClick(item, e)} onDoubleClick={() => handleTileDoubleClick(item)}>
                              <span className="tile-image">
                                {item.kind === "video" ? <VideoThumb src={assetUrl(item.path)} name={item.name} /> : item.kind === "photo" ? <img src={assetUrl(item.path)} alt={item.name} loading="lazy" /> : <span className="raw-tile"><KindBadge kind={item.kind} /></span>}
                                {item.kind === "video" && <span className="video-label"><PlayIcon size={10} /></span>}
                                {item.kind === "raw" && <span className="format-label"><KindBadge kind={item.kind} /></span>}
                              </span>
                              <span className="tile-caption">
                                  <b>{item.name}</b>
                                  <small className="tile-date">{new Date(item.modifiedAt).toLocaleDateString()}</small>
                                  <small className="tile-kind">
                                    <KindDot kind={item.kind} />
                                    {item.kind === 'video' ? 'Video' : item.kind === 'raw' ? 'RAW' : 'Photo'}
                                  </small>
                                  <small className="tile-size">{item.size > 1024*1024 ? (item.size/1024/1024).toFixed(1)+' MB' : (item.size/1024).toFixed(0)+' KB'}</small>
                                </span>
                            </button>
                          </article>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </div>
              );
            }
            return (
              <div className={`gallery-grid layout-${props.layout}`}>
                {renderedItems.map((item: any) => (
                  <article key={item.id} className={tileClass(item)} onContextMenu={(e: any) => props.onContextMenu(itemContextMenu(item), e)}>
                    <div className="tile-select-check">
                      <input type="checkbox" checked={props.selectedIds.includes(item.id)} onChange={() => props.onToggleSelect(item.id)} title={props.selectedIds.includes(item.id) ? "Remove from selection" : "Add to selection"} onClick={(e: any) => e.stopPropagation()} />
                    </div>
                    <button type="button" className="tile-open-button" onClick={(e) => handleTileClick(item, e)} onDoubleClick={() => handleTileDoubleClick(item)}>
                      <span className="tile-image">
                        {item.kind === "video" ? <VideoThumb src={assetUrl(item.path)} name={item.name} /> : item.kind === "photo" ? <img src={assetUrl(item.path)} alt={item.name} loading="lazy" /> : <span className="raw-tile"><KindBadge kind={item.kind} /></span>}
                        {item.kind === "video" && <span className="video-label"><PlayIcon size={10} /></span>}
                        {item.kind === "raw" && <span className="format-label"><KindBadge kind={item.kind} /></span>}
                      </span>
                      <span className="tile-caption">
                                <b>{item.name}</b>
                                <small className="tile-date">{new Date(item.modifiedAt).toLocaleDateString()}</small>
                                <small className="tile-kind">{item.kind === 'video' ? 'Video' : item.kind === 'raw' ? 'RAW' : 'Photo'}</small>
                                <small className="tile-size">{item.size > 1024*1024 ? (item.size/1024/1024).toFixed(1)+' MB' : (item.size/1024).toFixed(0)+' KB'}</small>
                              </span>
                    </button>
                  </article>
                ))}
                {props.items.length === 0 && emptyView()}
              </div>
            );
          })()}
          {renderLimit < props.items.length && (
            <div className="grid-more">
              <button type="button" className="quiet-button" onClick={loadMore}>
                Show more · {(props.items.length - renderLimit).toLocaleString()} remaining
              </button>
            </div>
          )}
        </div>
      </section>

      {props.showInspector && (
        <aside className="photo-inspector">
          {props.inspectedId && library.items.find((i: any) => i.id === props.inspectedId) ? (
            (() => {
              const sel = library.items.find((i: any) => i.id === props.inspectedId);
              if (!sel) return null;
              // Inspection is independent of selection: the Inspector always
              // shows the inspected item, even when a larger multi-selection
              // exists (already-selected items stay inspectable).
              const isSelected = props.selectedIds.includes(sel.id);
              return (
                <>
                  <div className="inspector-top">
                    <div>
                      <small>{props.selectedIds.length > 1 && isSelected ? "SELECTED · INSPECTING" : "INSPECTING"}</small>
                      <h2 title={sel.name}>{sel.name}</h2>
                      {props.selectedIds.length > 1 && (
                        <span className="inspector-selection-note">{props.selectedIds.length} selected · inspection independent</span>
                      )}
                    </div>
                    <button type="button" className="inspector-close-btn" onClick={props.onToggleInspector} title="Close Inspector (⌥⌘I)">×</button>
                  </div>
                  <button className="inspector-image" type="button" onDoubleClick={() => props.onOpenViewer(sel.id)} title="Double-click to open in viewer">
                    {sel.kind === "photo" ? (
                      <img src={assetUrl(sel.path)} alt={sel.name} />
                    ) : sel.kind === "video" ? (
                      <video src={assetUrl(sel.path)} controls />
                    ) : (
                      <span className="raw-tile"><KindBadge kind={sel.kind} /></span>
                    )}
                    <span>Double-click to view</span>
                  </button>
                  <div className="inspector-actions">
                    <button
                      className={`inspector-action ${sel.favorite ? "favorite active" : ""}`}
                      onClick={() => props.onToggleFavorite(props.inspectedId)}
                      title={sel.favorite ? "Unfavorite" : "Favorite"}
                    >
                      <HeartIcon size={14} filled={!!sel.favorite} />
                      <span>{sel.favorite ? "Unfavorite" : "Favorite"}</span>
                    </button>
                    <button
                      className="inspector-action"
                      onClick={() => props.onToggleHidden(props.inspectedId)}
                      title={sel.hidden ? "Unhide" : "Hide"}
                    >
                      {sel.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                      <span>{sel.hidden ? "Hidden" : "Hide"}</span>
                    </button>
                    <button
                      className={`inspector-action ${isSelected ? "active" : ""}`}
                      onClick={() => props.onToggleSelect(sel.id)}
                      title={isSelected ? "Remove from selection" : "Add to selection"}
                    >
                      <PlusIcon size={14} />
                      <span>{isSelected ? "Selected" : "Select"}</span>
                    </button>
                  </div>
                  <div className="inspector-section">
                    <div className="inspector-section-head"><b>File Info</b></div>
                    <div className="info-card">
                      <div className="info-row">
                        <span className="info-label">Name</span>
                        <span className="info-value" title={sel.name}>{sel.name}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">Kind</span>
                        <span className="info-value"><KindBadge kind={sel.kind} /></span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">Format</span>
                        <span className="info-value">{sel.extension.toUpperCase()}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">Dimensions</span>
                        <span className="info-value">{sel.width && sel.height ? `${sel.width} × ${sel.height}` : "Unknown"}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">Size</span>
                        <span className="info-value">{formatBytesSimple(sel.size)}</span>
                      </div>
                      {sel.camera && <div className="info-row"><span className="info-label">Camera</span><span className="info-value" title={sel.camera}>{sel.camera}</span></div>}
                      {sel.lens && <div className="info-row"><span className="info-label">Lens</span><span className="info-value" title={sel.lens}>{sel.lens}</span></div>}
                      {sel.capturedAt && <div className="info-row"><span className="info-label">Captured</span><span className="info-value">{new Date(sel.capturedAt).toLocaleString()}</span></div>}
                      <div className="info-row"><span className="info-label">Modified</span><span className="info-value">{new Date(sel.modifiedAt).toLocaleString()}</span></div>
                    </div>
                  </div>
                  <div className="inspector-tags">
                    <div className="inspector-section-head"><b>App Tags</b></div>
                    <div className="tags-list">
                      {sel.tags?.map((tag: string) => (
                        <span className="app-tag" key={tag}>
                          {tag}
                          <button type="button" onClick={() => props.onUpdateTags(props.inspectedId, (sel.tags || []).filter((t: string) => t !== tag))}>×</button>
                        </span>
                      ))}
                    </div>
                    <input
                      className="tag-input"
                      aria-label="Add tag"
                      placeholder="Add tag and press Enter…"
                      onKeyDown={(e: any) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          const newTag = e.currentTarget.value.trim();
                          const currentTags = sel.tags || [];
                          if (!currentTags.includes(newTag)) {
                            props.onUpdateTags(props.inspectedId, [...currentTags, newTag]);
                          }
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                </>
              );
            })()
          ) : (
            <div className="inspector-empty-state">
              <div className="inspector-top">
                <div><small>INSPECTOR</small><h2>No Inspection</h2></div>
                <button type="button" className="inspector-close-btn" onClick={props.onToggleInspector} title="Close Inspector">×</button>
              </div>
              <div className="inspector-empty-placeholder">
                <span className="inspector-empty-icon"><DetailsIcon size={26} /></span>
                <p>Single-click a photo or video to inspect its details. Selection is separate — use the checkbox or + to multi-select.</p>
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function ViewerScreen(props: any) {
  const selected = props.selected;
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Folder context: the pill shows the containing folder, the subtle line the
  // full path. Deriving both from the media path keeps it honest (no fake
  // "LOCAL FILE" label).
  const folderPath = selected?.path
    ? String(selected.path).replace(/\\/g, "/").split("/").slice(0, -1).join("/")
    : "";
  const folderName = folderPath.split("/").filter(Boolean).pop() || "Local Files";
  const [hintsVisible, setHintsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // Shortcut hints are shown on open and whenever the pointer moves over the
  // stage, then fade away after a short pause so the frame stays clean.
  const flashHints = useCallback(() => {
    setHintsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setHintsVisible(false), 3500);
  }, []);

  useEffect(() => {
    flashHints();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [props.selected?.id, flashHints]);

  // Keep the active thumbnail in view as you navigate a long filmstrip.
  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>(".filmstrip button.active");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.selected?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, or if the slideshow overlay is driving.
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (useSlideshowStore.getState().isOpen) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          props.onNavigate(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          props.onNavigate(1);
          break;
        case "ArrowUp":
          if (selected.kind === "photo") {
            e.preventDefault();
            props.onSetZoom(Math.min(300, props.zoom + 25));
          }
          break;
        case "ArrowDown":
          if (selected.kind === "photo") {
            e.preventDefault();
            props.onSetZoom(Math.max(25, props.zoom - 25));
          }
          break;
        case "r":
        case "R":
          if (selected.kind === "photo") {
            e.preventDefault();
            props.onRotate(90);
          }
          break;
        case "x":
        case "X":
          if (selected.kind === "photo") {
            e.preventDefault();
            props.onToggleFlip();
          }
          break;
        case "0":
          e.preventDefault();
          props.onSetZoom(100);
          break;
        case "1":
          e.preventDefault();
          props.onSetZoom(200);
          break;
        case "f":
        case "F":
          e.preventDefault();
          props.onToggleFavorite(selected.id);
          break;
        case " ":
          if (selected.kind === "video") {
            e.preventDefault();
            // VideoPlayer handles space internally via click
          }
          break;
        case "Escape":
          e.preventDefault();
          props.onNavigate(0); // Will close viewer via parent
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, props]);

  if (!selected) return <div className="viewer-empty-state"><div className="first-run-art"><ViewerIcon size={30} /></div><h2>No viewable media yet</h2><p>Import photos or videos to start viewing.</p></div>;

  return (
    <div className="viewer-screen">
      <div className="page-heading viewer-heading">
        <div className="viewer-title-block">
          <p className="eyebrow">VIEWER</p>
          <h1 title={selected.name}>{selected.name}</h1>
          <div className="viewer-meta">
            <div className="meta-row">
              <span className="meta-chip">
                <svg className="meta-icon" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M8 2v4M8 10v4M2 8h4M10 8h4"/></svg>
                {new Date(selected.modifiedAt).toLocaleDateString()}
              </span>
              <span className="meta-chip">
                <svg className="meta-icon" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h8v8H4z"/><path d="M4 8h8"/></svg>
                {selected.extension.toUpperCase()}
              </span>
              <span className="meta-chip">
                <svg className="meta-icon" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 3"/></svg>
                {formatBytesSimple(selected.size)}
              </span>
              {selected.kind === "photo" && selected.width && selected.height && (
                <span className="meta-chip">
                  <svg className="meta-icon" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12"/></svg>
                  {selected.width} × {selected.height}
                </span>
              )}
              {selected.kind === "video" && selected.duration && (
                <span className="meta-chip">
                  <svg className="meta-icon" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="7"/><path d="M8 4v4l3 3"/></svg>
                  {formatDuration(selected.duration)}
                </span>
              )}
            </div>
            {folderPath && (
              <span className="meta-chip path-chip" title={selected.path}>
                <svg className="meta-icon" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h8v8H4z"/><path d="M4 8h8"/></svg>
                {folderPath}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="viewer-stage" onMouseMove={() => flashHints()} onDoubleClick={(e) => {
        if (selected.kind !== "photo") return;
        if ((e.target as HTMLElement).closest("button, input")) return;
        props.onSetZoom(props.zoom === 100 ? 200 : 100);
      }}>
        <button className="viewer-arrow left" type="button" onClick={() => props.onNavigate(-1)} aria-label="Previous">‹</button>
        {selected.kind === "video" ? <VideoPlayer
          src={props.assetUrl(selected.path)}
          name={selected.name}
          onFullscreen={() => void props.onToggleFullscreen()}
        /> : selected.kind === "photo" ? <img src={props.assetUrl(selected.path)} alt={selected.name} style={{ transform: `rotate(${props.rotation || 0}deg) scaleX(${props.flipX ? -1 : 1}) scale(${props.zoom / 100})` }} /> : <div className="raw-viewer"><b>{selected.extension.toUpperCase()}</b><span>RAW preview requires native backend</span></div>}
        <button className="viewer-arrow right" type="button" onClick={() => props.onNavigate(1)} aria-label="Next">›</button>
        <div className="viewer-overlay-top">
          <span className="viewer-transform-state">
            {props.rotation ? `${props.rotation}°` : ""}
            {props.rotation && props.flipX ? " · " : ""}
            {props.flipX ? "Flipped" : ""}
            {props.items.findIndex((i: any) => i.id === props.selected?.id) + 1} / {props.items.length}
          </span>
          <button
            className="viewer-slideshow-button"
            type="button"
            onClick={() => props.onPlaySlideshow?.(props.items.map((i: any) => i.id))}
            title="Play this collection as a slideshow"
          >
            <PlayIcon size={12} /> Slideshow
          </button>
        </div>
        {/* Compact shortcut hints live in the stage corner so the frame keeps
            all of its room for the media and the control bar. */}
        <div className={`viewer-hints${hintsVisible ? "" : " hidden"}`} aria-hidden="true">
          <span><kbd>←</kbd><kbd>→</kbd> Navigate</span>
          {selected.kind !== "video" && <span><kbd>↑</kbd><kbd>↓</kbd> Zoom</span>}
          {selected.kind === "photo" && <span><kbd>R</kbd><kbd>X</kbd> Rotate/Flip</span>}
          <span><kbd>Space</kbd> Play</span>
          <span><kbd>F</kbd> Fullscreen</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
        {selected.kind !== "video" && (
          <div className="viewer-overlay-bottom">
          <button type="button" onClick={() => props.onSetZoom(Math.max(25, props.zoom - 25))} aria-label="Zoom out"><MinusIcon size={15} /></button>
          <span>{props.zoom}%</span>
          <button type="button" onClick={() => props.onSetZoom(Math.min(300, props.zoom + 25))} aria-label="Zoom in"><PlusIcon size={15} /></button>
          <span className="viewer-divider" />
          {selected.kind === "photo" && <button type="button" onClick={() => props.onRotate(90)} aria-label="Rotate 90 degrees" title="Rotate 90°"><RotateIcon size={14} /> Rotate</button>}
          {selected.kind === "photo" && <button type="button" onClick={() => props.onToggleFlip()} aria-label="Flip horizontally" title="Flip horizontal" className={props.flipX ? "active" : ""}><FlipIcon size={14} /> Flip</button>}
          {selected.kind === "photo" && (props.rotation !== 0 || props.flipX) && <button type="button" onClick={() => props.onResetTransform()} aria-label="Reset rotation and flip" title="Reset rotation & flip">Reset</button>}
          <button type="button" onClick={() => props.onToggleFavorite(selected.id)}><HeartIcon size={14} filled={!!selected.favorite} /> Favorite</button>
          {selected.kind === "photo" && <button type="button" onClick={() => props.onOpenEdit(selected)}><EditIcon size={14} /> Edit</button>}
          <button type="button" onClick={() => void props.onToggleFullscreen()}><FullscreenIcon size={14} /> Full screen</button>
          </div>
        )}
      </div>
      <div className="filmstrip" ref={stripRef}>
        <span className="filmstrip-label">FOLDER</span>
        {props.items.map((item: any) => (
          <button type="button" title={item.name} className={item.id === props.selected?.id ? "active" : ""} key={item.id} onClick={() => props.onSetPhoto(item.id)}>
            {item.kind === "photo" ? <img src={props.assetUrl(item.path)} alt={item.name} />
              : item.kind === "video" ? <VideoThumb src={props.assetUrl(item.path)} name={item.name} />
              : <span>{item.extension.toUpperCase()}</span>}
            <KindDot kind={item.kind} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EditScreen(props: any) {
  const [pickerQuery, setPickerQuery] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const stageRef = useRef<any>(null);
  const [drag, setDrag] = useState<any>(null);
  const values = props.values || {};
  const crop = props.crop || { enabled:false, x:0,y:0,width:1,height:1 };
  useEffect(() => {
    if (!drag || !props.item) return;
    const onMove = (e: any) => {
      const dx = (e.clientX - drag.startX) / drag.rect.width;
      const dy = (e.clientY - drag.startY) / drag.rect.height;
      if (drag.type === "move") {
        const nx = Math.min(Math.max(drag.crop.x + dx, 0), 1 - drag.crop.width);
        const ny = Math.min(Math.max(drag.crop.y + dy, 0), 1 - drag.crop.height);
        props.onSetCrop({ x: nx, y: ny });
      } else {
        const nw = Math.min(Math.max(drag.crop.width + dx, 0.05), 1 - drag.crop.x);
        const nh = Math.min(Math.max(drag.crop.height + dy, 0.05), 1 - drag.crop.y);
        props.onSetCrop({ width: nw, height: nh });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag, props]);
  const startDrag = (type: string, e: any) => {
    e.preventDefault(); e.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    setDrag({ type, startX: e.clientX, startY: e.clientY, crop: { ...crop }, rect });
  };
  if (!props.item) {
    const filtered = (props.items || []).filter((it: any) => {
      const hasDraft = (() => { try { return !!localStorage.getItem(`edit:draft:${it.id}`); } catch { return false; } })();
      if (hasDraft) return false;
      return !pickerQuery || String(it.name || "").toLowerCase().includes(pickerQuery.toLowerCase());
    });
    const browse = async () => {
      try {
        const sel = await openFileDialog({ multiple: false, filters: [{ name: "Images", extensions: ["jpg","jpeg","png","webp","heic","heif","tif","tiff"] }] });
        if (!sel) return;
        const path = Array.isArray(sel) ? sel[0] : sel;
        const name = String(path).split(/[\\/]/).pop() || "photo";
        props.onOpenEdit?.({ id: path, name, path, kind: "photo" });
      } catch (e) { props.onNotice?.("Could not open file"); }
    };
    return (
      <div className="edit-page">
        <div className="page-heading">
          <div><p className="eyebrow">NON-DESTRUCTIVE EDITING</p><h1>Select a photo to edit</h1><p className="page-subtitle">Choose a browser-supported photo from your library or browse from disk, then open the editor.</p></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <button className="quiet-button" type="button" onClick={() => props.onBack?.()}>Back to Library</button>
          <div className="search-field" style={{ flex: 1 }}>
            <span className="search-icon"><SearchIcon size={15} /></span>
            <input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search photos..." aria-label="Search photos" />
          </div>
          <button className="quiet-button" type="button" onClick={browse}>Browse from Finder…</button>
        </div>
        {(() => {
          const drafts = (props.items || []).filter((it: any) => { try { return !!localStorage.getItem(`edit:draft:${it.id}`); } catch { return false; } });
          if (!drafts.length) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px", color: "var(--text)" }}>Drafts</h3>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
                {drafts.map((item: any) => (
                  <button key={item.id} type="button" className="edit-picker-tile" style={{ minWidth: 140, width: 140 }} onClick={() => props.onOpenEdit?.(item)}>
                    <img src={props.assetUrl(item.path)} alt={item.name} />
                    <span>{item.name}</span>
                    <span className="draft-badge">Draft</span>
                    <span className="draft-remove" onClick={(e) => { e.stopPropagation(); try { localStorage.removeItem(`edit:draft:${item.id}`); } catch {} props.onNotice?.("Draft removed"); }} title="Remove draft">×</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {filtered.length>0 ? (<div className="edit-picker-grid">{filtered.map((item:any)=> {
  const hasDraft = (() => { try { return !!localStorage.getItem(`edit:draft:${item.id}`); } catch { return false; } })();
  return (
    <button key={item.id} type="button" className="edit-picker-tile" onClick={()=>props.onOpenEdit?.(item)}>
      <img src={props.assetUrl(item.path)} alt={item.name}/>
      <span>{item.name}</span>
      {hasDraft && <span className="draft-badge">Draft</span>}
      {hasDraft && <span className="draft-remove" onClick={(e) => { e.stopPropagation(); try { localStorage.removeItem(`edit:draft:${item.id}`); } catch {} props.onNotice?.("Draft removed"); }} title="Remove draft">×</span>}
    </button>
  );
})}</div>) : (<div className="viewer-empty-state"><div style={{ marginBottom: 16 }}><BrandMark size={56} /></div><h2>No photos found</h2><p>Import a folder or browse from disk.</p></div>) }
      </div>
    );
  }
  return (
    <div className="edit-page">
      <div className="page-heading">
        <div><p className="eyebrow">NON-DESTRUCTIVE EDITING</p><h1>{props.item.name}</h1><p className="page-subtitle">Adjustments are applied only when you export a new copy.</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="primary-button" type="button" onClick={() => props.onClose?.()}>Select photo</button>
          <span className="saved-indicator"><i /> Original unchanged</span>
        </div>
      </div>
      <div className="editor-layout">
        <div className="edit-canvas">
          <div ref={stageRef} className="crop-stage" style={{ position: "relative", display: "inline-block" }}>
            <img src={props.assetUrl(props.item.path)} alt={props.item.name} style={{ transform: `rotate(${values.rotation}deg) scaleX(${values.flip ? -1 : 1})`, filter: `brightness(${100 + values.exposure}%) contrast(${100 + values.contrast}%) saturate(${100 + values.saturation}%)`, maxWidth: "90%", maxHeight: "420px", display: "block" }} />
            {crop.enabled && (
              <div className="crop-overlay" style={{ position: "absolute", left: `${crop.x*100}%`, top: `${crop.y*100}%`, width: `${crop.width*100}%`, height: `${crop.height*100}%`, border: "2px solid #fff", boxShadow: "0 0 0 9999px rgba(0,0,0,.45)", cursor: "move" }} onMouseDown={(e) => startDrag("move", e)}>
                <span className="crop-handle br" style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, background: "#fff", border: "1px solid #333", cursor: "nwse-resize", borderRadius: 2 }} onMouseDown={(e) => startDrag("resize", e)} />
              </div>
            )}
          </div>
          <div className="canvas-actions">
            <button type="button" onClick={() => props.onRotate(90)}><RotateIcon size={14} /> Rotate</button>
            <button type="button" onClick={props.onFlip}><FlipIcon size={14} /> Flip</button>
            <button type="button" className={props.crop.enabled ? "active" : ""} onClick={() => props.onSetCrop({ enabled: !props.crop.enabled })}><CropIcon size={14} /> {props.crop.enabled ? "Reset crop" : "Crop preview"}</button>
          </div>
        </div>
        <aside className="edit-controls">
          <div className="edit-tabs"><button className="active">Light & color</button><button type="button" onClick={() => props.onSetCrop({ enabled: !props.crop.enabled })}>Crop</button></div>
          <div className="auto-adjust">
            <div><span className="feature-icon yellow-bg"><SparkleIcon size={17} /></span><div><b>Basic adjustments</b><small>Non-destructive preview</small></div></div>
            <button type="button" onClick={props.onAuto}>Auto</button>
          </div>
          {[
            { key: "exposure" as const, label: "Exposure" },
            { key: "shadows" as const, label: "Shadows" },
            { key: "highlights" as const, label: "Highlights" },
            { key: "contrast" as const, label: "Contrast" },
            { key: "saturation" as const, label: "Saturation" },
            { key: "warmth" as const, label: "Warmth" },
          ].map(({ key, label }) => (
            <label className="slider-control" key={key}>
              <span>{label}<b>{values[key] > 0 ? "+" : ""}{values[key]}%</b></span>
              <input type="range" min={-80} max={80} value={values[key]} onChange={(e) => props.onSetValue(key, Number(e.target.value))} />
            </label>
          ))}
          <div className="edit-footer">
            <button className="quiet-button" type="button" onClick={props.onReset}>Reset</button>
            <button className="quiet-button" type="button" onClick={props.onClearDraft}>Discard draft</button>
            <button className="quiet-button" type="button" onClick={props.onSaveDraft}>Save draft</button>
            <button className="quiet-button" type="button" style={{ color: "#d33" }} onClick={() => setConfirmReplace(true)}>Replace original</button>
            <button className="primary-button" type="button" onClick={() => props.onExport(false)}>Save copy</button>
          </div>
        </aside>
      </div>
      <div className="drafts-row">
        <h3 style={{ color: "var(--text)" }}>Drafts</h3>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
          {(props.items||[]).filter((it:any) => { try { return !!localStorage.getItem(`edit:draft:${it.id}`); } catch { return false; } }).map((item:any) => (
            <button key={item.id} type="button" className="edit-picker-tile" style={{ minWidth: 120, width: 120, position: "relative" }} onClick={() => { props.onSaveDraft?.(); props.onOpenEdit?.(item); }}>
              <img src={props.assetUrl(item.path)} alt={item.name} />
              <span>{item.name}</span>
              <span className="draft-remove" onClick={(e) => { e.stopPropagation(); try { localStorage.removeItem(`edit:draft:${item.id}`); } catch {} props.onNotice?.("Draft removed"); }} title="Remove draft">×</span>
            </button>
          ))}
        </div>
      </div>
      <p className="browser-capability-warning">Browser canvas export supports JPEG, PNG, and WebP input when the browser can decode it. HEIC and RAW need native macOS image frameworks. Metadata is removed from re-encoded exports.</p>
      {confirmReplace && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--surface)", padding: 20, borderRadius: 8, maxWidth: 420, width: "90%" }}>
            <h3 style={{ margin: "0 0 8px", color: "var(--text)" }}>Replace original file?</h3>
            <p style={{ margin: "0 0 16px", color: "var(--muted)" }}>This will overwrite the original image with the edited version. This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="quiet-button" type="button" onClick={() => setConfirmReplace(false)}>Cancel</button>
              <button className="primary-button" type="button" style={{ background: "#d33", borderColor: "#d33" }} onClick={() => { setConfirmReplace(false); props.onExport(true); }}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BatchScreen(props: any) {
  return (
    <div className="feature-page">
      <div className="page-heading">
        <div><p className="eyebrow">BATCH PROCESSING</p><h1>Prepare a batch export.</h1><p className="page-subtitle">Rename, convert, compress, or strip image metadata. Original files are never overwritten.</p></div>
      </div>
      <div className="batch-stepper">
        <span className={props.state.step >= 1 ? "current" : ""}><i>1</i>Select files</span>
        <b />
        <span className={props.state.step >= 2 ? "current" : ""}><i>2</i>Choose actions</span>
        <b />
        <span className={props.state.step >= 3 ? "current" : ""}><i>3</i>Export copies</span>
      </div>
      <div className="batch-layout">
        <div className="batch-options">
          <h2>Batch actions</h2>
          <p>Select files in Library, then configure the output below.</p>
          <div className="batch-selection">
            <b>{props.items.length} selected</b>
            <button type="button" onClick={props.onOpenLibrary}>Choose in Library →</button>
          </div>
          <div className="batch-form-row">
            <span><b>Filename pattern</b><small>Use {"{name}"}, {"{number}"}, {"{date}"}</small></span>
            <input value={props.config.pattern} onChange={(e) => props.onSetPattern(e.target.value)} />
          </div>
          <div className="batch-form-row">
            <span><b>Output format</b></span>
            <select value={props.config.format} onChange={(e) => props.onSetFormat(e.target.value)}>
              <option value="source">Keep source format</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <div className="batch-form-row">
            <span><b>Quality</b><span>{props.config.quality}%</span></span>
            <input type="range" min={50} max={100} value={props.config.quality} onChange={(e) => props.onSetQuality(Number(e.target.value))} />
          </div>
          <div className="batch-form-check">
            <input type="checkbox" checked={props.config.stripMetadata} onChange={(e) => props.onSetStripMetadata(e.target.checked)} />
            <span><b>Strip metadata</b><small>Remove EXIF, GPS, and camera info from exports</small></span>
          </div>
          <button className="primary-button batch-run" type="button" onClick={props.onExportBatch} disabled={props.busy || props.items.length === 0}>
            {props.busy ? "Exporting…" : "Export batch"}
          </button>
        </div>
        <div className="batch-preview">
          <div className="batch-preview-head"><b>Preview</b><button type="button">Open destination</button></div>
          <div className="batch-preview-list">
            {props.items.slice(0, 5).map((item: any, i: number) => (
              <div key={item.id} className="batch-preview-row">
                <span>{item.name}</span>
                <span>→</span>
                <span>{props.config.pattern.replace(/\{name\}/g, item.name.replace(/\.[^.]+$/, "")).replace(/\{number\}/g, String(i + 1).padStart(3, "0"))}.{props.config.format === "source" ? item.extension : props.config.format.replace("jpeg", "jpg")}</span>
              </div>
            ))}
            {props.items.length === 0 && (
              <div className="batch-preview-empty">
                <b>Nothing to preview yet</b>
                <small>Select files in the Library to preview exported filenames here.</small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VaultScreen(props: any) {
  if (!props.unlocked) {
    return (
      <div className="vault-page">
        <div className="vault-lock-card">
          <div className="vault-lock-art"><VaultIcon size={28} /><i><LockIcon size={12} /></i></div>
          <p className="eyebrow">PRIVATE VAULT</p>
          <h2>Protected Photos</h2>
          <p>Items in the vault are encrypted and hidden from the main library. Unlock with Touch ID or password.</p>
          <button className="primary-button" onClick={() => props.onUnlock(true)}>Unlock with Touch ID</button>
          <small>Or use password</small>
        </div>
      </div>
    );
  }
  return (
    <div className="vault-page">
      <div className="page-heading">
        <div><p className="eyebrow">PRIVATE VAULT</p><h1>Vault Contents</h1><p className="page-subtitle">{props.items.length} protected items</p></div>
        <button className="quiet-button" type="button" onClick={props.onLock}>Lock vault</button>
      </div>
      <div className="vault-settings">
        <div><b>Auto-lock</b><small>Lock after {props.autoLock} minutes of inactivity</small></div>
        <input type="range" min={1} max={60} value={props.autoLock} onChange={(e) => props.onSetAutoLock(Number(e.target.value))} />
      </div>
      <div className="vault-thumbnails">
        {props.items.map((item: any) => (
          <button key={item.id} type="button">
            <img src={props.assetUrl(item.path)} alt={item.name} />
            <span>{item.name}</span>
            <i>Unhide</i>
          </button>
        ))}
        {props.items.length === 0 && <p className="vault-empty">No items in vault. Select items in Library and add them here.</p>}
      </div>
    </div>
  );
}

/** Fan out up to three album photos like a loose stack of prints. */
function albumStackPose(count: number, index: number) {
  const poses =
    count === 1
      ? [{ x: -2, y: 0, r: -3, hx: -3, hy: -1, hr: -4 }]
      : count === 2
        ? [
            { x: -9, y: 5, r: -8, hx: -14, hy: 7, hr: -11 },
            { x: 8, y: -2, r: 7, hx: 13, hy: -4, hr: 10 },
          ]
        : [
            { x: -16, y: 8, r: -11, hx: -24, hy: 12, hr: -15 },
            { x: 0, y: -4, r: -1, hx: 0, hy: -7, hr: -2 },
            { x: 16, y: 7, r: 10, hx: 24, hy: 11, hr: 14 },
          ];
  return poses[index] || poses[0];
}

function AlbumPhotoStack({ photos, assetUrl, albumItems = [] }: { photos: any[]; assetUrl: (path: string) => string; albumItems?: any[] }) {
  return (
    <span className="album-stack">
      {photos.map((item: any, photoIndex: number) => {
        const pose = albumStackPose(photos.length, photoIndex);
        return (
          <span
            key={item.id}
            className="album-stack-photo"
            style={{
              "--x": `${pose.x}%`,
              "--y": `${pose.y}%`,
              "--r": `${pose.r}deg`,
              "--hx": `${pose.hx}%`,
              "--hy": `${pose.hy}%`,
              "--hr": `${pose.hr}deg`,
              zIndex: photoIndex === 1 ? 3 : photoIndex === 2 ? 2 : 1,
            } as React.CSSProperties}
          >
            {albumItems[photoIndex]?.kind === "video" ? (
              <VideoThumb src={assetUrl(item.path)} name={item.name} />
            ) : (
              <img src={assetUrl(item.path)} alt="" loading="lazy" />
            )}
          </span>
        );
      })}
    </span>
  );
}

function AlbumsScreen(props: any) {
  const albums = React.useMemo(
    () =>
      (props.albums || []).map((album: any, index: number) => {
        const albumItems = (props.items || []).filter((item: any) =>
          item.albumIds?.includes(album.id)
        );
        // Skip RAW-only files for the cover fan; they have no poster frame.
        const photos = albumItems
          .filter((item: any) => item.kind === "photo" || item.kind === "video")
          .slice(0, 3);
        if (false && photos.length) {
          console.log(`[AlbumsScreen] Album "${album.name}" (${album.id}) cover photos:`, photos.map((p: any) => p.name));
        }
        return {
          ...album,
          photos,
          count: albumItems.length || album.itemCount || 0,
          color: ["coral", "violet", "blue", "green"][index % 4],
        };
      }),
    [props.albums, props.items]
  );

  return (
    <div className="feature-page albums-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COLLECTIONS</p>
          <h1>Albums</h1>
          <p className="page-subtitle">
            {albums.length.toLocaleString()} {albums.length === 1 ? "album" : "albums"} · Choose an album to see its photos.
          </p>
        </div>
      </div>

      {albums.length === 0 ? (
        <div className="empty-state albums-empty">
          <span><AlbumsIcon size={30} /></span>
          <b>No albums yet</b>
          <p>Create an album, then select photos in Library and choose Add to album.</p>
          <button className="primary-button" type="button" onClick={() => props.onCreateAlbum?.()}>
            <PlusIcon size={14} /> Create album
          </button>
        </div>
      ) : (
        <div className="albums-grid">
          {albums.map((album: any) => (
            <button
              key={album.id}
              type="button"
              className="album-card"
              onClick={() => props.onOpenAlbum(album.id)}
              onContextMenu={(e) => props.onAlbumContextMenu?.(album, e)}
              title={`Open ${album.name}`}
            >
              <span className={`album-cover ${album.photos.length ? "" : "is-empty"}`}>
                {album.photos.length ? (
                  <AlbumPhotoStack photos={album.photos} assetUrl={props.assetUrl} albumItems={(props.items || []).filter((i: any) => i.albumIds?.includes(album.id))} />
                ) : (
                  <span className="album-cover-placeholder">
                    <AlbumsIcon size={30} />
                    {album.count === 0 && <small>Empty</small>}
                  </span>
                )}
              </span>
              <span className="album-card-meta">
                <span className="album-card-name">
                  <i className={`album-dot ${album.color}`} />
                  <span>{album.name}</span>
                </span>
                <span className="album-card-count">
                  {album.count > 0 ? `${album.count.toLocaleString()} ${album.count === 1 ? "item" : "items"}` : "Empty"}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className="album-card album-card-add"
            onClick={() => props.onCreateAlbum?.()}
            aria-label="Create new album"
          >
            <span className="album-cover-add">
              <PlusIcon size={28} />
            </span>
            <span className="album-card-meta">
              <span className="album-card-name">New album</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function ExploreScreen(props: any) {
  const library = useLibraryStore();
  const [query, setQueryState] = React.useState("");
  const [recent, setRecent] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("explore:recent") || "[]"); } catch { return []; }
  });

  const items = props.items || [];

  const saveRecent = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem("explore:recent", JSON.stringify(next)); } catch {}
  };

  const runSearch = (q: string) => {
    const val = q.trim();
    setQueryState(val);
    library.setQuery(val);
    if (val) saveRecent(val);
    props.onNavigate("Library");
  };

  const applyFilter = (filter: Filter) => {
    library.setFilter(filter);
    props.onNavigate("Library");
  };

  const extensions = React.useMemo(() => [...new Set(items.map((i: any) => (i.extension || "").toUpperCase()).filter(Boolean))].slice(0, 8), [items]);
  const folders = React.useMemo(() => [...new Set(items.map((i: any) => (i.path || "").split("/").slice(0, -1).join("/")).filter(Boolean))].slice(0, 6), [items]);
  const tags = React.useMemo(() => [...new Set(items.flatMap((i: any) => i.tags || []))].slice(0, 8), [items]);
  const suggestions = React.useMemo(() => [...extensions, ...folders].slice(0, 10), [extensions, folders]);
  const previewItems = React.useMemo(() => items.slice(0, 12), [items]);

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem("explore:recent"); } catch {}
  };

  return (
    <div className="feature-page">
      <div className="page-heading">
        <div><p className="eyebrow">SEARCH & DISCOVERY</p><h1>Find the moment.</h1><p className="page-subtitle">Search filenames, folders, tags, and formats. Everything stays on your device.</p></div>
      </div>

      <div className="semantic-hero">
        <div className="semantic-orb"><SearchIcon size={22} /></div>
        <div><span className="eyebrow">PRIVATE LIBRARY SEARCH</span><h2>What are you looking for?</h2><p>Search works on names, paths, tags, and formats. No photos leave your device.</p></div>
        <div className="semantic-search"><SearchIcon size={15} /><input value={query} onChange={(e) => setQueryState(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(query); else if (e.key === "Escape" && query) { setQueryState(""); library.setQuery(""); } }} placeholder="Search a filename, folder, tag, or format" /><kbd>↵</kbd></div>
        <div className="search-suggestions">
          <span>In your library:</span>
          {suggestions.length ? suggestions.map((s: any) => <button type="button" key={s} onClick={() => runSearch(s)}>{s}</button>) : <small>Open a folder to index local names.</small>}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="feature-card">
          <div className="feature-card-heading"><div><h3>Recent searches</h3><p>Jump back to a previous query.</p></div><button type="button" className="quiet-button" onClick={clearRecent}>Clear</button></div>
          <div className="search-suggestions">{recent.map((r: any) => <button type="button" key={r} onClick={() => runSearch(r)}>{r}</button>)}</div>
        </div>
      )}

      <div className="feature-grid two">
        <div className="feature-card">
          <div className="feature-card-heading"><span className="feature-icon violet-bg"><UsersIcon size={17} /></span><div><h3>Smart filters</h3><p>Quickly narrow the library.</p></div></div>
          <div className="rule-line"><span>Favorites</span><b>{items.filter((i: any) => i.favorite).length}</b><button type="button" onClick={() => applyFilter("Favorites")}>Show</button></div>
          <div className="rule-line"><span>Videos</span><b>{items.filter((i: any) => i.kind === "video").length}</b><button type="button" onClick={() => applyFilter("Videos")}>Show</button></div>
          <div className="rule-line"><span>RAW</span><b>{items.filter((i: any) => i.kind === "raw").length}</b><button type="button" onClick={() => applyFilter("RAW")}>Show</button></div>
          <div className="rule-line"><span>Hidden</span><b>{items.filter((i: any) => i.hidden).length}</b><button type="button" onClick={() => applyFilter("Hidden")}>Show</button></div>
        </div>
        <div className="feature-card">
          <div className="feature-card-heading"><span className="feature-icon green-bg"><TagIcon size={17} /></span><div><h3>Tags & formats</h3><p>Explore by metadata.</p></div></div>
          <div className="search-suggestions">
            {tags.map((t: any) => <button type="button" key={t} onClick={() => runSearch(t)}>{t}</button>)}
            {extensions.map((e: any) => <button type="button" key={e} onClick={() => runSearch(e)}>{e}</button>)}
            {!tags.length && !extensions.length && <small>No tags or formats yet.</small>}
          </div>
        </div>
      </div>

      <div className="feature-card">
        <div className="feature-card-heading"><div><h3>Recently added</h3><p>Latest items in your library.</p></div><button type="button" className="quiet-button" onClick={() => props.onNavigate("Library")}>View all</button></div>
        <div className="duplicate-grid">
          {previewItems.map((item: any) => (
            <div className="duplicate-card" key={item.id} onClick={() => { library.inspectItem(item.id); props.onNavigate("Library"); }}>
              {item.kind === "photo" ? <img src={props.assetUrl(item.path)} alt={item.name} /> : <div className="duplicate-nonimage"><KindBadge kind={item.kind} /></div>}
              <div><span>{item.name}</span><small>{formatBytesSimple(item.size)}</small></div>
            </div>
          ))}
        </div>
      </div>

      <div className="feature-grid two">
        <div className="feature-card">
          <div className="feature-card-heading"><span className="feature-icon violet-bg"><HeartIcon size={17} /></span><div><h3>Favorites</h3><p>{items.filter((i: any) => i.favorite).length} starred items.</p></div><button type="button" className="quiet-button" onClick={() => applyFilter("Favorites")}>Open</button></div>
        </div>
        <div className="feature-card">
          <div className="feature-card-heading"><span className="feature-icon green-bg"><SparkleIcon size={17} /></span><div><h3>Coming soon</h3><p>On-device faces, objects, scenes, and OCR search.</p></div><span className="beta-badge">FUTURE</span></div>
        </div>
      </div>
    </div>
  );
}

function DuplicatesScreen(props: any) {
  return (
    <div className="feature-page">
      <div className="page-heading">
        <div><p className="eyebrow">EXACT DUPLICATE SCAN</p><h1>Find identical files.</h1><p className="page-subtitle">SHA-256 checksums run locally. Similar-looking but different photos are not included.</p></div>
        <button className="primary-button" type="button" onClick={props.onScan} disabled={props.busy}><RotateIcon size={14} /> Scan library</button>
      </div>
      {props.groups.length === 0 ? (
        <div className="empty-state duplicate-empty"><span><DuplicatesIcon size={28} /></span><b>No duplicate scan yet</b><p>Compare file contents, not just names or file sizes.</p><button className="primary-button" type="button" onClick={props.onScan} disabled={props.busy}>Scan {props.items?.length || 0} files</button></div>
      ) : (
        <div>
          {props.groups.map((group: any, index: number) => (
            <section className="duplicate-result" key={index}>
              <div className="duplicate-group-head"><div><b>Identical files</b><span>{group.items?.length || 0} copies · SHA-256 match</span></div></div>
              <div className="duplicate-grid">
                {(group.items || []).map((item: any, i: number) => (
                  <div className={`duplicate-card ${i === 0 ? "keep" : ""}`} key={item.id}>
                    {item.kind === "photo" ? <img src={props.assetUrl(item.path)} alt={item.name} /> : <div className="duplicate-nonimage"><KindBadge kind={item.kind} /></div>}
                    <div><span>{i === 0 ? "Keep original" : "Select copy"}</span><small>{formatBytesSimple(item.size)} · {item.path}</small></div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytesSimple(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  // Step up through units so a 7.5 GB library reads as "7.3 GB" instead of
  // "7504.9 MB", and a 2 TB drive as "2.0 TB" instead of "2048.0 GB".
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes need no fraction; larger units read best with one decimal.
  const decimals = unit === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

// Browser-based media item creation (temporary until the Tauri backend is
// wired). Items are normalized to the same shape as the native catalog so the
// browser prototype and the Rust store agree on a single MediaItem layout.
async function createMediaItemsBrowser(
  files: FileList | File[],
): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  for (const file of Array.from(files)) {
    if (!file.name || file.name.startsWith(".")) continue;
    const relativePath = (file as File & { webkitRelativePath?: string })
      .webkitRelativePath || file.name;
    const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
    const videoExts = new Set(["m4v", "mov", "mp4", "mpeg", "mpg", "webm"]);
    const rawExts = new Set(["arw", "cr2", "cr3", "dng", "nef", "raf", "raw", "rw2"]);
    const imageExts = new Set(["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "tif", "tiff", "webp"]);
    // "unsupported" is a sentinel for "no known kind" - it is not a MediaKind.
    let kind: MediaKind | "unsupported" = "unsupported";
    if (videoExts.has(ext)) kind = "video";
    else if (rawExts.has(ext)) kind = "raw";
    else if (imageExts.has(ext)) kind = "photo";
    if (kind === "unsupported") continue;

    const url = URL.createObjectURL(file);
    let width: number | undefined;
    let height: number | undefined;
    if (kind === "photo") {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          width = img.naturalWidth;
          height = img.naturalHeight;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
      if (!width || !height) {
        // Could not read the dimensions - treat as unsupported and skip.
        URL.revokeObjectURL(url);
        continue;
      }
    }

    items.push({
      id: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`,
      // Browser has no real absolute path; keep a session-relative stand-in.
      path: relativePath,
      name: file.name,
      extension: ext,
      kind,
      size: file.size,
      modifiedAt: file.lastModified,
      // In-memory import: the browser exposes no true capture time or camera
      // data, so fall back to the file's mtime for ordering.
      capturedAt: file.lastModified,
      width,
      height,
      favorite: false,
      hidden: false,
      tags: [],
      albumIds: [],
      inVault: false,
      createdAt: file.lastModified,
      updatedAt: file.lastModified,
    });
  }
  return items;
}

export default App;