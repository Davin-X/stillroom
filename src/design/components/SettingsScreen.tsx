import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSettingsStore, useAppearance, useAccentColor, useSidebarWidth, useDefaultLayout, useLibraryStore, useSystemDark, ACCENT_PALETTE } from "../../engine/stores";
import { tauri } from "../../engine/commands/tauri";
import type { LibraryFolder } from "../../engine/types/commands";
import { SourcesManager } from "./SourcesManager";
import { LockIcon, GearIcon, EyeIcon, FolderIcon, ShieldIcon, CpuIcon, TrashIcon, RotateCcwIcon, DownloadIcon, InfoIcon } from "./icons";

type SettingsTab = "general" | "viewing" | "library" | "privacy" | "advanced";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <GearIcon size={15} /> },
  { id: "viewing", label: "Viewing", icon: <EyeIcon size={15} /> },
  { id: "library", label: "Library", icon: <FolderIcon size={15} /> },
  { id: "privacy", label: "Privacy & Security", icon: <ShieldIcon size={15} /> },
  { id: "advanced", label: "Advanced", icon: <CpuIcon size={15} /> },
];

const LAYOUT_OPTIONS = [
  { id: "grid", label: "Grid" },
  { id: "filmstrip", label: "Filmstrip" },
  { id: "overview", label: "Overview" },
] as const;

const THUMBNAIL_SIZES = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
] as const;

const STARTUP_VIEWS = [
  { id: "library", label: "Library" },
  { id: "last", label: "Last View" },
] as const;

export function SettingsScreen(props: {
  onAddFolder?: () => void;
  onRemoveFolder?: (folder: LibraryFolder) => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const sidebarWidth = useSidebarWidth();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingLibrary, setDeletingLibrary] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  
  // Settings values
  const appearance = useAppearance();
  const accentColor = useAccentColor();
  // Which accent variant (light/dark) is live, so the swatches preview the
  // color that will actually be applied.
  const systemDark = useSystemDark();
  const isDark = appearance === "dark" || (appearance === "system" && systemDark);
  const defaultLayout = useDefaultLayout();
  const stripGps = useSettingsStore((s) => s.stripGpsOnExport);
  const stripAllMeta = useSettingsStore((s) => s.stripAllMetadataOnExport);
  const autoImport = useSettingsStore((s) => s.autoImport);
  const pairRawJpeg = useSettingsStore((s) => s.pairRawJpeg);
  const stackBursts = useSettingsStore((s) => s.stackBursts);
  const animateTransitions = useSettingsStore((s) => s.animateTransitions);
  const showExtensions = useSettingsStore((s) => s.showExtensions);
  const openLastFolder = useSettingsStore((s) => s.openLastFolder);
  const restoreWindow = useSettingsStore((s) => s.restoreWindowState);
  const startupView = useSettingsStore((s) => s.startupView);
  const thumbnailSize = useSettingsStore((s) => s.thumbnailSize);
  const slideshowInterval = useSettingsStore((s) => s.slideshowInterval);
  const slideshowShuffle = useSettingsStore((s) => s.slideshowShuffle);
  const slideshowLoop = useSettingsStore((s) => s.slideshowLoop);
  const videoAutoPlay = useSettingsStore((s) => s.videoAutoPlay);
  const videoLoop = useSettingsStore((s) => s.videoLoop);
  const maxCacheSize = useSettingsStore((s) => s.maxCacheSizeGB);
  const thumbnailQuality = useSettingsStore((s) => s.thumbnailQuality);
  const debugLogging = useSettingsStore((s) => s.enableDebugLogging);
  const showNativeWarnings = useSettingsStore((s) => s.showNativeLimitWarnings);
  
  const update = useSettingsStore((s) => s.update);
  const updateMany = useSettingsStore((s) => s.updateMany);
  const resetSettings = useSettingsStore((s) => s.reset);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);
  const showNotice = useLibraryStore((s) => s.showNotice);

  // Settings hydration and theme application are owned by App.tsx, which is
  // always mounted; Settings only reads and writes.

  const handleSidebarWidthChange = (width: number) => {
    update("sidebarWidth", width);
  };

  const handleResetSettings = useCallback(async () => {
    setShowResetConfirm(false);
    await resetSettings();
  }, [resetSettings]);

  const handleDeleteLibrary = useCallback(async () => {
    setShowDeleteConfirm(false);
    setDeletingLibrary(true);
    try {
      await tauri.library.deleteDatabase();
      await loadLibrary();
      showNotice("Library database deleted. Original files were left untouched.");
    } catch (e) {
      showNotice(`Could not delete the library database: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingLibrary(false);
    }
  }, [loadLibrary, showNotice]);

  // Re-scan every registered source through the existing scan path. There is no
  // thumbnail cache yet, so this is the honest replacement for "Clear Cache".
  const handleRebuildLibrary = useCallback(async () => {
    setRebuilding(true);
    try {
      const folders = await tauri.library.getFolders();
      if (!folders.length) {
        showNotice("No library folders to rebuild.");
        return;
      }
      for (const folder of folders) {
        await tauri.library.scan(folder.path);
      }
      await loadLibrary();
      showNotice(`Rebuilt ${folders.length} folder${folders.length === 1 ? "" : "s"}.`);
    } catch (e) {
      showNotice(`Rebuild failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRebuilding(false);
    }
  }, [loadLibrary, showNotice]);

  // Standard ARIA tabs keyboard model: arrows cycle, Home/End jump.
  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    let next = index;
    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActiveTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const renderRadioGroup = (
    name: string,
    value: string,
    options: { id: string; label: string }[],
    onChange: (v: string) => void
  ) => (
    <div className="radio-group" role="radiogroup" aria-label={name}>
      {options.map((opt) => (
        <label key={opt.id} className="radio-option">
          <input
            type="radio"
            name={name}
            value={opt.id}
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
          />
          <span className="radio-dot" />
          <span className="radio-label">{opt.label}</span>
        </label>
      ))}
    </div>
  );

  const renderAccentPicker = (value: string, onChange: (v: string) => void) => (
    <div className="accent-picker" role="radiogroup" aria-label="Accent color">
      {ACCENT_PALETTE.map((c) => {
        const selected = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            className={`accent-option ${selected ? "selected" : ""}`}
            onClick={() => onChange(c.id)}
            aria-label={c.label}
            aria-pressed={selected}
            title={c.label}
          >
            <span
              className="accent-swatch"
              style={{ background: isDark ? c.dark : c.light }}
              aria-hidden="true"
            />
            <span className="accent-name">{c.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p className="page-subtitle">Customize Stillroom to match your workflow.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="settings-tabs" role="tablist" aria-label="Settings categories">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <span className="settings-tab-icon">{tab.icon}</span>
            <span className="settings-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="settings-panel">
        {activeTab === "general" && <GeneralPanel
          appearance={appearance}
          accentColor={accentColor}
          sidebarWidth={sidebarWidth}
          animateTransitions={animateTransitions}
          showExtensions={showExtensions}
          startupView={startupView}
          openLastFolder={openLastFolder}
          restoreWindow={restoreWindow}
          onChange={update}
          onSidebarWidthChange={handleSidebarWidthChange}
          renderRadioGroup={renderRadioGroup}
          renderAccentPicker={renderAccentPicker}
        />}
        {activeTab === "viewing" && <ViewingPanel
          defaultLayout={defaultLayout}
          thumbnailSize={thumbnailSize}
          slideshowInterval={slideshowInterval}
          slideshowShuffle={slideshowShuffle}
          slideshowLoop={slideshowLoop}
          videoAutoPlay={videoAutoPlay}
          videoLoop={videoLoop}
          onChange={update}
          renderRadioGroup={renderRadioGroup}
        />}
        {activeTab === "library" && <LibraryPanel
          autoImport={autoImport}
          pairRawJpeg={pairRawJpeg}
          stackBursts={stackBursts}
          onAddFolder={props.onAddFolder}
          onRemoveFolder={props.onRemoveFolder}
          onChange={update}
        />}
        {activeTab === "privacy" && <PrivacyPanel
          stripGps={stripGps}
          stripAllMeta={stripAllMeta}
          onChange={update}
        />}
        {activeTab === "advanced" && <AdvancedPanel
          maxCacheSize={maxCacheSize}
          thumbnailQuality={thumbnailQuality}
          debugLogging={debugLogging}
          showNativeWarnings={showNativeWarnings}
          onChange={update}
          showResetConfirm={showResetConfirm}
          setShowResetConfirm={setShowResetConfirm}
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          onConfirmReset={handleResetSettings}
          onConfirmDelete={handleDeleteLibrary}
          deleting={deletingLibrary}
          onRebuild={handleRebuildLibrary}
          rebuilding={rebuilding}
        />}
      </div>

      {/* Confirmation Dialogs */}
      {showResetConfirm && (
        <div className="dialog-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="album-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">RESET</p>
                <h2>Reset All Settings?</h2>
              </div>
            </div>
            <p className="dialog-body">This will restore all preferences to their defaults. Your library, albums, and tags will not be affected.</p>
            <div className="dialog-actions">
              <button type="button" className="quiet-button" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button type="button" className="danger-button" onClick={handleResetSettings}>Reset</button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="dialog-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="album-dialog delete-album-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">DELETE</p>
                <h2>Delete Library Database?</h2>
              </div>
            </div>
            <p className="dialog-body">This removes the catalog, albums, tags, and all metadata. <b>Original files on disk are not affected.</b> You can re-import folders to rebuild.</p>
            <div className="dialog-actions">
              <button type="button" className="quiet-button" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button type="button" className="danger-button" onClick={handleDeleteLibrary}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== PANEL COMPONENTS =====

function GeneralPanel(props: {
  appearance: string;
  accentColor: string;
  sidebarWidth: number;
  animateTransitions: boolean;
  showExtensions: boolean;
  startupView: string;
  openLastFolder: boolean;
  restoreWindow: boolean;
  onChange: (key: any, value: any) => void;
  onSidebarWidthChange: (width: number) => void;
  renderRadioGroup: any;
  renderAccentPicker: any;
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">
          <GearIcon size={14} /> Appearance
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Theme</b>
          </div>
          <div className="settings-row-control">
            {props.renderRadioGroup("theme", props.appearance, [
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
              { id: "system", label: "System" },
            ], (v: string) => props.onChange("appearance", v))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Accent Color</b>
          </div>
          <div className="settings-row-control">
            {props.renderAccentPicker(props.accentColor, (v: string) => props.onChange("accentColor", v))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Sidebar Width</b>
            <span className="settings-row-desc">Adjust the navigation sidebar size</span>
          </div>
          <div className="settings-row-control" style={{ alignItems: "center" }}>
            <input
              type="range"
              className="settings-slider"
              min={180}
              max={360}
              step={4}
              value={props.sidebarWidth}
              onChange={(e) => props.onSidebarWidthChange(Number(e.target.value))}
              aria-label="Sidebar width"
            />
            <span className="settings-slider-value">{props.sidebarWidth}px</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Show File Extensions</b>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.showExtensions}
                onChange={(e) => props.onChange("showExtensions", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Animate Transitions</b>
            <span className="settings-row-desc">Smooth animations for navigation and zoom</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.animateTransitions}
                onChange={(e) => props.onChange("animateTransitions", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          <GearIcon size={14} /> Startup
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Open On Launch</b>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={props.startupView}
              onChange={(e) => props.onChange("startupView", e.target.value)}
            >
              {STARTUP_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Open Last Library Folder</b>
            <span className="settings-row-desc">Automatically load the last opened folder</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.openLastFolder}
                onChange={(e) => props.onChange("openLastFolder", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Restore Window State</b>
            <span className="settings-row-desc">Remember window size, position, and sidebar width</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.restoreWindow}
                onChange={(e) => props.onChange("restoreWindowState", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>
    </>
  );
}

function ViewingPanel(props: {
  defaultLayout: string;
  thumbnailSize: string;
  slideshowInterval: number;
  slideshowShuffle: boolean;
  slideshowLoop: boolean;
  videoAutoPlay: boolean;
  videoLoop: boolean;
  onChange: (key: any, value: any) => void;
  renderRadioGroup: any;
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">
          <EyeIcon size={14} /> Grid & Layout
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Default Layout</b>
            <span className="settings-row-desc">Starting layout when opening the library</span>
          </div>
          <div className="settings-row-control">
            {props.renderRadioGroup("layout", props.defaultLayout, LAYOUT_OPTIONS, (v: string) => props.onChange("defaultLayout", v))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Thumbnail Size</b>
            <span className="settings-row-desc">Default thumbnail dimensions in grid view</span>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={props.thumbnailSize}
              onChange={(e) => props.onChange("thumbnailSize", e.target.value)}
            >
              {THUMBNAIL_SIZES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          <EyeIcon size={14} /> Slideshow
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Interval</b>
            <span className="settings-row-desc">Seconds between slides</span>
          </div>
          <div className="settings-row-control" style={{ alignItems: "center" }}>
            <input
              type="range"
              className="settings-slider"
              min={2}
              max={30}
              step={1}
              value={props.slideshowInterval}
              onChange={(e) => props.onChange("slideshowInterval", Number(e.target.value))}
              aria-label="Slideshow interval in seconds"
            />
            <span className="settings-slider-value">{props.slideshowInterval}s</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Shuffle</b>
            <span className="settings-row-desc">Randomize slide order</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.slideshowShuffle}
                onChange={(e) => props.onChange("slideshowShuffle", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Loop</b>
            <span className="settings-row-desc">Restart from beginning when reaching the end</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.slideshowLoop}
                onChange={(e) => props.onChange("slideshowLoop", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          <EyeIcon size={14} /> Video Playback
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Auto-play</b>
            <span className="settings-row-desc">Start playing videos when opened in viewer</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.videoAutoPlay}
                onChange={(e) => props.onChange("videoAutoPlay", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Loop Videos</b>
            <span className="settings-row-desc">Restart video when it ends</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.videoLoop}
                onChange={(e) => props.onChange("videoLoop", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>
    </>
  );
}

function LibraryPanel(props: {
  autoImport: boolean;
  pairRawJpeg: boolean;
  stackBursts: boolean;
  onAddFolder?: () => void;
  onRemoveFolder?: (folder: LibraryFolder) => void;
  onChange: (key: any, value: any) => void;
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">
          <FolderIcon size={14} /> Import & Organization
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Auto-import New Files</b>
            <span className="settings-row-desc">Automatically add files when dropped or saved to watched folders</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.autoImport}
                onChange={(e) => props.onChange("autoImport", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Pair RAW + JPEG</b>
            <span className="settings-row-desc">Group RAW and JPEG files shot together as a single item</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.pairRawJpeg}
                onChange={(e) => props.onChange("pairRawJpeg", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Stack Burst Photos</b>
            <span className="settings-row-desc">Group rapid-sequence shots (burst mode) into stacks</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.stackBursts}
                onChange={(e) => props.onChange("stackBursts", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <SourcesManager
        variant="inline"
        onAddFolder={props.onAddFolder}
        onRemoveFolder={props.onRemoveFolder}
      />

      <div className="settings-warning">
        <span className="settings-warning-icon"><InfoIcon size={14} /></span>
        <span>Folder watching requires granting Full Disk Access in System Settings → Privacy & Security. Without it, Stillroom can only import files you explicitly select.</span>
      </div>
    </>
  );
}

function PrivacyPanel(props: {
  stripGps: boolean;
  stripAllMeta: boolean;
  onChange: (key: any, value: any) => void;
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">
          <ShieldIcon size={14} /> Export Privacy
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Strip GPS Location</b>
            <span className="settings-row-desc">Remove location data from exported copies</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.stripGps}
                onChange={(e) => props.onChange("stripGpsOnExport", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Strip All Metadata</b>
            <span className="settings-row-desc">Remove EXIF, camera info, and all metadata from exports</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.stripAllMeta}
                onChange={(e) => props.onChange("stripAllMetadataOnExport", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          <ShieldIcon size={14} /> Data & Network
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Network Access</b>
            <span className="settings-row-desc">Allow any network connections (updates, crash reports)</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => props.onChange("allowNetworkRequests", e.target.checked)}
                disabled
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Crash Reports</b>
            <span className="settings-row-desc">Automatically send anonymous crash reports to help improve Stillroom</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => props.onChange("sendCrashReports", e.target.checked)}
                disabled
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-warning">
          <span className="settings-warning-icon"><LockIcon size={14} /></span>
          <span><b>Local-first by design.</b> Stillroom never uploads your photos. All processing happens on your Mac. Network access is only for optional update checks.</span>
        </div>
      </section>
    </>
  );
}

function AdvancedPanel(props: {
  maxCacheSize: number;
  thumbnailQuality: number;
  debugLogging: boolean;
  showNativeWarnings: boolean;
  onChange: (key: any, value: any) => void;
  showResetConfirm: boolean;
  setShowResetConfirm: (v: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;
  onConfirmReset: () => void;
  onConfirmDelete: () => void;
  deleting: boolean;
  onRebuild: () => void;
  rebuilding: boolean;
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">
          <CpuIcon size={14} /> Cache & Performance
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Maximum Cache Size</b>
            <span className="settings-row-desc">Disk space for thumbnails and previews</span>
          </div>
          <div className="settings-row-control" style={{ alignItems: "center" }}>
            <input
              type="range"
              className="settings-slider"
              min={1}
              max={50}
              step={1}
              value={props.maxCacheSize}
              onChange={(e) => props.onChange("maxCacheSizeGB", Number(e.target.value))}
              aria-label="Maximum cache size in gigabytes"
            />
            <span className="settings-slider-value">{props.maxCacheSize} GB</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Thumbnail Quality</b>
            <span className="settings-row-desc">JPEG quality for generated thumbnails (higher = larger files)</span>
          </div>
          <div className="settings-row-control" style={{ alignItems: "center" }}>
            <input
              type="range"
              className="settings-slider"
              min={50}
              max={100}
              step={5}
              value={props.thumbnailQuality}
              onChange={(e) => props.onChange("thumbnailQuality", Number(e.target.value))}
              aria-label="Thumbnail JPEG quality percentage"
            />
            <span className="settings-slider-value">{props.thumbnailQuality}%</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Rebuild Library</b>
            <span className="settings-row-desc">Re-scan every source folder and refresh the catalog</span>
          </div>
          <div className="settings-row-control">
            <button
              className="quiet-button"
              type="button"
              onClick={props.onRebuild}
              disabled={props.rebuilding}
            >
              {props.rebuilding ? "Rebuilding…" : "Rebuild Library"}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          <CpuIcon size={14} /> Developer
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Debug Logging</b>
            <span className="settings-row-desc">Verbose logs in Console.app for troubleshooting</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.debugLogging}
                onChange={(e) => props.onChange("enableDebugLogging", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Show Native Limit Warnings</b>
            <span className="settings-row-desc">Display notices when browser preview lacks native features</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.showNativeWarnings}
                onChange={(e) => props.onChange("showNativeLimitWarnings", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section settings-danger-zone">
        <h2 className="settings-section-title">
          <TrashIcon size={14} /> Danger Zone
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Reset All Settings</b>
            <span className="settings-row-desc">Restores all settings to defaults</span>
          </div>
          <div className="settings-row-control">
            <button className="danger-button" type="button" onClick={() => props.setShowResetConfirm(true)}>
              Reset All Settings
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Delete Library Database</b>
            <span className="settings-row-desc">Removes catalog, albums, tags. Original files unaffected.</span>
          </div>
          <div className="settings-row-control">
            <button
              className="danger-button"
              type="button"
              onClick={() => props.setShowDeleteConfirm(true)}
              disabled={props.deleting}
            >
              {props.deleting ? "Deleting…" : "Delete Library Database"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}