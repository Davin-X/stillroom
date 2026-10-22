export interface AppSettings {
  // General
  appearance: "light" | "dark" | "system";
  accentColor: "blue" | "purple" | "green" | "orange" | "pink" | "red";
  sidebarWidth: number;
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
  slideshowInterval: number;
  slideshowShuffle: boolean;
  slideshowLoop: boolean;
  videoAutoPlay: boolean;
  videoLoop: boolean;

  // Library
  watchFolders: string[];
  autoImport: boolean;
  pairRawJpeg: boolean;
  stackBursts: boolean;
  stackLivePhotos: boolean;

  // Privacy & Security
  stripGpsOnExport: boolean;
  stripAllMetadataOnExport: boolean;
  allowNetworkRequests: boolean;
  sendCrashReports: boolean;

  // Advanced
  maxCacheSizeGB: number;
  thumbnailQuality: number;
  enableDebugLogging: boolean;
  showNativeLimitWarnings: boolean;
}

export const defaultSettings: AppSettings = {
  appearance: "system",
  accentColor: "blue",
  sidebarWidth: 220,
  showExtensions: false,
  animateTransitions: true,
  startupView: "library",
  openLastFolder: true,
  restoreWindowState: true,
  defaultLayout: "grid",
  thumbnailSize: "medium",
  viewerZoomBehavior: "fit",
  slideshowInterval: 5,
  slideshowShuffle: false,
  slideshowLoop: true,
  videoAutoPlay: true,
  videoLoop: false,
  watchFolders: [],
  autoImport: false,
  pairRawJpeg: true,
  stackBursts: true,
  stackLivePhotos: true,
  stripGpsOnExport: true,
  stripAllMetadataOnExport: false,
  allowNetworkRequests: false,
  sendCrashReports: false,
  maxCacheSizeGB: 5,
  thumbnailQuality: 80,
  enableDebugLogging: false,
  showNativeLimitWarnings: true,
};