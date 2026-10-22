# Layout, Theming & Settings — Analysis and Fix Plan

Status: **plan only** — no source files have been modified.
Baseline: branch `fix/layout-polish` @ `2b94e9e`, working tree clean
(`.gitignore` untouched). `npm run typecheck` and `cargo check` both pass at HEAD.

This document records the defects found while auditing the app chrome, the
settings pipeline, and the backend settings contract, plus the ordered plan to
fix them.

---

## 1. Executive summary

| # | Area | Defect | Severity | Plan |
|---|------|--------|----------|------|
| 1 | Backend | `AppSettings` serializes `snake_case`; frontend expects `camelCase` | **Critical** | 3.1 |
| 2 | Backend | `watch_folders` never returned by `get_settings`, never persisted by `save_settings` | High | 3.2 |
| 3 | Theming | Persisted `appearance` never applied to `.app-frame`; app uses its own `dark` state | **Critical** | 3.3 |
| 4 | Theming | Accent color sets `--accent` on `:root`, but the UI uses `--blue` everywhere | High | 3.4 |
| 5 | Layout | Duplicate `:root` / `.app-frame` / `.app-body` rules across `global.css` and `App.css` | High | 3.5 |
| 6 | Layout | `sidebarWidth` is persisted but never applied to the grid | High | 3.6 |
| 7 | Settings UI | "Delete Library Database" silently calls `resetSettings()` instead of deleting | **Critical** | 3.7 |
| 8 | Settings UI | "Clear Cache Now" button is a no-op | Medium | 3.8 |
| 9 | Settings UI | Settings nav/scroll/row/control/destructive styling needs refinement | Medium | 3.9 |

---

## 2. Architecture summary

```
src/
  main.tsx                  imports global.css -> settings.css -> interactive.css -> App.css
  app/App.tsx               app shell: topbar, .app-body grid, .sidebar, screen routing
  app/App.css               native-window overrides (loaded LAST -> wins ties)
  design/styles/global.css  base tokens + component library (large, has stale dupes)
  design/styles/settings.css Settings screen only
  design/styles/interactive.css hover/focus states + --danger/--blue-hover tokens
  design/components/SettingsScreen.tsx   5-tab settings, panel components
  design/components/SourcesManager.tsx    shared source list (inline + sheet)
  engine/stores/useSettingsStore.ts      zustand + persist(localStorage) + applyTheme()
  engine/types/settings.ts                AppSettings camelCase contract
  engine/commands/tauri.ts                typed IPC wrapper
src-tauri/src/commands/mod.rs             get_settings / save_settings / remove_library_folder
src-tauri/src/db/mod.rs                   SQLite schema (settings key/value table)
```

Data flow for settings:

```
SettingsScreen radio/toggle
  -> useSettingsStore.update(key, value)
      -> optimistic localStorage write (zustand persist)
      -> tauri.settings.save({ [key]: value })   <- camelCase over IPC
          -> save_settings(PartialSettings)      <- PartialSettings is camelCase OK
          -> SQLite `settings` table (snake_case keys)
      <- AppSettings                              <- AppSettings is snake_case BUG

on mount: useSettingsStore.hydrate()
  -> tauri.settings.get() -> get_settings -> AppSettings (snake_case BUG)
  -> set({ ...saved })   <- snake_case keys land on a camelCase store
```

---

## 3. Defects and fixes

### 3.1 `AppSettings` serializes `snake_case` — frontend expects `camelCase` (Critical)

**Evidence**

`src-tauri/src/commands/mod.rs:227-262`

```rust
#[derive(Serialize)]                 // <- NO #[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub appearance: String,
    pub accent_color: String,
    pub sidebar_width: i32,
    // ...
}
```

Every other IPC struct in the file *is* annotated (lines 16-22 explicitly
document this convention):

```rust
// Every struct that crosses the IPC boundary is annotated `rename_all =
```

`PartialSettings` (line 191) is correctly annotated `camelCase`, so **writes**
work and **reads** do not. The frontend contract in
`src/engine/types/settings.ts` is entirely camelCase (`accentColor`,
`sidebarWidth`, `watchFolders`, `maxCacheSizeGB`, ...).

**Impact**

- `hydrate()` does `set({ ...saved, ... })`. With snake_case keys the spread
  injects `accent_color`, `sidebar_width`, ... as *extra* keys while the
  camelCase fields keep their **default** values. The user's saved appearance,
  accent, and sidebar width are silently discarded on every launch.
- `save_settings` returns the same snake_case `AppSettings`, but the store
  ignores the return value, so no error surfaces. The bug is invisible.
- `updateMany(defaultSettings)` from `reset()` sends camelCase and works, so
  reset appears to work — masking the read path entirely.

**Fix** — annotate the struct to match the documented convention:

```rust
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings { /* ... */ }
```

`Deserialize` is added so the struct can be reused for round-tripping and so
`Default` stays coherent. No field renames are needed — `rename_all` maps
`accent_color -> accentColor`, `sidebar_width -> sidebarWidth`,
`max_cache_size_gb -> maxCacheSizeGB`, `watch_folders -> watchFolders`,
`vault_auto_lock_minutes -> vaultAutoLockMinutes`, etc., exactly matching
`src/engine/types/settings.ts`.

**Verification**: `get_settings` returns camelCase JSON; `hydrate()` restores
the saved appearance/accent/sidebar width after a restart.

---

### 3.2 `watch_folders` is never returned or persisted (High)

**Evidence**

- `AppSettings` declares `pub watch_folders: Vec<String>` (line 245) and
  `Default` sets `watch_folders: vec![]` (line 283).
- `get_settings` (lines 1240-1288) has **no** `"watch_folders"` match arm, so
  the field is always the empty default.
- `save_settings` has **no** `if let Some(v) = patch.watch_folders` arm and no
  `("watch_folders", ...)` entry in `settings_map` (lines 1290-1375), so the
  value is silently dropped on write.

The frontend type declares `watchFolders: string[]` (settings.ts:19) and
`defaultSettings.watchFolders = []`.

**Impact**

`watchFolders` is permanently `[]` — it can never be read or written through
the settings API. Today nothing in the UI edits it, so the blast radius is
contained, but it is a latent bug: the field is advertised in the contract and
in the backend struct but is not functional.

**Fix**

1. In `get_settings`, add a match arm. The value is a list, but the
   `settings` table stores plain strings, so it is stored as a JSON array
   string and parsed:

   ```rust
   "watch_folders" => {
       settings.watch_folders = serde_json::from_str(&value).unwrap_or_default();
   }
   ```

2. In `save_settings`, add the merge arm and persist it as JSON:

   ```rust
   if let Some(v) = patch.watch_folders { settings.watch_folders = v; }
   // ...
   ("watch_folders", serde_json::to_string(&settings.watch_folders).unwrap_or_else(|_| "[]".to_string())),
   ```

3. The JSON encoding (`["a","b"]`) is self-delimiting, so the plain
   `watch_folders` key cannot collide with the flat string keys.

**Verification**: set `watchFolders` via `save_settings`, read back via
`get_settings`, confirm the array survives.

---

### 3.3 Persisted appearance is never applied to `.app-frame` (Critical)

**Evidence**

`src/app/App.tsx:70-74` — the app owns a **local** `dark` state seeded from the
OS media query and never reads `settings.appearance`:

```tsx
const [dark, setDark] = useState(() =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false
);
```

`src/app/App.tsx:931` — that state drives the only class that themes the app:

```tsx
<div className={`app-frame ${dark ? "dark" : ""}`}>
```

`src/design/styles/global.css` scopes **every** dark token to `.app-frame.dark`
(lines 56, 234, 678). The `html.dark` class set by `applyTheme()` matches
**no** dark rules at all — only `.app-frame.dark` does.

`applyTheme()` (`useSettingsStore.ts:95`) is called from exactly one place:
`SettingsScreen.tsx:98`, inside an effect gated on `!loading`. Consequences:

- The theme is applied **only while the Settings screen is mounted**. Closing
  Settings leaves `html.dark` set but the app frame unthemed — and vice versa.
- `appearance: "light"` or `"dark"` (a user override) is ignored entirely,
  because `App.tsx` only ever follows the OS.
- The in-app topbar toggle (`setDark(!dark)`, line 976) mutates local state
  that is **not persisted**, so the choice is lost on restart and fights the
  Settings radio group.

**Fix**

1. Make the settings store the single source of truth for appearance.
2. In `App.tsx`, derive `dark` from `settings.appearance` (resolving `"system"`
   against the OS media query) instead of owning an independent state.
3. Apply the `.dark` class on `.app-frame` (the element that actually owns the
   tokens), not on `document.documentElement`.
4. Persist the topbar toggle by routing it through
   `settings.update("appearance", ...)`.
5. Keep `applyTheme` as the single helper, but have it write to the app frame
   and be called from `App.tsx` (always mounted) rather than `SettingsScreen`.

Sketch:

```tsx
// App.tsx
const appearance = useSettingsStore((s) => s.appearance);
const systemDark = useSystemDark();                    // media-query hook
const dark = appearance === "dark" || (appearance === "system" && systemDark);

useEffect(() => {
  applyTheme({ appearance, accentColor });             // writes .dark + --accent
}, [appearance, accentColor, systemDark]);
```

`applyTheme` becomes:

```ts
export function applyTheme(settings: Pick<AppSettings, "appearance" | "accentColor">) {
  const frame = document.querySelector<HTMLElement>(".app-frame");
  if (!frame) return;
  const isDark = settings.appearance === "dark" ||
    (settings.appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  frame.classList.toggle("dark", isDark);
  frame.style.setProperty("--accent", accents[settings.accentColor] ?? accents.blue);
}
```

**Note on the native window chrome**: the existing
`getCurrentWindow().setTheme()` effect (App.tsx:481-494) is already correct and
must stay in sync with the resolved `dark` value.

**Verification**: set Appearance = Dark with the OS in light mode -> app frame
turns dark and stays dark when navigating away from Settings; the topbar toggle
persists across restarts.

---

### 3.4 Accent color writes `--accent`, the UI reads `--blue` (High)

**Evidence**

`useSettingsStore.ts:104-111` sets a single custom property:

```ts
root.style.setProperty("--accent", accents[settings.accentColor] || accents.blue);
```

But `--accent` is referenced in only **two** places in the entire codebase, both
in `src/app/App.css:1187-1193` (a focus ring), and both with a fallback:

```css
border: 2px solid var(--accent, var(--blue));
```

Meanwhile the accent token the entire UI is built on is `--blue`, defined
**four times** (global.css lines 30, 67, 660, 689) and referenced **172 times**
across the four stylesheets (global.css 40, interactive.css 12, settings.css 19,
App.css 101).

**Impact**

Choosing Purple/Green/Orange/Pink/Red in Settings changes one focus ring and
nothing else. The accent picker is effectively non-functional as a theme
control.

**Fix**

Introduce a proper accent token pair that the theme layers can override, and
drive it from the accent setting:

```css
/* global.css - light tokens */
.app-frame {
  --accent: #3474d4;          /* the default */
  --blue: var(--accent);
  --blue-soft: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
/* dark tokens */
.app-frame.dark {
  --accent: #8ab4ff;
  --blue: var(--accent);
}
```

Then `applyTheme()` sets `--accent` **on the `.app-frame` element** (not
`:root`), and every `var(--blue)` reference automatically follows the accent
without touching 172 call sites.

**Care required** — `--blue` is currently *redefined* by the later duplicate
`.app-frame` blocks (global.css lines 225-241 and 649-697). The consolidation
in 3.5 must happen first (or simultaneously) so there is exactly one
authoritative `--blue` definition per theme.

**Verification**: pick each of the 6 accents; buttons, links, active nav,
focus rings, and sliders all change hue, in both light and dark.

---

### 3.5 Duplicate `:root` / `.app-frame` / `.app-body` rules (High)

**Evidence**

`global.css` defines the same selectors multiple times, in three "eras":

| Block | Lines | Notes |
|---|---|---|
| Era 1 - base tokens | 1-224 | `:root` (1), `.app-frame` (19), `.app-frame.dark` (56), `.app-body` (101) |
| Era 2 - patch | 225-635 | `.app-frame` (225), `.app-frame.dark` (234) - overrides `--text`, `--muted`, `--line` |
| Era 3 - "Cohesive native gallery visual system" | 640-... | `:root` (640), `.app-frame` (649), `.app-frame.dark` (678) - overrides **all** tokens again |
| Era 4 - layout patch | 728+ | `.app-body` (728) -> `grid-template-columns: minmax(200px, 220px) ...` |

Result: the *effective* light tokens come from Era 3 (line 649), while Era 1's
values at line 19-56 are dead. Same for dark (Era 3 line 678 wins).

`.app-body` is defined **four** times in `global.css` alone:

- line 101 -> `216px minmax(0,1fr)`
- line 728 -> `minmax(200px, 220px) minmax(0,1fr)`
- line 1305 (@media 900px) -> `190px minmax(0,1fr)`
- line 1320 (@media 700px) -> `1fr`

and **once** in `App.css:72` -> `minmax(200px, 220px) minmax(0,1fr)` with
`!important` overrides at 900px/700px.

Because `App.css` is imported **last** (`main.tsx:9-12`), its rules win
equal-specificity ties, but the `global.css` media queries at 1305/1320 are
*not* `!important` and therefore conflict with `App.css`'s `!important`
versions — the winner depends on specificity, not intent.

**Impact**

Token values are effectively accidental (last-writer-wins across three eras),
and layout breakpoints disagree between files. This is the root cause that
makes accent theming (3.4) and sidebar sizing (3.6) fragile.

**Fix**

1. Delete the superseded token blocks (Era 1 lines 19-56, Era 2 lines 225-241,
   and the duplicate `:root` at line 640), keeping **one** light token set and
   **one** dark token set as the single source of truth.
2. Keep the `global.css` `:root` block (line 1) for page-level typography
   only, and strip its color declarations that duplicate `.app-frame`.
3. Merge the four `.app-body` declarations into one rule plus one media-query
   set, removing the duplicated breakpoint logic.
4. Move the native-window overrides (`App.css`) into a clearly-labelled
   section and keep them `!important` where they must beat `global.css`, so the
   cascade order stops being load-bearing.

**Verification**: `grep` shows exactly one `:root` color block, one
`.app-frame` token block, one `.app-frame.dark` token block, and one `.app-body`
rule per breakpoint. Visual diff of light/dark before vs after should show no
unintended colour shifts.

---

### 3.6 `sidebarWidth` is persisted but never applied (High)

**Evidence**

`sidebarWidth` is written and persisted correctly:

- `SettingsScreen.tsx:54` — local state, synced via `useSettingsStore.subscribe`
  (line 103) and written with `update("sidebarWidth", width)` (line 111).
- `settings.ts:5,51` — typed and defaulted to `220`.

But it is **never read by the layout**. A repo-wide grep for `sidebarWidth`
outside `SettingsScreen.tsx` / the settings store returns only the type
definition — **no CSS variable and no grid usage**:

```
$ grep -rn 'sidebarWidth\|sidebar-width' src/
  src/design/components/SettingsScreen.tsx:54,104,111,196,294,343,347
  src/engine/types/settings.ts:5,51
  src/engine/stores/useSettingsStore.ts:89
```

There is **no** `--sidebar-width` custom property anywhere (grep for
`--sidebar-w` returns nothing), and `.app-body` hard-codes
`minmax(200px, 220px)` (global.css:728, App.css:74).

**Impact**

The "Sidebar Width" slider in Settings -> General moves a number and changes
nothing. The setting is a no-op.

**Fix**

1. Introduce a custom property on the app frame:

   ```css
   .app-frame { --sidebar-width: 220px; }
   ```

2. Drive the grid from it:

   ```css
   .app-body {
     grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
   }
   ```

   and clamp the setting to a sane range in the store (e.g. 180-360px) so a
   bad persisted value cannot collapse the layout.

3. Apply the value from React. `App.tsx` already reads the whole settings store
   (`const settings = useSettingsStore();`, line 149), so set the property on
   the frame element:

   ```tsx
   <div className={`app-frame ${dark ? "dark" : ""}`}
        style={{ "--sidebar-width": `${settings.sidebarWidth}px` } as React.CSSProperties}>
   ```

4. Keep the responsive overrides authoritative: at <=900px the rail collapses
   to a fixed 56px and at <=700px to a single column, so the custom property
   must not override those breakpoints (the media-query rules come later in
   `global.css` and already use `!important` in `App.css`).

**Verification**: drag the slider -> the sidebar resizes live and the setting
survives a restart.

---

### 3.7 "Delete Library Database" silently resets settings instead (Critical)

**Evidence**

`SettingsScreen.tsx:117-121`:

```tsx
const handleDeleteLibrary = useCallback(async () => {
  setShowDeleteConfirm(false);
  await resetSettings(); // Using resetSettings as a placeholder for now
}, [resetSettings]);
```

The confirmation dialog promises destructive behaviour
("This removes the catalog, albums, tags, and all metadata", line 275) but the
handler only resets **preferences**. Nothing is deleted. The button is wired to
`showDeleteConfirm` and the dialog renders correctly — the defect is purely in
the handler.

**Impact**

A user who clicks "Delete" expecting their catalog to be wiped gets a silent
settings reset and a false impression that their data was deleted. Equally
bad: the real intent (wiping the catalog) is impossible from the UI.

**Fix**

Implement the operation properly rather than removing the button:

1. Add a Rust command `delete_library_database` that clears the catalog tables
   (`media_items`, `media_tags`, `album_items`, `vault_items`, `albums`, `tags`,
   `library_folders`) — the same explicit-cleanup pattern already used by
   `remove_library_folder` (which deletes join rows explicitly rather than
   relying on FK cascades).
2. Register it in `lib.rs` `generate_handler!` under **Library**.
3. Expose it via `tauri.library.deleteDatabase()` in
   `src/engine/commands/tauri.ts`.
4. Call it from `handleDeleteLibrary`, then reload the library state
   (`library.loadLibrary()`) so the UI reflects the empty catalog.

**Explicitly NOT doing**: adding an unsafe "clear everything including files"
API. The existing `remove_library_folder` command (already wired end-to-end
through `tauri.library.removeFolder` -> `remove_library_folder`) is the
supported path for removing a source, and it is what the Sources UI uses.

**Verification**: the dialog's copy matches what actually happens; after
confirming, the library is empty and re-importing a folder rebuilds it.

---

### 3.8 "Clear Cache Now" is a no-op (Medium)

**Evidence**

`SettingsScreen.tsx:875-879`:

```tsx
<div className="settings-row">
  <div className="settings-row-control">
    <button className="quiet-button" type="button">Clear Cache Now</button>
  </div>
</div>
```

No `onClick`. There is also **no cache subsystem** in the backend:
`get_item_thumbnail` is a stub that returns `Err("Not implemented")`
(commands/mod.rs:759-762), no `cache_dir` is used anywhere in
`src-tauri/src/`, and the SQLite schema (`db/mod.rs`) has no thumbnail/cache
table — the tables are `media_items`, `albums`, `tags`, `media_tags`,
`album_items`, `import_sessions`, `library_folders`, `vault_items`, `settings`.

**Impact**

The button does nothing when clicked. A control that silently no-ops is worse
than an absent one.

**Fix**

Two options; **Option B is recommended**:

- **Option A** — add a `clear_thumbnail_cache` Rust command. Not recommended yet:
  there is no thumbnail cache to clear until `get_item_thumbnail` is
  implemented, so the command would be a no-op with extra plumbing.
- **Option B (recommended)** — until a real cache exists, replace the button
  with an honest, functional control: a **"Rebuild Library"** action that
  re-scans the registered folders (reusing the existing `scan_library` /
  `import_files` commands), or remove the row entirely.

If Option B's "Rebuild" is chosen, it must reuse the existing scan command
rather than introducing a new backend surface.

**Decision**: implement "Rebuild Library" via the existing scan path; leave the
cache row out until a thumbnail cache genuinely exists.

---

### 3.9 Settings UI refinement (Medium)

The Settings screen is functional but needs polish. Concrete items, all in
`src/design/styles/settings.css` and `src/design/components/SettingsScreen.tsx`:

1. **Navigation**
   - The tab bar (`role="tablist"`, SettingsScreen.tsx:174) supports click but
     has **no keyboard navigation** — no arrow-key roving tabindex, no
     Home/End. Add the standard ARIA tabs pattern.
   - Tabs use `flex: 1 1 0%` with `min-width: 100px; max-width: 200px`
     (settings.css:26-28). At narrow widths the five tabs overflow (clipped by
     `overflow: clip` on `.settings-tabs`). Prefer a horizontally scrollable
     tab strip that keeps all five reachable.
2. **Panels / scrolling**
   - `.settings-panel` has `overflow-y: auto` and `flex: 1`, but
     `.settings-page` is `flex: 1; min-height: 0` with `padding-bottom: 48px` —
     the scroll container and the page container can both scroll, causing
     double scrollbars. Make `.settings-page` the single scroll owner or make
     the panel the only one.
   - `.settings-panel` has `padding-right: 8px` for the scrollbar gutter, which
     misaligns section content against the heading above it.
3. **Rows**
   - `.settings-row` is `grid-template-columns: 220px 1fr` (settings.css:124).
     The fixed 220px label column truncates long labels ("Show Native Limit
     Warnings") at the 960px breakpoint where it collapses to 1 column.
   - Row separation uses `border-bottom` on `:not(:last-child)`, but sections
     are separate `.settings-section` blocks — the last row of a section and
     the first row of the next are visually crowded.
   - Hover/focus affordance for a row is absent, so keyboard users cannot tell
     which row they are on.
4. **Controls**
   - `.settings-slider` uses `accent-color: var(--blue)` and `height: 6px` —
     the native track is thin and inconsistent with the app's field chrome
     (`--field-line`, `--field-inner`).
   - `.accent-option.selected` uses `border-color: var(--ink)` +
     `box-shadow: ... var(--ink)` (settings.css:256-259) — the selected accent
     is signalled with the *text* colour rather than the accent colour, so it
     does not read as "this is the chosen accent".
   - `.settings-select` and `.settings-input` should be checked against the
     `--field-*` tokens for consistency with the rest of the app.
5. **Destructive actions**
   - `.danger-button` is defined **twice**: `global.css:166` (hard-coded
     `#e6a4a1` / `#ca6059`) and `interactive.css:81-90` (token-based
     `--danger` / `--danger-line` / `--danger-tint`). Because `interactive.css`
     is imported after `global.css`, the token version wins — but the
     hard-coded light-mode values in `global.css` do not adapt to dark mode and
     are dead weight. Remove the duplicate.
   - The "Danger Zone" section gives destructive actions the same visual weight
     as ordinary rows. Give the section a distinct treatment (tinted border or
     background) so a destructive control is never a single mis-click away
     from a benign one.
   - `AdvancedPanel`'s "Reset All Settings" and "Delete Library Database" rows
     are visually identical to the "Debug Logging" toggle above them.
6. **Section headings**
   - `.settings-section-title` uses `font-size: 14px` while `.app-frame` base
     `font-size` is 14px — headings do not stand out from body text. Nudge the
     scale (or add weight/colour contrast) so sections scan quickly.
7. **Accessibility**
   - The radio group (`radio-group` / `radio-option`) should expose proper
     `role="radio"` + `aria-checked`, and the slider needs an accessible name
     (`aria-label`) since its label is a separate `<b>` in another grid cell.

---

## 4. Ordered implementation plan

Phase 1 — **Backend contract** (unblocks everything else)

1. `src-tauri/src/commands/mod.rs`
   - Add `#[serde(rename_all = "camelCase")]` (+ `Deserialize`) to `AppSettings`.
   - Add the `watch_folders` read/write arms (3.2).
2. `cargo check` -> confirm no warnings introduced.

Phase 2 — **CSS consolidation** (must precede accent theming)

3. `src/design/styles/global.css`
   - Collapse the duplicate `:root` / `.app-frame` / `.app-frame.dark` token
     blocks into one light set and one dark set (3.5).
   - Merge the four `.app-body` rules into one rule + one breakpoint set.
   - Introduce `--accent` / `--blue` indirection and `--sidebar-width`
     (3.4, 3.6).
   - Remove the duplicate `.danger-button` rule (3.9.5).
4. `src/app/App.css` — keep native-window overrides, but label the section and
   make the breakpoint overrides intentionally `!important` so ordering stops
   mattering (3.5).

Phase 3 — **Theme + accent application**

5. `src/engine/stores/useSettingsStore.ts`
   - Rewrite `applyTheme` to target `.app-frame` and set `--accent` there.
   - Add a `useSystemDark()` media-query hook.
   - Clamp `sidebarWidth` on write (180-360).
6. `src/app/App.tsx`
   - Derive `dark` from `settings.appearance` instead of local state (3.3).
   - Apply `--sidebar-width` on `.app-frame` (3.6).
   - Route the topbar theme toggle through `settings.update("appearance", ...)`.
   - Keep `getCurrentWindow().setTheme()` in sync with resolved `dark`.
7. `src/design/components/SettingsScreen.tsx`
   - Remove the local `applyTheme` effect (now owned by `App.tsx`).

Phase 4 — **Settings UI polish**

8. `src/design/components/SettingsScreen.tsx`
   - ARIA tabs keyboard navigation.
   - Replace the "Clear Cache Now" no-op with "Rebuild Library" (3.8).
   - Implement `handleDeleteLibrary` against the new backend command (3.7).
   - Add `aria-label`s to sliders; proper radio `role`/`aria-checked`.
9. `src/design/styles/settings.css`
   - Nav overflow, single scroll owner, row grid, slider/accent/danger-zone
     styling (3.9).

Phase 5 — **Backend destructive command**

10. `src-tauri/src/commands/mod.rs` — add `delete_library_database`.
11. `src-tauri/src/lib.rs` — register it in `generate_handler!`.
12. `src/engine/commands/tauri.ts` — add `library.deleteDatabase()`.

Phase 6 — **Verification**

13. `npm run typecheck`
14. `npm run lint`
15. `npm run build`
16. `cargo check` / `cargo clippy` in `src-tauri/`
17. Manual visual pass (below).

---

## 5. Manual verification checklist

- [ ] Appearance = Dark, OS = Light -> app frame is dark **outside** Settings.
- [ ] Appearance = Light, OS = Dark -> app frame is light.
- [ ] Appearance = System -> follows OS live when the OS theme changes.
- [ ] Topbar theme toggle persists across an app restart.
- [ ] Each of the 6 accents changes buttons, links, active nav, sliders, focus rings.
- [ ] Accent + Dark combination has sufficient contrast.
- [ ] Sidebar Width slider resizes the sidebar live; value persists across restart.
- [ ] Sidebar sizing still collapses correctly at <=900px and <=700px.
- [ ] `get_settings` returns camelCase; saved appearance/accent/width survive restart.
- [ ] `watchFolders` round-trips through `save_settings` -> `get_settings`.
- [ ] "Delete Library Database" deletes the catalog (and only the catalog).
- [ ] "Rebuild Library" re-scans folders.
- [ ] Removing a source via `SourcesManager` still works (existing
      `remove_library_folder` path).
- [ ] Settings tabs are reachable by keyboard (arrows, Home, End).
- [ ] Settings page scrolls with a single scrollbar at 1200px, 960px, and 640px.
- [ ] No duplicate `:root` / `.app-frame` / `.app-body` definitions remain.

---

## 6. Out of scope / explicit non-goals

- **No unsafe clear-all API.** Removing every source is done via the existing,
  confirmed `remove_library_folder` command, each with its own confirmation.
- **No new file-deletion capability.** `delete_library_database` clears the
  *catalog* only; original files on disk are untouched.
- **No thumbnail cache implementation.** `get_item_thumbnail` is still a stub;
  the cache story is deferred until thumbnails actually exist.
- **`.gitignore` stays untouched** — the pending `.clinerules/` entry is not
  part of this work.
- **No dependency changes.** React 18, Zustand 4, Tauri 2, Vite 5 all stay
  as-is.

---

## 7. Appendix — key file/line index

| Concern | Location |
|---|---|
| `AppSettings` struct (snake_case bug) | `src-tauri/src/commands/mod.rs:227-262` |
| `PartialSettings` struct (correct) | `src-tauri/src/commands/mod.rs:190-225` |
| `get_settings` (missing `watch_folders`) | `src-tauri/src/commands/mod.rs:1239-1288` |
| `save_settings` (missing `watch_folders` persist) | `src-tauri/src/commands/mod.rs:1290-1375` |
| `remove_library_folder` (works, reuse it) | `src-tauri/src/commands/mod.rs:878-947` |
| `get_item_thumbnail` stub | `src-tauri/src/commands/mod.rs:758-762` |
| Command registration | `src-tauri/src/lib.rs:142-193` |
| SQLite schema (no cache table) | `src-tauri/src/db/mod.rs:43-190` |
| Frontend settings contract | `src/engine/types/settings.ts:1-48` |
| `applyTheme` (targets `:root`) | `src/engine/stores/useSettingsStore.ts:95-112` |
| Store hydrate/update | `src/engine/stores/useSettingsStore.ts:27-56` |
| IPC wrapper | `src/engine/commands/tauri.ts:150-156` |
| Local `dark` state | `src/app/App.tsx:70-74` |
| `.app-frame` class binding | `src/app/App.tsx:931` |
| Topbar theme toggle | `src/app/App.tsx:974-978` |
| Native window theme sync | `src/app/App.tsx:481-494` |
| Duplicate token blocks | `src/design/styles/global.css:1, 19, 56, 225, 234, 640, 649, 678` |
| `.app-body` grid definitions | `global.css:101, 728, 1305, 1320`; `App.css:72-78` |
| `.danger-button` duplicate | `global.css:166`; `interactive.css:81-90` |
| Settings tabs markup | `src/design/components/SettingsScreen.tsx:174-190` |
| Delete handler bug | `src/design/components/SettingsScreen.tsx:117-121` |
| Clear-cache no-op | `src/design/components/SettingsScreen.tsx:875-879` |
| `.settings-row` grid | `src/design/styles/settings.css:123-132` |
| `.settings-tab` sizing | `src/design/styles/settings.css:26-28` |
| `.accent-option.selected` | `src/design/styles/settings.css:256-259` |
