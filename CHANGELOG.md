# Changelog

All notable changes to Stillroom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Modern sunset-flat app icon suite (16×16 → 1024×1024, squircle mask, anti-aliased)
- `BrandMark` SVG component matching the app icon
- Shared icon contract in `src/design/components/icons.tsx` (24×24 viewBox, `currentColor`)
- Tauri menu bar definition (`src-tauri/src/menu.rs`)
- This documentation suite (README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, issue/PR templates)

### Changed
- Renamed GitHub repository from `mac-gallery` to `stillroom` (product name alignment)
- `main` branch protected: 1 approving review required, stale reviews dismissed, force-push/delete blocked
- README rewritten for product release (features, quick start, architecture, roadmap)

### Fixed
- Inspector toggle previously used `ShareIcon` (semantically wrong); planned swap to `DetailsIcon`

## [0.1.0] — 2026-10-19

### Added
- Browser prototype: React 18 + TypeScript + Vite frontend
- Library grid (Grid / Filmstrip / Overview layouts), smart filters, search
- Viewer with navigation, zoom, full-screen
- Non-destructive edit pipeline with export
- Duplicate detection (SHA-256)
- Batch tools, slideshow, dark/light/system theme
- Tauri 2 + Rust backend scaffold with SQLite catalog, EXIF metadata commands, vault commands
- DESIGN_ANALYSIS.md and DESIGN_IMPROVEMENTS.md specifications
