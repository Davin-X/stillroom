/**
 * Centralized media type identifiers - single source of truth for
 * type colors, icons, labels, and display strings across the entire app.
 */

export type MediaKind = "photo" | "video" | "raw";

export interface TypeIdentity {
  /** Short display label (e.g., "Photo", "Video", "RAW") */
  label: string;
  /** Color for dots, badges, accents */
  color: string;
  /** Soft background color for badges */
  softColor: string;
  /** Icon name for inline SVG/icons */
  icon: string;
  /** Whether this type supports dimensions */
  hasDimensions: boolean;
  /** Whether this type supports duration */
  hasDuration: boolean;
}

export const TYPE_IDENTITY: Record<MediaKind, TypeIdentity> = {
  photo: {
    label: "Photo",
    color: "var(--blue)",
    softColor: "var(--blue-soft)",
    icon: "photo",
    hasDimensions: true,
    hasDuration: false,
  },
  video: {
    label: "Video",
    color: "var(--green)",
    softColor: "var(--green-soft)",
    icon: "video",
    hasDimensions: true,
    hasDuration: true,
  },
  raw: {
    label: "RAW",
    color: "var(--orange)",
    softColor: "var(--orange-soft)",
    icon: "raw",
    hasDimensions: true,
    hasDuration: false,
  },
};

/** Get type identity for a media kind */
export function getTypeIdentity(kind: MediaKind): TypeIdentity {
  return TYPE_IDENTITY[kind] ?? TYPE_IDENTITY.photo;
}

/** Get CSS class for a kind badge */
export function getKindBadgeClass(kind: MediaKind): string {
  return `kind-badge ${kind}`;
}

/** Get CSS class for a kind dot */
export function getKindDotClass(kind: MediaKind): string {
  return `kind-dot ${kind}`;
}

/** Get SVG icon for a kind (inline SVG string) */
export function getKindIcon(kind: MediaKind, size = 14): string {
  const icons: Record<MediaKind, string> = {
    photo: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12"/></svg>`,
    video: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h8v8H4z"/><path d="M4 8h8"/></svg>`,
    raw: `<svg width="${size}" height="${16}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h8v8H4z"/><path d="M4 8h8"/></svg>`,
  };
  return icons[kind] ?? icons.photo;
}