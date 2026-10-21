import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSettingsStore, useAppearance, useAccentColor, useSidebarWidth, useDefaultLayout, applyTheme } from "../../engine/stores";
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

const ACCENT_COLORS: { id: string; label: string; color: string }[] = [
  { id: "blue", label: "Blue", color: "#3474d4" },
  { id: "purple", label: "Purple", color: "#8b5cf6" },
  { id: "green", label: "Green", color: "#27845f" },
  { id: "orange", label: "Orange", color: "#ea7a1a" },
  { id: "pink", label: "Pink", color: "#db2777" },
  { id: "red", label: "Red", color: "#dc2626" },
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

const VAULT_METHODS = [
  { id: "both", label: "Password & Touch ID" },
  { id: "password", label: "Password Only" },
  { id: "touchid", label: "Touch ID Only" },
] as const;

export function SettingsScreen(props: {
  onAddFolder?: () => void;
  onRemoveFolder?: (folder: LibraryFolder) => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [sidebarWidth, setSidebarWidthState] = useState(220);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Settings values
  const appearance = useAppearance();
  const accentColor = useAccentColor();
  const defaultLayout = useDefaultLayout();
  const vaultEnabled = useSettingsStore((s) => s.vaultEnabled);
  const vaultAutoLock = useSettingsStore((s) => s.vaultAutoLockMinutes);
  const vaultMethod = useSettingsStore((s) => s.vaultUnlockMethod);
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
  const hydrate = useSettingsStore((s) => s.hydrate);
  const loading = useSettingsStore((s) => s._loading);
  const resetSettings = useSettingsStore((s) => s.reset);

  // Apply theme on mount and when settings change
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!loading) applyTheme({ appearance, accentColor });
  }, [appearance, accentColor, loading]);

  // Sync sidebar width from store
  useEffect(() => {
    const unsub = useSettingsStore.subscribe(
      (state) => setSidebarWidthState(state.sidebarWidth)
    );
    return unsub;
  }, []);

  const handleSidebarWidthChange = (width: number) => {
    setSidebarWidthState(width);
    update("sidebarWidth", width);
  };

  const handleResetSettings = useCallback(async () => {
    setShowResetConfirm(false);
    await resetSettings();
  }, [resetSettings]);

  const handleDeleteLibrary = useCallback(async () => {
    setShowDeleteConfirm(false);
    await resetSettings(); // Using resetSettings as a placeholder for now
  }, [resetSettings]);

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
      {ACCENT_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`accent-option ${value === c.id ? "selected" : ""}`}
          style={{ background: c.color }}
          onClick={() => onChange(c.id)}
          aria-label={c.label}
          aria-pressed={value === c.id}
        />
      ))}
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
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
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
          vaultEnabled={vaultEnabled}
          vaultAutoLock={vaultAutoLock}
          vaultMethod={vaultMethod}
          stripGps={stripGps}
          stripAllMeta={stripAllMeta}
          onChange={update}
          renderRadioGroup={renderRadioGroup}
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
          </div>
          <div className="settings-row-control" style={{ alignItems: "center" }}>
            <input
              type="range"
              className="settings-slider"
              min={180}
              max={320}
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
          </div>
          <div className="settings-row-control">
            {props.renderRadioGroup("layout", props.defaultLayout, LAYOUT_OPTIONS, (v: string) => props.onChange("defaultLayout", v))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Thumbnail Size</b>
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
            />
            <span className="settings-slider-value">{props.slideshowInterval}s</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Shuffle</b>
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
  vaultEnabled: boolean;
  vaultAutoLock: number;
  vaultMethod: string;
  stripGps: boolean;
  stripAllMeta: boolean;
  onChange: (key: any, value: any) => void;
  renderRadioGroup: any;
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">
          <ShieldIcon size={14} /> Private Vault
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Enable Vault</b>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={props.vaultEnabled}
                onChange={(e) => props.onChange("vaultEnabled", e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Unlock Method</b>
          </div>
          <div className="settings-row-control">
            {props.renderRadioGroup("vaultMethod", props.vaultMethod, VAULT_METHODS, (v: string) => props.onChange("vaultUnlockMethod", v))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Auto-lock After</b>
          </div>
          <div className="settings-row-control" style={{ alignItems: "center" }}>
            <input
              type="range"
              className="settings-slider"
              min={0}
              max={60}
              step={1}
              value={props.vaultAutoLock}
              onChange={(e) => props.onChange("vaultAutoLockMinutes", Number(e.target.value))}
            />
            <span className="settings-slider-value">
              {props.vaultAutoLock === 0 ? "Never" : `${props.vaultAutoLock} min`}
            </span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Lock on Sleep</b>
          </div>
          <div className="settings-row-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={true}
                onChange={(e) => props.onChange("vaultLockOnSleep", e.target.checked)}
                disabled
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          <ShieldIcon size={14} /> Export Privacy
        </h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Strip GPS Location</b>
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
            />
            <span className="settings-slider-value">{props.thumbnailQuality}%</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-control">
            <button className="quiet-button" type="button">Clear Cache Now</button>
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

      <section className="settings-section">
        <h2 className="settings-section-title">
          <TrashIcon size={14} /> Danger Zone
        </h2>
        <div className="settings-row">
          <div className="settings-row-control">
            <button className="danger-button" type="button" onClick={() => props.setShowResetConfirm(true)}>
              Reset All Settings
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-control">
            <button className="danger-button" type="button" onClick={() => props.setShowDeleteConfirm(true)}>
              Delete Library Database
            </button>
          </div>
        </div>
      </section>
    </>
  );
}