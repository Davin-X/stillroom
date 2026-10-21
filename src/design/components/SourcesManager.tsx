import React, { useState } from "react";
import { formatBytes, tauri } from "../../engine/commands/tauri";
import { useLibraryStore } from "../../engine/stores";
import type { LibraryFolder } from "../../engine/types/commands";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { FolderIcon, MoreIcon, PlusIcon } from "./icons";

/**
 * The single place where library sources are managed.
 *
 * Rendered twice: inline in Settings → Library, and inside a modal sheet opened
 * from the sidebar. Keeping one component means the two surfaces can never
 * drift apart — the sidebar only projects the list, it never manages it.
 */
export function SourcesManager(props: {
  variant?: "inline" | "sheet";
  onAddFolder?: () => void;
  onRemoveFolder?: (folder: LibraryFolder) => void;
}) {
  const { variant = "inline", onAddFolder, onRemoveFolder } = props;
  const folders = useLibraryStore((s) => s.folders);
  const [menu, setMenu] = useState<{ folder: LibraryFolder; x: number; y: number } | null>(null);

  const totalItems = folders.reduce((sum, folder) => sum + folder.itemCount, 0);
  const totalSize = folders.reduce((sum, folder) => sum + folder.totalSize, 0);

  const openMenu = (folder: LibraryFolder, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ folder, x: rect.right - 4, y: rect.bottom + 4 });
  };

  const reveal = (folder: LibraryFolder) => {
    void tauri.items.revealInFinder(folder.path).catch((error: unknown) => {
      console.error("reveal_in_finder failed:", error);
    });
  };

  const menuItems = (folder: LibraryFolder): ContextMenuItem[] => [
    { label: "Reveal in Finder", onClick: () => reveal(folder) },
    { label: "", divider: true },
    {
      label: "Remove Source…",
      danger: true,
      disabled: !onRemoveFolder,
      onClick: () => onRemoveFolder?.(folder),
    },
  ];

  const body = (
    <>
      <div className="sources-summary">
        <span className="sources-summary-text">
          {folders.length.toLocaleString()} source{folders.length === 1 ? "" : "s"}
          <span className="sources-summary-dot" aria-hidden="true">·</span>
          {totalItems.toLocaleString()} items
          <span className="sources-summary-dot" aria-hidden="true">·</span>
          {formatBytes(totalSize)}
        </span>
        <button
          className="primary-button"
          type="button"
          onClick={() => onAddFolder?.()}
          disabled={!onAddFolder}
        >
          <PlusIcon size={14} /> Add Folder…
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="sources-empty">
          <span className="sources-empty-icon"><FolderIcon size={24} /></span>
          <b>No sources yet</b>
          <p>Add a folder to start indexing. Files are read in place — nothing is copied or moved.</p>
          <button className="quiet-button" type="button" onClick={() => onAddFolder?.()} disabled={!onAddFolder}>
            <PlusIcon size={14} /> Add Folder…
          </button>
        </div>
      ) : (
        <table className="sources-table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Location</th>
              <th scope="col" className="sources-num">Items</th>
              <th scope="col" className="sources-num">Size</th>
              <th scope="col"><span className="sources-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder) => (
              <tr key={folder.path}>
                <td>
                  <span className="sources-name">
                    <span className="sources-icon"><FolderIcon size={15} /></span>
                    <span className="sources-name-text" title={folder.name}>{folder.name}</span>
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="sources-path"
                    title={folder.path}
                    onClick={() => reveal(folder)}
                  >
                    {compactPath(folder.path)}
                  </button>
                </td>
                <td className="sources-num">{folder.itemCount.toLocaleString()}</td>
                <td className="sources-num">{formatBytes(folder.totalSize)}</td>
                <td className="sources-actions">
                  <button
                    type="button"
                    className="sources-row-menu"
                    aria-label={`Actions for ${folder.name}`}
                    title="Source actions"
                    onClick={(event) => openMenu(folder, event)}
                  >
                    <MoreIcon size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {variant === "inline" && (
        <div className="settings-warning">
          <span className="settings-warning-icon">⚠</span>
          <span>
            Removing a source only clears it from Stillroom. Your files stay exactly where they are
            on disk, and adding the folder again brings everything back.
          </span>
        </div>
      )}

      {menu && (
        <ContextMenu
          items={menuItems(menu.folder)}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );

  if (variant === "sheet") {
    return <div className="sources-manager">{body}</div>;
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Sources</h2>
      <p className="settings-section-desc">
        Folders Stillroom indexes. Your files are read in place and never moved.
      </p>
      {body}
    </section>
  );
}

/** `/Users/dev/Pictures/Trips/2024` → `~/Pictures/…/2024` — keeps the tail. */
function compactPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/);
  let compact = home ? `~${path.slice(home[0].length)}` : path;
  const parts = compact.split("/").filter(Boolean);
  if (parts.length > 4) {
    compact = `${parts[0] === "~" ? "~/" : "/"}…/${parts.slice(-2).join("/")}`;
  }
  return compact;
}
