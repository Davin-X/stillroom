# Stillroom - Design Analysis & Native macOS App Specification

## Executive Summary

Stillroom is a **local-first photo & video gallery** prototype built as a React/Vite web app. The design is remarkably sophisticated - it mimics native macOS patterns (traffic lights, sidebar navigation, three-pane layout, translucent overlays) while being entirely web-based. The goal is to transform this into a **production-grade native macOS app using Tauri 2 + Rust**.

---

## 1. Design System Analysis

### 1.1 Color System (CSS Custom Properties)

**Light Mode:**
```css
--surface: #ffffff        /* Primary backgrounds */
--surface-2: #f7f8fa      /* Secondary surfaces */
--surface-3: #edf0f4      /* Tertiary/hover surfaces */
--sidebar: #f4f6f8        /* Sidebar background */
--ink: #202a36            /* Primary text */
--text: #3f4b5a           /* Secondary text */
--muted: #687587          /* Muted text */
--faint: #778394          /* Very subtle text */
--line: #e1e6ec           /* Borders */
--line-strong: #cbd3dd    /* Strong borders */
--blue: #3474d4           /* Primary accent */
--blue-soft: #eaf1fc      /* Blue tint backgrounds */
--green: #27845f          /* Success/positive */
```

**Dark Mode:**
```css
--surface: #171c23
--surface-2: #1d232c
--surface-3: #282f39
--sidebar: #1a2028
--ink: #edf1f6
--text: #d1d8e1
--muted: #a4afbc
--faint: #95a1af
--line: #303844
--line-strong: #444f5d
--blue: #8ab4ff
--blue-soft: #263a56
--green: #6bc69a
```

**Key Observations:**
- 11 semantic color tokens - complete theming system
- Dark mode is a full inverse, not just darkened colors
- Blue accent is primary; green for success/positive states
- Subtle gradients used for brand elements (brand-icon, semantic-orb)

### 1.2 Typography Scale

| Token | Size | Weight | Letter-spacing | Usage |
|-------|------|--------|----------------|-------|
| Display | 30-31px | 650 | -0.04em | Page titles (h1) |
| Heading 2 | 21-23px | 650 | -0.03em | Section titles |
| Heading 3 | 16px | 600 | -0.02em | Sub-sections |
| Body Large | 14px | 400 | normal | Base font-size |
| Body | 13px | 550 | normal | Buttons, nav, inputs |
| Small | 12px | 400 | normal | Captions, metadata |
| Micro | 11px | 650 | 0.075em | Labels, badges, eyebrow |
| Tiny | 10-11px | varies | varies | Metadata values |

**Font Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (system fonts)

### 1.3 Spacing & Layout

- **Base unit:** 1px (no explicit spacing scale, but consistent multiples of 4-8px)
- **Border radius scale:** 4px (tiny), 5-6px (small), 7-8px (medium), 9-10px (large), 12-14px (XL), 15-18px (2XL), 22px (avatar)
- **Shadows:** Layered system - subtle (0 2px 8px) for cards, strong (0 24px 64px) for main window
- **Breakpoints:** 1160px, 900px, 700px, 420px - responsive three-pane → two-pane → single-pane

### 1.4 Component Inventory

#### Navigation & Shell
- **Topbar** (60px): Traffic lights, brand, status, theme toggle, avatar
- **Sidebar** (220px): Primary nav (9 items), Albums section, Storage widget, Privacy note
- **Main Content**: Flexible, three-pane when inspector open

#### Library Screen (Primary)
- **PageHeading**: Eyebrow, title, subtitle, actions
- **CollectionToolbar**: Search (⌘F), Filter button, Album button, Layout switcher (3 modes)
- **SmartFilterRow**: 6 filter chips (All, Photos, Videos, RAW, Favorites, Hidden) with counts
- **GalleryGrid**: 3 layouts (Grid 3-col, Filmstrip 4-col, Overview 2-col)
  - **GalleryTile**: Thumbnail, selection checkbox, format badge, video indicator, caption
- **FilmstripPreview**: Horizontal scroll at bottom in filmstrip mode
- **SelectionToolbar**: Sticky bottom bar when items selected
- **PhotoInspector** (276px): Image preview, actions (favorite/share/hide), metadata, location, EXIF, tags

#### Viewer Screen
- **ViewerStage**: Full-size image/video with zoom (25-300%), arrow navigation
- **Overlays**: Top (filename, index), Bottom (zoom controls, favorite, edit, fullscreen)
- **Caption**: Filename, date, format, size
- **Filmstrip**: Horizontal thumbnail navigator

#### Edit Screen (Non-destructive)
- **EditCanvas**: Live preview with CSS filters (brightness, contrast, sepia, hue-rotate, saturate)
- **CanvasActions**: Rotate, Flip, Crop toggle
- **EditControls**: 6 sliders (Exposure, Shadows, Highlights, Contrast, Saturation, Warmth) ±80%
- **Auto button**: Preset values
- **Export**: Renders to canvas → blob → download

#### Batch Tools Screen
- **Stepper**: 3-step progress (Select → Actions → Export)
- **BatchOptions**: Checklist of operations (Rename, Convert, Resize, Strip metadata, Quality)
- **BatchConfig**: Pattern input, format select, quality slider
- **BatchPreview**: Shows first few output filenames
- **Export**: Parallel processing with progress

#### Duplicates Screen
- **Scan**: SHA-256 grouping by size → hash
- **Results**: Groups with "Keep original" + checkboxes for copies
- **Safety**: Never auto-delete, review in Finder

#### Explore Screen
- **Semantic Search Hero**: Orb, headline, search input
- **Suggestions**: Extensions + folders as quick filters
- **Feature Cards**: Future native features (people/objects, smart filters, Finder tags)

#### Private Vault Screen
- **Lock State**: Beautiful lock illustration, unlock button (Touch ID placeholder)
- **Unlocked State**: Settings (auto-lock timeout, lock on sleep), thumbnails grid

#### Slideshow Screen
- **Stage**: Full-bleed image/video with gradient overlays
- **Caption**: Filename, date, location
- **Controls**: Play/pause, interval (3-30s), shuffle
- **Settings Panel**: Interval, shuffle, transition

#### Settings Screen
- **SettingsList**: Grouped rows with icons
- **Rows**: Appearance (system/light/dark), Library location, Cache size, Auto-import, Metadata, Advanced

---

## 2. Interaction Patterns & UX Flows

### 2.1 Primary Flows

| Flow | Entry Point | Steps | Exit |
|------|-------------|-------|------|
| **Import** | Library empty state / Toolbar | Folder picker → Scan → Thumbnails → Grid | Library |
| **Browse** | Library | Filter → Search → Layout switch → Select | Viewer/Edit/Batch |
| **View** | Double-click / Enter | Navigate ←→, Zoom, Fullscreen, Favorite | Library |
| **Edit** | Viewer "Edit" / Library context | Adjust sliders → Auto → Crop/Rotate → Export copy | Library |
| **Batch** | Library multi-select → Batch tools | Configure → Preview → Export | Library |
| **Duplicates** | Nav → Duplicates | Scan → Review groups → Select copies → Export | Library |
| **Vault** | Nav → Private vault | Authenticate (Touch ID) → Manage hidden | Library |
| **Slideshow** | Nav → Slideshow | Play → Interval/Shuffle → Navigate | Library |

### 2.2 Keyboard Shortcuts
- `←/→` - Navigate in Viewer/Slideshow
- `Esc` - Exit Viewer/Slideshow/Vault
- `Space` - Play/pause Slideshow
- `⌘F` - Focus search
- `Double-click` - Zoom toggle (Viewer), Open Viewer (Library)

### 2.3 Selection Model
- **Single click** → Select + open inspector
- **⌘+Click** → Toggle multi-select
- **Shift+Click** → Range select
- **Checkbox** (hover tile) → Explicit multi-select
- **SelectedIds array** drives Batch tools, Albums, Duplicates

---

## 3. Data Model

```typescript
interface MediaItem {
  id: string;                    // `${name}:${size}:${modified}:${random}`
  file: File;                    // Browser File object (web) / Path (native)
  url: string;                   // objectURL (web) / file:// path (native)
  name: string;                  // Filename
  relativePath: string;          // Relative path from import root
  extension: string;             // Lowercase extension
  kind: "photo" | "video" | "raw" | "unsupported";
  modifiedAt: number;            // File modified timestamp
  capturedAt?: number;           // EXIF DateTimeOriginal
  width?: number;                // Pixel width
  height?: number;               // Pixel height
  camera?: string;               // Make + Model
  lens?: string;                 // LensModel
  exposure?: string;             // Formatted exposure
  iso?: number;                  // ISO
  latitude?: number;             // GPS latitude
  longitude?: number;            // GPS longitude
  metadataError?: string;        // EXIF parse errors
  favorite: boolean;             // User favorite
  hidden: boolean;               // Hidden from main grid
  tags: string[];                // User tags (session-only in web)
}
```

**Derived State:**
- `albums: string[]` - Album names
- `albumItems: Record<string, string[]>` - Album → item IDs
- `duplicates: string[][]` - Groups of duplicate item IDs
- `editValues: EditValues` - Current edit adjustments
- `selectedId: string | null` - Primary selection
- `selectedIds: string[]` - Multi-selection

---

## 4. Native macOS Architecture (Tauri 2)

### 4.1 Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      Stillroom.app                              │
├────────────────────────────┬────────────────────────────────────┤
│      WebView (Wry)         │        Rust Backend                │
│  ┌────────────────────┐   │  ┌──────────────────────────────┐  │
│  │ React + TypeScript │   │  │ Tauri Commands (async)       │  │
│  │ - UI Components    │◄──┼──┤ - scan_library               │  │
│  │ - State (Zustand)  │   │  │ - read_metadata              │  │
│  │ - CSS (design sys) │   │  │ - compute_hashes             │  │
│  └────────────────────┘   │  │ - render_edited              │  │
│                           │  │ - watch_folders              │  │
│                           │  │ - vault_operations           │  │
│                           │  │ - finder_integration         │  │
│                           │  └──────────────────────────────┘  │
│                           │  ┌──────────────────────────────┐  │
│                           │  │ Background Services          │  │
│                           │  │ - Folder watcher (notify)    │  │
│                           │  │ - Thumbnail generator        │  │
│                           │  │ - Import queue               │  │
│                           │  └──────────────────────────────┘  │
│                           │  ┌──────────────────────────────┐  │
│                           │  │ Persistence (SQLite)         │  │
│                           │  │ - media_items table          │  │
│                           │  │ - albums table               │  │
│                           │  │ - tags table                 │  │
│                           │  │ - vault_items table          │  │
│                           │  └──────────────────────────────┘  │
└────────────────────────────┴────────────────────────────────────┘
```

### 4.2 Tauri Commands API

```rust
// Library Management
#[command] async fn scan_library(root_path: String) -> Result<ScanResult>
#[command] async fn get_library_items(filter: LibraryFilter) -> Result<Vec<MediaItem>>
#[command] async fn get_item_thumbnail(id: String, size: ThumbSize) -> Result<Vec<u8>>

// File Operations
#[command] async fn import_folder(path: String) -> Result<ImportResult>
#[command] async fn import_files(paths: Vec<String>) -> Result<ImportResult>
#[command] async fn export_edited(item: ExportRequest) -> Result<ExportResult>
#[command] async fn batch_export(request: BatchExportRequest) -> Result<BatchResult>

// Metadata
#[command] async fn read_exif(path: String) -> Result<ExifData>
#[command] async fn write_exif(path: String, data: ExifData) -> Result<()>
#[command] async fn read_dimensions(path: String) -> Result<Dimensions>

// Hashing & Duplicates
#[command] async fn compute_sha256(path: String) -> Result<String>
#[command] async fn find_duplicates(library_id: i64) -> Result<Vec<DuplicateGroup>>

// Vault (Secure Enclave / Keychain)
#[command] async fn vault_unlock(biometric: bool) -> Result<VaultSession>
#[command] async fn vault_lock() -> Result<()>
#[command] async fn vault_add_items(ids: Vec<String>) -> Result<()>
#[command] async fn vault_remove_items(ids: Vec<String>) -> Result<()>
#[command] async fn vault_list_items() -> Result<Vec<MediaItem>>

// Finder Integration
#[command] async fn write_finder_tags(path: String, tags: Vec<String>) -> Result<()>
#[command] async fn read_finder_tags(path: String) -> Result<Vec<String>>
#[command] async fn move_to_trash(paths: Vec<String>) -> Result<()>
#[command] async fn reveal_in_finder(path: String) -> Result<()>

// Folder Watching
#[command] async fn start_watching(path: String) -> Result<()>
#[command] async fn stop_watching(path: String) -> Result<()>

// App Lifecycle
#[command] async fn get_app_version() -> Result<String>
#[command] async fn check_updates() -> Result<UpdateInfo>
```

### 4.3 SQLite Schema

```sql
-- Main media catalog
CREATE TABLE media_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,           -- Stable UUID for cross-session identity
    path TEXT NOT NULL UNIQUE,           -- Absolute file path
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('photo','video','raw')),
    size INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,        -- File mtime (ms)
    captured_at INTEGER,                 -- EXIF DateTimeOriginal (ms)
    width INTEGER,
    height INTEGER,
    camera TEXT,
    lens TEXT,
    exposure TEXT,
    iso INTEGER,
    latitude REAL,
    longitude REAL,
    metadata_error TEXT,
    sha256 TEXT,                         -- Content hash for dedup
    favorite INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    in_vault INTEGER DEFAULT 0,
    import_session_id INTEGER,           -- Links to import_sessions
    created_at INTEGER DEFAULT (strftime('%s','now')*1000),
    updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX idx_media_path ON media_items(path);
CREATE INDEX idx_media_captured ON media_items(captured_at);
CREATE INDEX idx_media_kind ON media_items(kind);
CREATE INDEX idx_media_favorite ON media_items(favorite);
CREATE INDEX idx_media_hidden ON media_items(hidden);
CREATE INDEX idx_media_vault ON media_items(in_vault);
CREATE INDEX idx_media_sha256 ON media_items(sha256);

-- Albums (user-created collections)
CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color_index INTEGER DEFAULT 0,       -- 0-3 for coral/violet/blue/green dots
    created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE album_items (
    album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
    media_id INTEGER REFERENCES media_items(id) ON DELETE CASCADE,
    added_at INTEGER DEFAULT (strftime('%s','now')*1000),
    PRIMARY KEY (album_id, media_id)
);

-- Tags (app tags, synced to Finder optionally)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color_index INTEGER DEFAULT 0
);

CREATE TABLE media_tags (
    media_id INTEGER REFERENCES media_items(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, tag_id)
);

-- Import sessions (for "recent imports" view)
CREATE TABLE import_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_path TEXT NOT NULL,
    file_count INTEGER DEFAULT 0,
    started_at INTEGER DEFAULT (strftime('%s','now')*1000),
    completed_at INTEGER
);

-- Vault (encrypted items)
CREATE TABLE vault_items (
    media_id INTEGER PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
    encrypted_key BLOB NOT NULL,         -- Per-item key wrapped by vault master key
    added_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- App settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## 5. Native macOS Features to Implement

### 5.1 File System & Import
- **Folder Bookmarking** (Security-Scoped Bookmarks) - Persistent access to user-selected folders
- **Continuous Watching** (notify crate + FSEvents) - Auto-import new files
- **Zero-Copy Thumbnails** - Generate thumbnails via Core Graphics / Image I/O, store in `~/Library/Caches/com.devendrakumar.stillroom/Thumbnails/`
- **Background Import Queue** - Process large imports without blocking UI

### 5.2 Image Processing (Native)
- **RAW Decoding** - Use `rawler` crate or Core Image (`CIRAWFilter`) for native RAW support
- **HEIC/HEIF** - Native via Image I/O
- **JPEG XL** - Native via Image I/O (macOS 13+)
- **Non-Destructive Editing** - Store edit params in DB; render on export via Core Image filter chain
- **GPU Acceleration** - Metal-backed rendering for preview

### 5.3 Metadata & EXIF
- **kamadak-exif** or **exif-rs** for reading
- **Write-back** - Optionally write ratings/tags to XMP sidecars or embedded EXIF
- **GPS Privacy** - Option to strip location on export

### 5.4 Security & Vault
- **Secure Enclave** (via `security-framework` crate) - Biometric unlock
- **Keychain** - Store vault master key
- **Per-Item Encryption** - AES-GCM via `aes-gcm` crate, keys wrapped by master key
- **Auto-Lock** - On sleep, screensaver, timeout (configurable)

### 5.5 Finder Integration
- **Tags** - Read/write `com.apple.metadata:_kMDItemUserTags` (xattr)
- **Comments** - Read/write `com.apple.metadata:kMDItemFinderComment`
- **Trash** - `NSFileManager.trashItemAtURL` via `objc2-foundation`
- **Quick Look** - Generate thumbnails for Finder preview
- **Services** - "Open in Stillroom" from Finder context menu

### 5.6 System Integration
- **Menu Bar** - Native macOS menu (File, Edit, View, Window, Help)
- **Dock Menu** - Recent folders, quick actions
- **Touch Bar** (if applicable) - Navigation, favorite, edit
- **Trackpad Gestures** - Pinch zoom, swipe navigate, force touch preview
- **Drag & Drop** - Export to Finder, import from Finder
- **Share Sheet** - `NSSharingServicePicker`
- **Print** - Native print dialog
- **Spotlight** - `MDImporter` for indexing (advanced)

---

## 6. Frontend Architecture (React + Tauri)

### 6.1 State Management (Zustand)

```typescript
// stores/useLibraryStore.ts
interface LibraryState {
  // Data
  items: MediaItem[];
  albums: Album[];
  tags: Tag[];
  duplicates: DuplicateGroup[];
  
  // UI State
  selectedId: string | null;
  selectedIds: string[];
  filter: Filter;
  query: string;
  layout: LayoutMode;
  activeAlbum: string | null;
  showInspector: boolean;
  
  // Async
  busy: boolean;
  notice: string | null;
  
  // Actions
  loadLibrary: (filter?: LibraryFilter) => Promise<void>;
  importFolder: () => Promise<void>;
  importFiles: () => Promise<void>;
  selectItem: (id: string, multi?: boolean) => void;
  setFilter: (filter: Filter) => void;
  setQuery: (query: string) => void;
  setLayout: (layout: LayoutMode) => void;
  toggleFavorite: (id: string) => Promise<void>;
  toggleHidden: (id: string) => Promise<void>;
  addTags: (id: string, tags: string[]) => Promise<void>;
  createAlbum: (name: string, itemIds?: string[]) => Promise<void>;
  scanDuplicates: () => Promise<void>;
  exportItems: (ids: string[], options: ExportOptions) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>; // Move to trash
}

// Similar stores for: Viewer, Edit, Vault, Slideshow, Settings
```

### 6.2 Tauri Adapter Layer

```typescript
// lib/tauri.ts - All native communication
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readDir, readFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { listen, emit } from "@tauri-apps/api/event";

// Type-safe command wrappers
export const tauri = {
  library: {
    scan: (rootPath: string) => invoke<ScanResult>("scan_library", { rootPath }),
    getItems: (filter: LibraryFilter) => invoke<MediaItem[]>("get_library_items", { filter }),
    getThumbnail: (id: string, size: number) => invoke<string>("get_item_thumbnail", { id, size }), // base64
  },
  files: {
    importFolder: () => open({ directory: true, multiple: false }),
    importFiles: () => open({ directory: false, multiple: true, filters: [{ name: "Media", extensions: [...] }] }),
    export: (blob: Blob, suggestedName: string) => save({ defaultPath: suggestedName }),
    revealInFinder: (path: string) => invoke("reveal_in_finder", { path }),
    moveToTrash: (paths: string[]) => invoke("move_to_trash", { paths }),
  },
  metadata: {
    readExif: (path: string) => invoke<ExifData>("read_exif", { path }),
    writeExif: (path: string, data: ExifData) => invoke("write_exif", { path, data }),
  },
  editing: {
    render: (request: RenderRequest) => invoke<ExportResult>("render_edited", { request }),
  },
  batch: {
    export: (request: BatchExportRequest) => invoke<BatchResult>("batch_export", { request }),
  },
  duplicates: {
    scan: () => invoke<DuplicateGroup[]>("find_duplicates", {}),
  },
  vault: {
    unlock: (biometric: boolean) => invoke<VaultSession>("vault_unlock", { biometric }),
    lock: () => invoke("vault_lock", {}),
    add: (ids: string[]) => invoke("vault_add_items", { ids }),
    remove: (ids: string[]) => invoke("vault_remove_items", { ids }),
    list: () => invoke<MediaItem[]>("vault_list_items", {}),
  },
  finder: {
    writeTags: (path: string, tags: string[]) => invoke("write_finder_tags", { path, tags }),
    readTags: (path: string) => invoke<string[]>("read_finder_tags", { path }),
  },
  watcher: {
    start: (path: string) => invoke("start_watching", { path }),
    stop: (path: string) => invoke("stop_watching", { path }),
  },
  events: {
    onLibraryChanged: (callback: (event: LibraryChangedEvent) => void) => listen("library-changed", callback),
    onImportProgress: (callback: (event: ImportProgressEvent) => void) => listen("import-progress", callback),
    onThumbnailReady: (callback: (event: ThumbnailReadyEvent) => void) => listen("thumbnail-ready", callback),
  },
};
```

### 6.3 Component Migration Strategy

| Web Component | Native Adaptation |
|---------------|-------------------|
| `App.tsx` (monolithic) | Split into feature stores + screen components |
| `createMediaItems()` (browser) | → `tauri.library.scan()` + `tauri.library.getItems()` |
| `URL.createObjectURL()` | → `file://` paths or `asset://` protocol + thumbnails |
| `exifr.parse()` | → `tauri.metadata.readExif()` |
| `crypto.subtle.digest()` | → `tauri.duplicates.scan()` (server-side) |
| `canvas.toBlob()` export | → `tauri.editing.render()` (Core Image) |
| `<input webkitdirectory>` | → `tauri.files.importFolder()` (native picker) |
| In-memory state | → SQLite + Zustand (hydrated from DB) |

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] `tauri init` with proper config
- [ ] SQLite setup with migrations (`sqlx`)
- [ ] Basic Tauri commands: `scan_library`, `get_library_items`, `read_exif`, `compute_sha256`
- [ ] TypeScript adapter layer (`lib/tauri.ts`)
- [ ] Zustand store for library
- [ ] Migrate `App.tsx` to use native commands
- [ ] Native folder picker + drag-drop import

### Phase 2: Core Gallery (Week 2-3)
- [ ] Thumbnail generation (background, cached)
- [ ] Virtualized grid (react-window) for 10k+ items
- [ ] Persistent selection/albums/tags in DB
- [ ] Keyboard navigation throughout
- [ ] Dark/light/system theme sync with macOS

### Phase 3: Viewer & Edit (Week 3-4)
- [ ] Native image viewer (zoom, pan, navigate)
- [ ] Video playback (AVPlayer via webview or native)
- [ ] Non-destructive edit pipeline (Core Image)
- [ ] RAW preview via `rawler` / Core Image
- [ ] Export edited copies (JPEG/PNG/HEIC/AVIF)

### Phase 4: Advanced Features (Week 4-5)
- [ ] Batch export with progress
- [ ] Duplicate scanner (background, incremental)
- [ ] Folder watching (auto-import)
- [ ] Finder tags read/write
- [ ] Trash integration

### Phase 5: Vault & Polish (Week 5-6)
- [ ] Secure Enclave / Touch ID vault
- [ ] Per-item encryption
- [ ] Auto-lock policies
- [ ] Menu bar, Dock menu, Services
- [ ] Trackpad gestures
- [ ] Spotlight indexing (optional)
- [ ] Accessibility (VoiceOver, full keyboard)

### Phase 6: Distribution (Week 6)
- [ ] Code signing & notarization
- [ ] Sparkle updates
- [ ] DMG + .app bundle
- [ ] TestFlight / Mac App Store prep

---

## 8. Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Tauri 2 (not Electron)** | Smaller binary (~3MB vs ~100MB), Rust backend, system webview |
| **SQLite + sqlx** | Compile-time checked queries, single file, no separate server |
| **Zustand (not Redux)** | Simpler, less boilerplate, works with React 18 |
| **Virtualized Grid** | Handle 50k+ photos smoothly |
| **Core Image for Editing** | GPU-accelerated, non-destructive, supports RAW |
| **Security-Scoped Bookmarks** | Persistent folder access across restarts (sandbox) |
| **Notify (FSEvents)** | Efficient folder watching, low CPU |
| **Keychain + Secure Enclave** | Hardware-backed vault encryption |

---

## 9. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| RAW format support | Start with `rawler` crate; fallback to embedded JPEG preview |
| Large library performance | Virtualization, pagination, background indexing, thumbnail caching |
| Sandbox file access | Security-scoped bookmarks + user-granted folders |
| Memory pressure | Stream processing, chunked imports, weak thumbnail cache |
| macOS version fragmentation | Minimum macOS 13 (Ventura) for modern APIs |

---

## 10. Success Criteria

- [ ] Launch to interactive in < 2s (cold), < 500ms (warm)
- [ ] Scroll 10,000 photos at 60fps
- [ ] Import 1,000 RAW files without UI freeze
- [ ] Edit + export 42MP photo in < 3s
- [ ] Vault unlock with Touch ID in < 500ms
- [ ] Binary size < 15MB (universal)
- [ ] Pass Apple notarization
- [ ] Zero network requests (truly local-first)

---

*This analysis forms the blueprint for building a production-grade native macOS photo gallery that honors the original design while leveraging macOS platform capabilities.*