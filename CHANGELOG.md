# Changelog

All notable changes to Stillroom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Details and Timeline library views, including sortable details columns and timeline group selection
- Sources manager actions for filtering, rescanning, revealing, and removing indexed folders

### Changed
- Refined the top bar, compact navigation, source controls, and destructive settings section
- Updated README and release notes to reflect the current views and browser preview limitations
- Built the browser harness as a second Vite entry so it also works with `npm run preview`
- Improved Viewer navigation and filmstrip behavior, with media fit respecting image aspect ratios
- Refreshed the app and in-app brand marks; added native macOS and Windows icon bundle assets

### Fixed
- Slideshow video playback now advances on the video's ended event and follows play/pause state
- Inspector toggle uses the inspector icon and remains available in narrow windows
- Hidden item details stay concealed in the inspector until the preview is revealed
- Removed unused panel imports, props, CSS rules, and frontend dependencies

## [0.1.0] — 2026-10-19

### Added
- Browser prototype: React 18 + TypeScript + Vite frontend
- Library grid (Grid / Filmstrip / Overview layouts), smart filters, search
- Viewer with navigation, zoom, full-screen
- Non-destructive edit pipeline with export
- Duplicate detection (SHA-256)
- Batch tools, slideshow, dark/light/system theme
- Tauri 2 + Rust backend scaffold with SQLite catalog, EXIF metadata commands, vault commands
