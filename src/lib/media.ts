import { parse } from "exifr";

export type MediaKind = "photo" | "video" | "raw" | "unsupported";

export interface MediaItem {
  id: string;
  file: File;
  url: string;
  name: string;
  relativePath: string;
  extension: string;
  kind: MediaKind;
  modifiedAt: number;
  capturedAt?: number;
  width?: number;
  height?: number;
  camera?: string;
  lens?: string;
  exposure?: string;
  iso?: number;
  latitude?: number;
  longitude?: number;
  metadataError?: string;
  favorite: boolean;
  hidden: boolean;
  tags: string[];
}

const imageExtensions = new Set([
  "avif", "bmp", "gif", "heic", "heif", "jfif", "jpe", "jpeg", "jpg", "jxl",
  "png", "tif", "tiff", "webp",
]);
const rawExtensions = new Set([
  "3fr", "ari", "arw", "bay", "cap", "cr2", "cr3", "dcs", "dcr", "dng",
  "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef",
  "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d",
  "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "x3f",
]);
const videoExtensions = new Set(["m4v", "mov", "mp4", "mpeg", "mpg", "webm"]);

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function readDimensions(file: File, kind: MediaKind): Promise<{ width?: number; height?: number }> {
  if (kind === "video") {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      video.src = url;
    });
  }

  if (kind !== "photo") return Promise.resolve({});

  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

async function readExif(file: File): Promise<Partial<MediaItem>> {
  try {
    const result: unknown = await parse(file, {
      gps: true,
      pick: ["Make", "Model", "LensModel", "DateTimeOriginal", "CreateDate", "ExposureTime", "FNumber", "ISO", "FocalLength", "latitude", "longitude"],
    });
    if (!result || typeof result !== "object") return {};
    const tags = result as Record<string, unknown>;
    const captureDate = tags.DateTimeOriginal ?? tags.CreateDate;
    const captureDateString = typeof captureDate === "string"
      ? captureDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")
      : captureDate;
    const capturedAt = captureDateString instanceof Date
      ? captureDateString.getTime()
      : typeof captureDateString === "string" || typeof captureDateString === "number"
        ? new Date(captureDateString).getTime()
        : undefined;
    const camera = [tags.Make, tags.Model]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
      .filter((value, index, values) => index === 0 || value !== values[index - 1])
      .join(" ");
    const exposure = typeof tags.ExposureTime === "number"
      ? `${tags.ExposureTime >= 1 ? tags.ExposureTime.toFixed(1) : `1/${Math.round(1 / tags.ExposureTime)}`} s`
      : undefined;
    return {
      ...(Number.isFinite(capturedAt) ? { capturedAt } : {}),
      ...(camera ? { camera } : {}),
      ...(typeof tags.LensModel === "string" ? { lens: tags.LensModel } : {}),
      ...(exposure ? { exposure } : {}),
      ...(typeof tags.ISO === "number" ? { iso: tags.ISO } : {}),
      ...(typeof tags.latitude === "number" ? { latitude: tags.latitude } : {}),
      ...(typeof tags.longitude === "number" ? { longitude: tags.longitude } : {}),
    };
  } catch (error) {
    return {
      metadataError: error instanceof Error ? error.message : "Could not read image metadata.",
    };
  }
}

export async function createMediaItems(files: FileList | File[]): Promise<MediaItem[]> {
  const unique = new Map<string, File>();
  for (const file of Array.from(files)) {
    if (!file.name || file.name.startsWith(".")) continue;
    const extension = extensionOf(file.name);
    const kind: MediaKind = videoExtensions.has(extension)
      ? "video"
      : rawExtensions.has(extension)
        ? "raw"
        : imageExtensions.has(extension)
          ? "photo"
          : "unsupported";
    if (kind === "unsupported") continue;

    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const identity = `${relativePath}:${file.size}:${file.lastModified}`;
    if (!unique.has(identity)) unique.set(identity, file);
  }

  const filesToRead = Array.from(unique.values());
  const items: MediaItem[] = [];
  for (let start = 0; start < filesToRead.length; start += 32) {
    const batch = await Promise.all(
      filesToRead.slice(start, start + 32).map(async (file): Promise<MediaItem> => {
      const extension = extensionOf(file.name);
      let kind: MediaKind = videoExtensions.has(extension)
        ? "video"
        : rawExtensions.has(extension)
          ? "raw"
          : "photo";
      const dimensions = await readDimensions(file, kind);
      if (kind === "photo" && (!dimensions.width || !dimensions.height)) kind = "unsupported";
      const metadata = kind === "photo" || kind === "unsupported" || kind === "raw"
        ? await readExif(file)
        : {};
      return {
        id: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        extension,
        kind,
        modifiedAt: file.lastModified,
        ...dimensions,
        ...metadata,
        favorite: false,
        hidden: false,
        tags: [],
      };
      }),
    );
    items.push(...batch);
  }
  return items.sort((left, right) => right.modifiedAt - left.modifiedAt || left.name.localeCompare(right.name));
}

export async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure hashing is unavailable in this browser context.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDimensions(item: MediaItem): string {
  return item.width && item.height ? `${item.width.toLocaleString()} × ${item.height.toLocaleString()}` : "Unavailable";
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(timestamp);
}
