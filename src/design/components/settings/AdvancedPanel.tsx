import React from "react";
import { useSettingsStore, useAppearance, useAccentColor, useSidebarWidth, useDefaultLayout, useLibraryStore, useSystemDark, ACCENT_PALETTE } from "../../../engine/stores";
import { tauri } from "../../../engine/commands/tauri";
import type { LibraryFolder } from "../../../engine/types/commands";
import { SourcesManager } from "../SourcesManager";
import { LockIcon, GearIcon, EyeIcon, FolderIcon, ShieldIcon, CpuIcon, TrashIcon, RotateCcwIcon, DownloadIcon, InfoIcon } from "../icons";

export function AdvancedPanel(props: {
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
