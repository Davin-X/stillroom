# Design Improvements - Settings & App Chrome

## 1. Settings Screen Redesign

### Current Problems
- Section headers masquerading as tabs (11px, not clickable)
- No tab keyboard navigation
- Tiny, cramped rows
- No visual hierarchy
- "Privacy & Storage" mixes unrelated concepts
- No real settings - mostly "not implemented" badges

### New Design: Tabbed Preferences Window

```
┌─────────────────────────────────────────────────────────────────┐
│  General    Viewing    Library    Privacy & Security    Advanced │  ← Tabs
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Appearance                                                │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  ○ Light    ○ Dark    ● System                      │   │  │  ← Radio group
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │  Accent Color  [🎨 Blue] [🎨 Purple] [🎨 Green] [🎨 Orange]│  │
│  │                                                            │  │
│  │  Sidebar Width  ━━━━━━━━━━━━━━━━━━━━ 220px                │  │  ← Slider
│  │                                                            │  │
│  │  ☑ Show file extensions in grid                          │  │
│  │  ☑ Animate transitions                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Startup                                                    │  │
│  │  On launch:  [○ Library    ○ Last View    ○ Slideshow]     │  │
│  │                                                            │  │
│  │  ☑ Open last library folder automatically                 │  │
│  │  ☑ Restore window size & position                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Tab Structure

| Tab | Sections | Key Settings |
|-----|----------|--------------|
| **General** | Appearance, Startup, Behavior | Theme, Accent, Sidebar, Animations, Launch behavior |
| **Viewing** | Grid, Viewer, Slideshow, Video | Thumbnail size, Layout default, Zoom behavior, Loop, Interval |
| **Library** | Folders, Import, Organization | Watch folders, Auto-import, RAW+JPEG pairing, Stack bursts |
| **Privacy & Security** | Vault, Metadata, Network | Touch ID, Auto-lock, Strip GPS, No network, Crash reports |
| **Advanced** | Cache, Database, Experimental | Cache size, Vacuum DB, Reset warnings, Debug logging |

---

## 2. Native macOS Menu Bar

### Menu Structure (Tauri `menu` API)

```
Stillroom
  ├─ About Stillroom
  ├─ ─────────────
  ├─ Settings…                    ⌘,
  ├─ ─────────────
  ├─ Services ▸
  ├─ ─────────────
  ├─ Hide Stillroom               ⌘H
  ├─ Hide Others                  ⌥⌘H
  ├─ Show All
  ├─ ─────────────
  ├─ Quit Stillroom               ⌘Q

File
  ├─ New Library Window           ⌘N
  ├─ Open Folder…                 ⌘O
  ├─ Import Files…                ⌥⌘I
  ├─ ─────────────
  ├─ Close Window                 ⌘W
  ├─ ─────────────
  ├─ Export…                      ⌘E
  ├─ Export Edited Copy…          ⌥⌘E
  ├─ ─────────────
  ├─ Move to Trash                ⌘⌫
  ├─ Reveal in Finder             ⌘R

Edit
  ├─ Undo                         ⌘Z
  ├─ Redo                         ⇧⌘Z
  ├─ ─────────────
  ├─ Cut                          ⌘X
  ├─ Copy                         ⌘C
  ├─ Paste                        ⌘V
  ├─ ─────────────
  ├─ Select All                   ⌘A
  ├─ Deselect All                 ⇧⌘A
  ├─ ─────────────
  ├─ Add to Album ▸
  ├─ Tag…                         ⌘T

View
  ├─ Layout
  │   ├─ Grid                     ⌘1
  │   ├─ Filmstrip                ⌘2
  │   └─ Overview                 ⌘3
  ├─ ─────────────
  ├─ Filter
  │   ├─ All                      ⌘0
  │   ├─ Photos                   ⌘4
  │   ├─ Videos                   ⌘5
  │   ├─ RAW                      ⌘6
  │   ├─ Favorites                ⌘7
  │   └─ Hidden                   ⌘8
  ├─ ─────────────
  ├─ Sort By
  │   ├─ Date Modified
  │   ├─ Date Captured
  │   ├─ Name
  │   ├─ Size
  │   └─ Kind
  ├─ ─────────────
  ├─ Show Inspector               ⌥⌘I
  ├─ Show Filmstrip               ⌘\
  ├─ ─────────────
  ├─ Zoom In                      ⌘+
  ├─ Zoom Out                     ⌘-
  ├─ Actual Size                  ⌘0
  ├─ ─────────────
  ├─ Enter Full Screen            ⌃⌘F
  ├─ Show Toolbar
  ├─ Show Sidebar                 ⌥⌘S

Window
  ├─ Minimize                     ⌘M
  ├─ Zoom
  ├─ ─────────────
  ├─ Bring All to Front
  ├─ ─────────────
  ├─ Stillroom (window list)

Help
  ├─ Search                       ⇧⌘/
  ├─ Stillroom Help
  ├─ Keyboard Shortcuts
  ├─ ─────────────
  ├─ Check for Updates…
  ├─ Report an Issue…
```

---

## 3. Context Menus (Right-Click)

### Library Grid - Single Item
```
┌────────────────────────────┐
│ Open                       │  ← Default (double-click)
│ Open in Viewer             │
│ ─────────────              │
│ Add to Album ▸             │
│   ├─ New Album…            │
│   ├─ [Existing Albums]     │
│ ─────────────              │
│ Toggle Favorite            │  ⌘F
│ Hide                       │  ⌘H
│ ─────────────              │
│ Tag…                       │  ⌘T
│ ─────────────              │
│ Get Info                   │  ⌘I
│ ─────────────              │
│ Export…                    │  ⌘E
│ Export Edited…             │  ⌥⌘E
│ ─────────────              │
│ Move to Trash              │  ⌘⌫
│ Reveal in Finder           │  ⌘R
│ Copy Path                  │  ⌥⌘C
└────────────────────────────┘
```

### Library Grid - Multiple Selection
```
┌────────────────────────────┐
│ Open (N items)             │
│ ─────────────              │
│ Add to Album ▸             │
│ ─────────────              │
│ Toggle Favorite            │
│ Hide                       │
│ Tag…                       │
│ ─────────────              │
│ Export…                    │
│ Batch Export…              │
│ ─────────────              │
│ Move to Trash (N items)    │
│ Reveal in Finder           │
└────────────────────────────┘
```

### Viewer
```
┌────────────────────────────┐
│ Previous                   │  ←
│ Next                       │  →
│ ─────────────              │
│ Zoom In                    │  +
│ Zoom Out                   │  -
│ Actual Size                │  0
│ Fit to Window              │  9
│ ─────────────              │
│ Rotate Left                │  ⌘[
│ Rotate Right               │  ⌘]
│ Flip Horizontal            │
│ ─────────────              │
│ Toggle Favorite            │  F
│ Hide                       │  H
│ Edit…                      │  E
│ ─────────────              │
│ Slideshow                  │  Space
│ ─────────────              │
│ Export…                    │  ⌘E
│ Reveal in Finder           │  ⌘R
│ Move to Trash              │  ⌘⌫
└────────────────────────────┘
```

---

## 4. Topbar → Native Title Bar

### Current (Fake)
```tsx
<header className="topbar">
  <div className="traffic-lights"><i className="light red" /><i className="light yellow" /><i className="light green" /></div>
  <div className="topbar-brand"><span className="brand-icon">✳</span><b>Stillroom</b></div>
  <div className="topbar-center">...</div>
  <div className="topbar-actions">...</div>
</header>
```

### Tauri Config (Native)
```json
{
  "tauri": {
    "windows": [{
      "title": "Stillroom",
      "titleBarStyle": "transparent",
      "hiddenTitle": true,
      "decorations": false,
      "transparent": false
    }]
  }
}
```

### Custom Title Bar (if needed for brand)
```tsx
// Only if we want the brand icon in title bar
<header className="custom-titlebar" data-tauri-drag-region>
  <div className="titlebar-brand">✳ Stillroom</div>
  <div className="titlebar-center">{status}</div>
  <div className="titlebar-actions">
    <button onClick={() => invoke("toggle_sidebar")}>◀</button>
  </div>
</header>
```

---

## 5. Keyboard Shortcuts Reference

| Category | Shortcut | Action |
|----------|----------|--------|
| **Navigation** | `←` `→` | Previous/Next (Viewer, Slideshow) |
| | `↑` `↓` | Navigate grid rows |
| | `Home` `End` | First/Last item |
| **Selection** | `Space` | Play/Pause Slideshow |
| | `⌘A` | Select All |
| | `⇧⌘A` | Deselect All |
| | `⌘Click` | Toggle selection |
| | `Shift+Click` | Range select |
| **View** | `⌘1/2/3` | Grid/Filmstrip/Overview |
| | `⌘0/4-8` | Filter: All/Photos/Videos/RAW/Fav/Hidden |
| | `⌘+` `⌘-` `⌘0` | Zoom In/Out/Actual Size |
| | `⌘\` | Toggle Filmstrip |
| | `⌥⌘I` | Toggle Inspector |
| | `⌥⌘S` | Toggle Sidebar |
| **Actions** | `⌘F` | Focus Search |
| | `⌘T` | Tag selected |
| | `⌘I` | Get Info |
| | `⌘E` | Export |
| | `⌥⌘E` | Export Edited |
| | `⌘⌫` | Move to Trash |
| | `⌘R` | Reveal in Finder |
| | `E` | Edit (Viewer) |
| | `F` | Favorite (Viewer) |
| | `H` | Hide (Viewer) |
| | `⌃⌘F` | Full Screen |
| | `Esc` | Exit Viewer/Slideshow/Vault/Dialog |
| **App** | `⌘,` | Settings |
| | `⌘N` | New Window |
| | `⌘O` | Open Folder |
| | `⌥⌘I` | Import Files |
| | `⌘W` | Close Window |
| | `⌘Q` | Quit |

---

## 6. Implementation Plan

### Phase 1: Settings Redesign (React Only)
- [ ] Create `SettingsScreen` with real tabs (keyboard accessible)
- [ ] Add all setting controls with proper types
- [ ] Connect to Zustand store (persisted to localStorage for now)
- [ ] Responsive: tabs → accordion on mobile

### Phase 2: Menu Bar (Tauri Config)
- [ ] Define menu in `tauri.conf.json` or `src-tauri/src/menu.rs`
- [ ] Wire menu events to frontend via `invoke` or `emit`
- [ ] Add keyboard accelerators

### Phase 3: Context Menus
- [ ] Create `ContextMenu` component (portal-based)
- [ ] Attach to GalleryTile, ViewerStage, Album items
- [ ] Wire actions to store commands

### Phase 4: Window Chrome
- [ ] Configure Tauri for native title bar
- [ ] Remove fake traffic lights
- [ ] Add drag region if custom title bar needed

---

## 7. Settings Data Model

```typescript
interface AppSettings {
  // General
  appearance: "light" | "dark" | "system";
  accentColor: "blue" | "purple" | "green" | "orange" | "pink" | "red";
  sidebarWidth: number;           // 180-300
  showExtensions: boolean;
  animateTransitions: boolean;
  
  // Startup
  startupView: "library" | "last" | "slideshow";
  openLastFolder: boolean;
  restoreWindowState: boolean;
  
  // Viewing
  defaultLayout: "grid" | "filmstrip" | "overview";
  thumbnailSize: "small" | "medium" | "large";
  viewerZoomBehavior: "fit" | "actual" | "last";
  slideshowInterval: number;      // 3-30 seconds
  slideshowShuffle: boolean;
  slideshowLoop: boolean;
  videoAutoPlay: boolean;
  videoLoop: boolean;
  
  // Library
  watchFolders: string[];         // Security-scoped bookmarks
  autoImport: boolean;
  pairRawJpeg: boolean;
  stackBursts: boolean;
  stackLivePhotos: boolean;
  
  // Privacy & Security
  vaultEnabled: boolean;
  vaultUnlockMethod: "password" | "touchid" | "both";
  vaultAutoLockMinutes: number;   // 1-60, 0 = never
  vaultLockOnSleep: boolean;
  stripGpsOnExport: boolean;
  stripAllMetadataOnExport: boolean;
  allowNetworkRequests: boolean;  // Always false for local-first
  sendCrashReports: boolean;
  
  // Advanced
  maxCacheSizeGB: number;         // 1-50
  thumbnailQuality: number;       // 50-100
  enableDebugLogging: boolean;
  showNativeLimitWarnings: boolean;
}
```

---

## 8. CSS Additions Needed

```css
/* Tabbed Settings */
.settings-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
.settings-tab { padding: 10px 16px; border: none; background: transparent; color: var(--muted); font-size: 13px; font-weight: 550; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.settings-tab:hover { color: var(--text); }
.settings-tab.active { color: var(--blue); border-bottom-color: var(--blue); }
.settings-tab:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; border-radius: 6px 6px 0 0; }

.settings-panel { animation: fadeIn 0.15s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

.settings-section { margin-bottom: 28px; }
.settings-section-title { color: var(--ink); font-size: 14px; font-weight: 600; margin-bottom: 14px; }
.settings-row { display: grid; grid-template-columns: 180px 1fr; align-items: center; gap: 16px; padding: 10px 0; }
.settings-row-label { color: var(--text); font-size: 13px; }
.settings-row-desc { color: var(--muted); font-size: 12px; margin-top: 2px; }

/* Radio Group */
.radio-group { display: flex; gap: 16px; flex-wrap: wrap; }
.radio-option { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.radio-option input { position: absolute; opacity: 0; }
.radio-dot { width: 18px; height: 18px; border: 2px solid var(--line-strong); border-radius: 50%; display: grid; place-items: center; transition: border-color 0.15s, background 0.15s; }
.radio-dot::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--blue); transform: scale(0); transition: transform 0.15s; }
.radio-option input:checked + .radio-dot { border-color: var(--blue); }
.radio-option input:checked + .radio-dot::after { transform: scale(1); }
.radio-option input:focus-visible + .radio-dot { outline: 2px solid var(--blue); outline-offset: 2px; }

/* Slider */
.settings-slider { width: 100%; max-width: 280px; accent-color: var(--blue); }

/* Context Menu */
.context-menu { position: fixed; z-index: 100; min-width: 200px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
.context-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 6px; background: transparent; color: var(--ink); font-size: 13px; text-align: left; cursor: pointer; }
.context-menu-item:hover { background: var(--surface-3); }
.context-menu-item:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.context-menu-item.disabled { opacity: 0.5; cursor: not-allowed; }
.context-menu-separator { height: 1px; background: var(--line); margin: 6px 0; }
.context-menu-shortcut { margin-left: auto; color: var(--muted); font-size: 11px; font-family: "SF Mono", monospace; }
.context-menu-submenu { position: relative; }
.context-menu-submenu > .context-menu { position: absolute; left: 100%; top: -6px; margin-left: 4px; }
```

---

## 9. Files to Modify/Create

| File | Action |
|------|--------|
| `src/App.tsx` | Replace `SettingsScreen` with new tabbed version |
| `src/stores/useSettingsStore.ts` | New Zustand store for settings (persist to localStorage) |
| `src/components/SettingsScreen.tsx` | New component (extracted from App.tsx) |
| `src/components/ContextMenu.tsx` | New reusable context menu component |
| `src/components/TitleBar.tsx` | Optional custom title bar |
| `src/styles/global.css` | Add settings/context menu styles |
| `src-tauri/tauri.conf.json` | Configure native menu, window chrome |
| `src-tauri/src/menu.rs` | Tauri menu definition (Rust) |

---

## 10. Success Criteria

- [ ] Settings opens as proper tabbed pane (not sections)
- [ ] All tabs keyboard navigable (`←` `→` `Tab` `Enter`)
- [ ] Menu bar appears on macOS with all standard menus
- [ ] Keyboard accelerators work globally
- [ ] Right-click shows contextual menus everywhere
- [ ] Settings persist across sessions
- [ ] No "native feature badge" placeholders - real toggles
- [ ] Window uses native traffic lights (or clean custom bar)