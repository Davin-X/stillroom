import React from "react";
import { useSettingsStore, useAppearance, useAccentColor, useSidebarWidth, useDefaultLayout, useLibraryStore, useSystemDark, ACCENT_PALETTE } from "../../../engine/stores";
import { tauri } from "../../../engine/commands/tauri";
import type { LibraryFolder } from "../../../engine/types/commands";
import { SourcesManager } from "../SourcesManager";
import { LockIcon, GearIcon, EyeIcon, FolderIcon, ShieldIcon, CpuIcon, TrashIcon, RotateCcwIcon, DownloadIcon, InfoIcon } from "../icons";

export function PrivacyPanel(props: {
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

