import React, { useEffect, useRef, useState } from "react";
import { useSettingsStore, useAppearance, useAccentColor, useSidebarWidth, useDefaultLayout, applyTheme } from "../../engine/stores";
import type { LibraryFolder } from "../../engine/types/commands";
import { SourcesManager } from "./SourcesManager";
import { LockIcon } from "./icons";

type SettingsTab = "general" | "viewing" | "library" | "privacy" | "advanced";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "viewing", label: "Viewing" },
  { id: "library", label: "Library" },
  { id: "privacy", label: "Privacy & Security" },
  { id: "advanced", label: "Advanced" },
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
  { id: "slideshow", label: "Slideshow" },
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
            {tab.label}
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
        />}
      </div>
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
        <h2 className="settings-section-title">Appearance</h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Theme</b>
            <span className="settings-row-desc">Choose light, dark, or follow system</span>
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
            <span className="settings-row-desc">Used for highlights, buttons, and selection</span>
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
            <span className="settings-row-desc">Display .jpg, .raw, .mov in grid captions</span>
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
        <h2 className="settings-section-title">Startup</h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Open On Launch</b>
            <span className="settings-row-desc">What to show when Stillroom starts</span>
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
        <h2 className="settings-section-title">Grid & Layout</h2>
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
        <h2 className="settings-section-title">Slideshow</h2>
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
        <h2 className="settings-section-title">Video Playback</h2>
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
        <h2 className="settings-section-title">Import & Organization</h2>
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
        <span className="settings-warning-icon">⚠</span>
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
        <h2 className="settings-section-title">Private Vault</h2>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Enable Vault</b>
            <span className="settings-row-desc">Encrypt hidden items with Secure Enclave. Requires Touch ID or password to unlock.</span>
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
            <span className="settings-row-desc">How to authenticate when opening the vault</span>
          </div>
          <div className="settings-row-control">
            {props.renderRadioGroup("vaultMethod", props.vaultMethod, VAULT_METHODS, (v: string) => props.onChange("vaultUnlockMethod", v))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <b>Auto-lock After</b>
            <span className="settings-row-desc">Minutes of inactivity before vault locks automatically</span>
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
            <span className="settings-row-desc">Lock vault when Mac sleeps or screen saver starts</span>
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
        <h2 className="settings-section-title">Export Privacy</h2>
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
        <h2 className="settings-section-title">Data & Network</h2>
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
}) {
  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">Cache & Performance</h2>
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
            <span className="settings-row-desc" style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "12px" }}>Frees disk space, thumbnails will regenerate</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Developer</h2>
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

      <section className="settings-section">
        <h2 className="settings-section-title">Danger Zone</h2>
        <div className="settings-row">
          <div className="settings-row-control">
            <button className="danger-button" type="button" style={{ background: "transparent", border: "1px solid #dc2626", color: "#dc2626" }}>
              Reset All Settings
            </button>
            <span className="settings-row-desc" style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "12px" }}>Restores all settings to defaults</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-control">
            <button className="danger-button" type="button" style={{ background: "transparent", border: "1px solid #dc2626", color: "#dc2626" }}>
              Delete Library Database
            </button>
            <span className="settings-row-desc" style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "12px" }}>Removes catalog, albums, tags. Original files unaffected.</span>
          </div>
        </div>
      </section>
    </>
  );
}