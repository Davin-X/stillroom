# Stillroom

A fast, local-first photo & video gallery for macOS — React, TypeScript, Vite, Tauri 2 (Rust).

![Stillroom icon](src-tauri/icons/icon.png)

> **Status:** Beta · `v0.1.0` · Local-first · macOS 13+ · MIT

## What Stillroom is

Stillroom is your private photo library — on your Mac, under your control. It scans folders you choose, builds a local SQLite catalog, reads/writes EXIF metadata, lets you non-destructively edit and export, finds duplicates by SHA-256, and keeps sensitive items in a password-protected Vault.

Nothing is uploaded. Nothing phones home. Your photos stay on your disk.

| Layer | What it does |
|-------|--------------|
| **Frontend** (`src/`) | React 18 + TypeScript + Vite UI |
| **Backend** (`src-tauri/`) | Tauri 2 + Rust + SQLite (`sqlx`) |
| **Bridge** | Typed Tauri invoke layer |

## Features

- **Library grid** — 3 layouts (Grid, Filmstrip, Overview), virtualized
- **Smart filters** — All / Photos / Videos / RAW / Favorites / Hidden
- **Search** — by filename, folder path, camera model, tags
- **Viewer** — arrow-key nav, zoom, full-screen, video playback
- **Non-destructive edits** — exposure, contrast, warmth, rotation, flip; export JPEG/PNG/HEIC/AVIF
- **Duplicate detection** — SHA-256 scanner
- **Batch tools** — rename, export, convert, strip metadata
- **Slideshow** — timed, looping
- **Vault** — password-protected items (planned: Touch ID / Secure Enclave)
- **Dark / Light / System** appearance
- **Finder tags** read/write

## Quick start

### Browser prototype (no Rust needed)

```sh
git clone https://github.com/Davin-X/stillroom.git
cd stillroom
npm install
npm run dev        # http://localhost:1420
npm run build      # dist/
npm run preview    # serve locally
```

### Native macOS desktop app

Requires Node.js, Rust toolchain, Tauri CLI.

```sh
npm install
npm run tauri dev     # desktop app
npm run tauri build   # .app bundle (macOS)
```

> Targets macOS 13+. Universal (Apple Silicon + Intel) builds supported.

## Project structure

```
stillroom/
├── src/              # React/Vite frontend
├── src-tauri/        # Tauri 2 + Rust backend
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.js
└── README.md
```

## Roadmap

| Phase | Focus | Target |
|-------|-------|--------|
| 1 — Foundation | SQLite catalog, folder scanning, EXIF read/write, Tauri bridge | v0.2 |
| 2 — Core Gallery | Virtualized grid (10k+ items), albums/tags, keyboard nav, theme sync | v0.3 |
| 3 — Viewer & Edit | Image viewer, video playback, Core Image edits, RAW preview, export | v0.4 |
| 4 — Advanced | Batch export, duplicate scanner, folder watching, Finder tags, Trash | v0.5 |
| 5 — Vault & Polish | Touch ID vault, auto-lock, menu bar, Dock menu, notarization | v1.0 |

See [`DESIGN_ANALYSIS.md`](./DESIGN_ANALYSIS.md) and [`DESIGN_IMPROVEMENTS.md`](./DESIGN_IMPROVEMENTS.md).

## Contributing

Stillroom uses **pull requests only** — `main` is protected and requires at least one approving review.

1. Fork, create branch: `git checkout -b feature/your-feature`
2. Run `npx tsc --noEmit` to verify
3. Commit: `feat:`, `fix:`, `chore:`, `docs:`
4. Open a PR against `main`

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

## Security

Local-first, no network requests by design. Disclose responsibly.

See [`SECURITY.md`](./SECURITY.md).

## License

MIT License. See [`LICENSE`](./LICENSE).

---

**Stillroom** — your photos, your Mac, your terms.
