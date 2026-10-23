use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{State, Manager, Emitter, Window};
use crate::{AppState, Database, models::*};
use anyhow::Result;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use uuid::Uuid;
use time::OffsetDateTime;
use sqlx::{SqlitePool, Sqlite, QueryBuilder, Row};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::codecs::webp::WebPEncoder;
use image::{DynamicImage, GenericImageView, ImageEncoder};
use walkdir::WalkDir;

// ===== Request/Response Types =====
//
// Every struct that crosses the IPC boundary is annotated `rename_all =
// "camelCase"`, so Rust's snake_case fields line up with the TypeScript
// interfaces in src/engine/types. Commands take plain (flattened) arguments
// rather than a wrapper struct, because that is what the flat camelCase
// payloads in src/engine/commands/tauri.ts send.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub items: Vec<MediaItem>,
    pub albums: Vec<Album>,
    pub tags: Vec<Tag>,
    pub sessions: Vec<ImportSession>,
    pub total_size: i64,
    pub duration: i64,
}

/// A folder in the library, either explicitly imported or inferred from the
/// on-disk location of items added before folder tracking existed.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub path: String,
    pub name: String,
    pub item_count: i64,
    pub total_size: i64,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFilterDTO {
    pub kind: Option<String>,
    pub favorite: Option<bool>,
    pub hidden: Option<bool>,
    pub album_id: Option<String>,
    pub query: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifData {
    pub captured_at: Option<i64>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub exposure: Option<String>,
    pub iso: Option<i32>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub metadata_error: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PartialExifData {
    pub captured_at: Option<i64>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub exposure: Option<String>,
    pub iso: Option<i32>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub source_path: String,
    pub edits: EditValues,
    pub output_format: String,
    pub quality: f32,
    pub strip_metadata: bool,
    pub crop: Option<CropRect>,
}

#[derive(Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct EditValues {
    pub exposure: i32,
    pub contrast: i32,
    pub warmth: i32,
    pub shadows: i32,
    pub highlights: i32,
    pub saturation: i32,
    pub rotation: i32,
    pub flip: bool,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub size: i64,
    pub width: i32,
    pub height: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportRequest {
    pub items: Vec<BatchExportItem>,
    pub output_folder: String,
    pub pattern: String,
    pub format: String,
    pub quality: f32,
    pub strip_metadata: bool,
    pub max_dimension: Option<u32>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportItem {
    pub id: String,
    pub source_path: String,
    pub index: u32,
    /// `photo`, `video`, or `raw`. Optional so older callers still work.
    #[serde(default)]
    pub kind: Option<String>,
    /// Capture/modification time in milliseconds, used by the `{date}` token.
    #[serde(default)]
    pub date: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportProgress {
    pub current: u32,
    pub total: u32,
    pub current_file: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportResult {
    pub exported: u32,
    pub failed: Vec<BatchExportError>,
    pub outputs: Vec<String>,
    pub cancelled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportError {
    pub item_id: String,
    pub error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: String,
    pub sha256: String,
    pub size: i64,
    pub items: Vec<MediaItem>,
}

#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PartialSettings {
    pub appearance: Option<String>,
    pub accent_color: Option<String>,
    pub sidebar_width: Option<i32>,
    pub show_extensions: Option<bool>,
    pub animate_transitions: Option<bool>,
    pub startup_view: Option<String>,
    pub open_last_folder: Option<bool>,
    pub restore_window_state: Option<bool>,
    pub default_layout: Option<String>,
    pub thumbnail_size: Option<String>,
    pub viewer_zoom_behavior: Option<String>,
    pub slideshow_interval: Option<i32>,
    pub slideshow_shuffle: Option<bool>,
    pub slideshow_loop: Option<bool>,
    pub video_auto_play: Option<bool>,
    pub video_loop: Option<bool>,
    pub watch_folders: Option<Vec<String>>,
    pub auto_import: Option<bool>,
    pub pair_raw_jpeg: Option<bool>,
    pub stack_bursts: Option<bool>,
    pub stack_live_photos: Option<bool>,
    pub strip_gps_on_export: Option<bool>,
    pub strip_all_metadata_on_export: Option<bool>,
    pub allow_network_requests: Option<bool>,
    pub send_crash_reports: Option<bool>,
    pub max_cache_size_gb: Option<i32>,
    pub thumbnail_quality: Option<i32>,
    pub enable_debug_logging: Option<bool>,
    pub show_native_limit_warnings: Option<bool>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub appearance: String,
    pub accent_color: String,
    pub sidebar_width: i32,
    pub show_extensions: bool,
    pub animate_transitions: bool,
    pub startup_view: String,
    pub open_last_folder: bool,
    pub restore_window_state: bool,
    pub default_layout: String,
    pub thumbnail_size: String,
    pub viewer_zoom_behavior: String,
    pub slideshow_interval: i32,
    pub slideshow_shuffle: bool,
    pub slideshow_loop: bool,
    pub video_auto_play: bool,
    pub video_loop: bool,
    pub watch_folders: Vec<String>,
    pub auto_import: bool,
    pub pair_raw_jpeg: bool,
    pub stack_bursts: bool,
    pub stack_live_photos: bool,
    pub strip_gps_on_export: bool,
    pub strip_all_metadata_on_export: bool,
    pub allow_network_requests: bool,
    pub send_crash_reports: bool,
    pub max_cache_size_gb: i32,
    pub thumbnail_quality: i32,
    pub enable_debug_logging: bool,
    pub show_native_limit_warnings: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: "system".to_string(),
            accent_color: "blue".to_string(),
            sidebar_width: 220,
            show_extensions: false,
            animate_transitions: true,
            startup_view: "library".to_string(),
            open_last_folder: true,
            restore_window_state: true,
            default_layout: "grid".to_string(),
            thumbnail_size: "medium".to_string(),
            viewer_zoom_behavior: "fit".to_string(),
            slideshow_interval: 5,
            slideshow_shuffle: false,
            slideshow_loop: true,
            video_auto_play: true,
            video_loop: false,
            watch_folders: vec![],
            auto_import: false,
            pair_raw_jpeg: true,
            stack_bursts: true,
            stack_live_photos: true,
            strip_gps_on_export: true,
            strip_all_metadata_on_export: false,
            allow_network_requests: false,
            send_crash_reports: false,
            max_cache_size_gb: 5,
            thumbnail_quality: 80,
            enable_debug_logging: false,
            show_native_limit_warnings: true,
        }
    }
}

// ===== Helper Functions =====

/// Album rows with their item count folded in, so `Album.item_count` is always a
/// real column on the result set.
const ALBUM_SELECT: &str = "SELECT a.id, a.name, a.color_index, a.created_at, a.updated_at, \
     (SELECT COUNT(*) FROM album_items ai JOIN media_items m ON m.id = ai.media_id \
      WHERE ai.album_id = a.id AND m.hidden = 0) AS item_count FROM albums a";

/// Tag rows with their item count folded in, mirroring [`ALBUM_SELECT`].
const TAG_SELECT: &str = "SELECT t.id, t.name, t.color_index, t.created_at, \
     (SELECT COUNT(*) FROM media_tags mt JOIN media_items m ON m.id = mt.media_id \
      WHERE mt.tag_id = t.id AND m.hidden = 0) AS item_count FROM tags t";

fn get_db(state: &State<'_, AppState>) -> Result<SqlitePool, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().ok_or("Database not initialized".to_string())?.pool().clone())
}

fn now_ms() -> i64 {
    (OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as i64
}

/// Normalize a folder path so comparisons do not depend on a trailing slash.
fn normalize_root(path: &str) -> String {
    if path.len() > 1 {
        path.trim_end_matches('/').to_string()
    } else {
        path.to_string()
    }
}

/// True when `path` sits inside `root`. Uses a real directory-boundary check so
/// `/Photos2/a.jpg` is never counted as part of `/Photos`.
fn path_is_inside(path: &str, root: &str) -> bool {
    let file = normalize_root(path);
    let root = normalize_root(root);
    if root == "/" {
        return file.starts_with('/');
    }
    file.len() > root.len() && file.starts_with(&root) && file.as_bytes()[root.len()] == b'/'
}

/// Record an imported folder so the sidebar can list and remove it later.
/// Failures are non-fatal: a catalog write should never fail an import.
async fn remember_folder(db: &SqlitePool, root: &str) {
    let path = normalize_root(root);
    if path.is_empty() || !Path::new(&path).is_dir() {
        return;
    }
    let _ = sqlx::query("INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?, ?)")
        .bind(&path)
        .bind(now_ms())
        .execute(db)
        .await;
}

fn is_media_file(ext: &str) -> bool {
    let image_exts = ["avif", "bmp", "gif", "heic", "heif", "jfif", "jpe", "jpeg", "jpg", "jxl", "png", "tif", "tiff", "webp"];
    let raw_exts = ["3fr", "ari", "arw", "bay", "cap", "cr2", "cr3", "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef", "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "x3f"];
    let video_exts = ["m4v", "mov", "mp4", "mpeg", "mpg", "webm"];
    image_exts.contains(&ext) || raw_exts.contains(&ext) || video_exts.contains(&ext)
}

fn kind_for_ext(ext: &str) -> &'static str {
    let video_exts = ["m4v", "mov", "mp4", "mpeg", "mpg", "webm"];
    let raw_exts = ["3fr", "ari", "arw", "bay", "cap", "cr2", "cr3", "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef", "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "x3f"];
    if video_exts.contains(&ext) { "video" }
    else if raw_exts.contains(&ext) { "raw" }
    else { "photo" }
}

/// Add one file to the catalog and return it with its on-disk size.
///
/// Folder scans and direct file imports share this so both paths keep the same
/// stable id and the same conflict rules (favorite/hidden state wins over a
/// refreshed file fact).
async fn import_media_file(
    db: &SqlitePool,
    path: &Path,
    now: i64,
) -> Result<Option<(MediaItem, i64)>, String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !is_media_file(&ext) {
        return Ok(None);
    }

    let metadata = match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => return Ok(None),
    };

    let size = metadata.len() as i64;
    let modified_at = metadata
        .modified()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
        .unwrap_or(0);

    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let kind = kind_for_ext(&ext).to_string();

    // Read dimensions from the file header only; no full decode.
    let (width, height) = if kind == "photo" {
        match image::image_dimensions(path) {
            Ok((w, h)) => (Some(w as i32), Some(h as i32)),
            Err(_) => (None, None),
        }
    } else {
        (None, None)
    };

    let item = MediaItem::new(
        path.to_string_lossy().to_string(),
        name,
        ext,
        kind,
        size,
        modified_at,
    );

    // Upsert on the stable id. `favorite` and `hidden` are left out of the
    // UPDATE clause so a re-import refreshes file facts without discarding the
    // user's own state.
    sqlx::query(
        r#"INSERT INTO media_items
           (id, path, name, extension, kind, size, modified_at, captured_at,
            width, height, created_at, updated_at, favorite, hidden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
           ON CONFLICT(id) DO UPDATE SET
               path = excluded.path,
               name = excluded.name,
               extension = excluded.extension,
               kind = excluded.kind,
               size = excluded.size,
               modified_at = excluded.modified_at,
               width = excluded.width,
               height = excluded.height,
               updated_at = excluded.updated_at"#,
    )
    .bind(&item.id)
    .bind(&item.path)
    .bind(&item.name)
    .bind(&item.extension)
    .bind(&item.kind)
    .bind(item.size)
    .bind(item.modified_at)
    .bind(item.captured_at)
    .bind(width)
    .bind(height)
    .bind(now)
    .bind(now)
    .execute(db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Some((item, size)))
}

// ===== Commands =====

#[tauri::command]
pub async fn scan_library(
    root_path: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<ScanResult, String> {
    let root = PathBuf::from(&root_path);
    let start = std::time::Instant::now();
    let mut items = Vec::new();
    let mut total_size: i64 = 0;
    let mut processed: u64 = 0;

    // Get database connection
    let db = get_db(&state)?;
    let now = now_ms();

    // First pass: count total media files so we can report a total.
    let total: u64 = WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            let ext = e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase();
            is_media_file(&ext)
        })
        .count() as u64;

    // Second pass: import each file, emitting progress along the way.
    for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        if let Some((item, size)) = import_media_file(&db, entry.path(), now).await? {
            total_size += size;
            items.push(item);
        }

        processed += 1;
        // Emit progress every 200 files or on the last file to avoid
        // overwhelming the IPC channel while still keeping the UI responsive.
        if processed % 200 == 0 || processed == total {
            let _ = window.emit(
                "import-progress",
                json!({
                    "phase": "scanning",
                    "processed": processed,
                    "total": total,
                    "currentFile": entry.path().to_string_lossy().to_string(),
                }),
            );
            // Yield to the Tauri event loop so progress events are delivered
            // and the frontend stays responsive.
            tokio::task::yield_now().await;
        }
    }

    // Sort by modified date desc
    items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    // Only remember the folder once it actually contributed media, so an
    // accidental pick of an empty folder never shows up in the sidebar.
    if !items.is_empty() {
        remember_folder(&db, &root_path).await;
    }

    let duration = start.elapsed().as_millis() as i64;

    hydrate_relations(&db, &mut items).await?;

    // Hand back the albums and tags so the sidebar is populated from the same
    // call that imports, instead of staying empty until a separate round-trip.
    let albums = sqlx::query_as::<_, Album>(&format!("{} ORDER BY a.created_at ASC", ALBUM_SELECT))
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;
    let tags = sqlx::query_as::<_, Tag>(&format!("{} ORDER BY t.name ASC", TAG_SELECT))
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ScanResult {
        items,
        albums,
        tags,
        sessions: vec![],
        total_size,
        duration,
    })
}

/// Import exactly the files the user picked.
///
/// Unlike `scan_library`, a selected file is never expanded to its parent
/// folder: picking one photo must not sweep in every neighbour on disk.
/// Selected folders are still walked recursively.
#[tauri::command]
pub async fn import_files(
    paths: Vec<String>,
    state: State<'_, AppState>,
    window: Window,
) -> Result<ScanResult, String> {
    let start = std::time::Instant::now();
    let db = get_db(&state)?;
    let now = now_ms();
    let mut items = Vec::new();
    let mut total_size: i64 = 0;
    let mut processed: u64 = 0;

    // Collect all media file paths first so we can report a total.
    let all_paths: Vec<PathBuf> = {
        let mut tmp = Vec::new();
        for raw in &paths {
            let path = PathBuf::from(raw);
            if path.is_dir() {
                for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_type().is_file() {
                        if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                            let ext = ext.to_lowercase();
                            if is_media_file(&ext) {
                                tmp.push(entry.path().to_path_buf());
                            }
                        }
                    }
                }
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext = ext.to_lowercase();
                    if is_media_file(&ext) {
                        tmp.push(path.clone());
                    }
                }
            }
        }
        tmp
    };
    let total = all_paths.len() as u64;

    for path in all_paths {
        if let Some((item, size)) = import_media_file(&db, &path, now).await? {
            total_size += size;
            items.push(item);
        }

        processed += 1;
        if processed % 200 == 0 || processed == total {
            let _ = window.emit(
                "import-progress",
                json!({
                    "phase": "scanning",
                    "processed": processed,
                    "total": total,
                    "currentFile": path.to_string_lossy().to_string(),
                }),
            );
            tokio::task::yield_now().await;
        }
    }

    items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    // Remember any folders the user picked wholesale, so they can be removed
    // from the library in one step later. Individual files are grouped by
    // their parent directory when the folder list is built.
    if !items.is_empty() {
        for raw in &paths {
            if Path::new(raw).is_dir() {
                remember_folder(&db, raw).await;
            }
        }
    }

    hydrate_relations(&db, &mut items).await?;

    let albums = sqlx::query_as::<_, Album>(&format!("{} ORDER BY a.created_at ASC", ALBUM_SELECT))
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;
    let tags = sqlx::query_as::<_, Tag>(&format!("{} ORDER BY t.name ASC", TAG_SELECT))
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ScanResult {
        items,
        albums,
        tags,
        sessions: vec![],
        total_size,
        duration: start.elapsed().as_millis() as i64,
    })
}

#[tauri::command]
pub async fn get_library_items(filter: Option<LibraryFilterDTO>, state: State<'_, AppState>) -> Result<Vec<MediaItem>, String> {
    let db = get_db(&state)?;
    let f = filter.unwrap_or_default();

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("SELECT * FROM media_items WHERE 1=1");

    if let Some(kind) = &f.kind {
        qb.push(" AND kind = ").push_bind(kind.clone());
    }
    if let Some(favorite) = f.favorite {
        qb.push(" AND favorite = ").push_bind(if favorite { 1i32 } else { 0i32 });
    }
    if let Some(hidden) = f.hidden {
        qb.push(" AND hidden = ").push_bind(if hidden { 1i32 } else { 0i32 });
    }
    if let Some(album_id) = &f.album_id {
        qb.push(" AND id IN (SELECT media_id FROM album_items WHERE album_id = ")
            .push_bind(album_id.clone())
            .push(")");
    }
    if let Some(query) = &f.query {
        let like = format!("%{}%", query);
        qb.push(" AND (name LIKE ").push_bind(like.clone())
            .push(" OR path LIKE ").push_bind(like).push(")");
    }
    if let Some(from) = f.date_from {
        qb.push(" AND COALESCE(captured_at, modified_at) >= ").push_bind(from);
    }
    if let Some(to) = f.date_to {
        qb.push(" AND COALESCE(captured_at, modified_at) <= ").push_bind(to);
    }

    // Identifiers cannot be bound, so the sort column is whitelisted instead of
    // interpolated straight from the caller.
    let sort_column = match f.sort_by.as_deref() {
        Some("capturedAt") => "COALESCE(captured_at, modified_at)",
        Some("name") => "name",
        Some("size") => "size",
        _ => "modified_at",
    };
    let sort_order = match f.sort_order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };
    qb.push(format!(" ORDER BY {} {}", sort_column, sort_order));

    if let Some(limit) = f.limit {
        qb.push(" LIMIT ").push_bind(limit as i64);
    }
    if let Some(offset) = f.offset {
        qb.push(" OFFSET ").push_bind(offset as i64);
    }

    let mut items = qb
        .build_query_as::<MediaItem>()
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    hydrate_relations(&db, &mut items).await?;
    Ok(items)
}

/// Attach tags and album ids to a page of items using two batch queries rather
/// than one query per item.
async fn hydrate_relations(db: &SqlitePool, items: &mut [MediaItem]) -> Result<(), String> {
    if items.is_empty() {
        return Ok(());
    }

    let tag_rows = sqlx::query_as::<_, (String, String)>(
        "SELECT mt.media_id, t.name FROM media_tags mt JOIN tags t ON t.id = mt.tag_id",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let album_rows = sqlx::query_as::<_, (String, String)>(
        "SELECT media_id, album_id FROM album_items",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let mut tags_by_item: HashMap<String, Vec<String>> = HashMap::new();
    for (media_id, name) in tag_rows {
        tags_by_item.entry(media_id).or_default().push(name);
    }
    let mut albums_by_item: HashMap<String, Vec<String>> = HashMap::new();
    for (media_id, album_id) in album_rows {
        albums_by_item.entry(media_id).or_default().push(album_id);
    }

    for item in items.iter_mut() {
        item.tags = tags_by_item.remove(&item.id).unwrap_or_default();
        item.album_ids = albums_by_item.remove(&item.id).unwrap_or_default();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_item_thumbnail(request: serde_json::Value, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let _ = (request, state);
    Err("Not implemented".to_string())
}

#[tauri::command]
pub async fn watch_folder(path: String, state: State<'_, AppState>) -> Result<(), String> { let _ = (path, state); Ok(()) }

#[tauri::command]
pub async fn unwatch_folder(path: String, state: State<'_, AppState>) -> Result<(), String> { let _ = (path, state); Ok(()) }

/// Group a path that was imported before folder tracking existed.
///
/// Files under the home directory collapse to their first folder
/// (`~/Pictures/2024/01/a.jpg` → `~/Pictures`); anything else collapses to the
/// volume and first component (`/Applications/Safari.app/...` →
/// `/Applications/Safari.app`). This keeps the sidebar to a handful of rows
/// instead of one row per leaf directory.
fn inferred_folder_root(path: &str) -> Option<String> {
    let home = std::env::var("HOME").ok().map(|h| normalize_root(&h))?;
    let file = normalize_root(path);

    if path_is_inside(&file, &home) {
        let rest = &file[home.len() + 1..];
        let first = rest.split('/').find(|part| !part.is_empty())?;
        return Some(format!("{}/{}", home, first));
    }

    let parts: Vec<&str> = file.split('/').filter(|part| !part.is_empty()).collect();
    if parts.is_empty() {
        return None;
    }
    let take = parts.len().min(2);
    Some(format!("/{}", parts[..take].join("/")))
}

/// List the folders the library is made of.
///
/// Explicitly imported folders come from `library_folders`. Items imported
/// before folder tracking existed are folded into [`inferred_folder_root`]
/// buckets, and each item is counted exactly once under the most specific
/// folder that contains it.
#[tauri::command]
pub async fn get_library_folders(state: State<'_, AppState>) -> Result<Vec<LibraryFolder>, String> {
    let db = get_db(&state)?;

    let registered: Vec<String> = sqlx::query_scalar("SELECT path FROM library_folders ORDER BY path ASC")
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    let rows = sqlx::query("SELECT path, size FROM media_items WHERE hidden = 0")
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    // One pass over the catalog: each item lands in exactly one folder.
    let mut tallies: HashMap<String, (i64, i64)> = HashMap::new();
    for row in &rows {
        let item_path: String = row.get("path");
        let size: i64 = row.get("size");

        let owner = registered
            .iter()
            .filter(|root| path_is_inside(&item_path, root))
            .max_by_key(|root| root.len())
            .cloned()
            .or_else(|| inferred_folder_root(&item_path));

        if let Some(folder) = owner {
            let tally = tallies.entry(folder).or_insert((0, 0));
            tally.0 += 1;
            tally.1 += size;
        }
    }

    let mut folders: Vec<LibraryFolder> = tallies
        .into_iter()
        .map(|(path, (item_count, total_size))| {
            let name = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| path.clone());
            LibraryFolder { path, name, item_count, total_size }
        })
        .collect();

    // Keep explicitly imported folders visible even when they are empty, so a
    // stale entry can still be removed.
    for root in &registered {
        if !folders.iter().any(|folder| &folder.path == root) {
            let name = Path::new(root)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| root.clone());
            folders.push(LibraryFolder {
                path: root.clone(),
                name,
                item_count: 0,
                total_size: 0,
            });
        }
    }

    folders.sort_by(|a, b| {
        b.item_count
            .cmp(&a.item_count)
            .then_with(|| a.path.to_lowercase().cmp(&b.path.to_lowercase()))
    });
    Ok(folders)
}

/// Remove a folder from Stillroom.
///
/// The files stay on disk by default: this only drops the folder's rows from
/// the catalog. Pass `delete_files = true` to move the originals to the macOS
/// Trash instead (used by the "also delete files" confirmation).
#[tauri::command]
pub async fn remove_library_folder(
    path: String,
    delete_files: Option<bool>,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = get_db(&state)?;
    let root = normalize_root(&path);
    if root.is_empty() {
        return Err("Refusing to remove an empty folder path".to_string());
    }

    let rows = sqlx::query("SELECT id, path FROM media_items")
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    let targets: Vec<(String, String)> = rows
        .iter()
        .filter_map(|row| {
            let item_path: String = row.get("path");
            if path_is_inside(&item_path, &root) {
                Some((row.get::<String, _>("id"), item_path))
            } else {
                None
            }
        })
        .collect();

    if delete_files.unwrap_or(false) {
        for (_, item_path) in &targets {
            trash::delete(item_path)
                .map_err(|e| format!("Could not move {} to Trash: {}", item_path, e))?;
        }
    }

    // Clean up join rows explicitly instead of relying on foreign-key cascades
    // being enabled on this particular pooled connection.
    for (id, _) in &targets {
        for statement in [
            "DELETE FROM media_tags WHERE media_id = ?",
            "DELETE FROM album_items WHERE media_id = ?",
            "DELETE FROM media_items WHERE id = ?",
        ] {
            sqlx::query(statement)
                .bind(id)
                .execute(&db)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    // Forget the folder itself, plus any registered subfolder that lived
    // inside it, so a later import is not shadowed by stale entries.
    let registered: Vec<String> = sqlx::query_scalar("SELECT path FROM library_folders")
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;
    for registered_path in registered {
        if normalize_root(&registered_path) == root || path_is_inside(&registered_path, &root) {
            sqlx::query("DELETE FROM library_folders WHERE path = ?")
                .bind(&registered_path)
                .execute(&db)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(targets.len() as i64)
}

#[tauri::command]
pub async fn toggle_favorite(item_id: String, favorite: bool, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    sqlx::query("UPDATE media_items SET favorite = ?, updated_at = ? WHERE id = ?")
        .bind(if favorite { 1i32 } else { 0i32 })
        .bind(now_ms())
        .bind(&item_id)
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_hidden(item_id: String, hidden: bool, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    sqlx::query("UPDATE media_items SET hidden = ?, updated_at = ? WHERE id = ?")
        .bind(if hidden { 1i32 } else { 0i32 })
        .bind(now_ms())
        .bind(&item_id)
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_item_tags(item_id: String, tags: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    sqlx::query("DELETE FROM media_tags WHERE media_id = ?")
        .bind(&item_id)
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    for tag_name in &tags {
        let tag_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT OR IGNORE INTO tags (id, name, color_index, created_at) VALUES (?, ?, 0, ?)")
            .bind(&tag_id)
            .bind(tag_name)
            .bind(now_ms())
            .execute(&db)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)")
            .bind(&item_id)
            .bind(&tag_id)
            .execute(&db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn move_to_trash(paths: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    for path in &paths {
        // Move the original to the macOS Trash so it stays recoverable, then
        // drop it from the catalog. Failures are surfaced rather than swallowed.
        trash::delete(path).map_err(|e| format!("Could not move {} to Trash: {}", path, e))?;

        sqlx::query("DELETE FROM media_items WHERE path = ?")
            .bind(path)
            .execute(&db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reveal_in_finder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let _ = state;
    // `open -R` selects the file in a new Finder window.
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|e| format!("Could not reveal {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    // Unlike `open -R` (which selects a file in its parent), this opens the
    // folder itself in Finder. Used by Batch export results.
    std::process::Command::new("open")
        .arg(&path)
        .status()
        .map_err(|e| format!("Could not open {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_albums(state: State<'_, AppState>) -> Result<Vec<Album>, String> {
    let db = get_db(&state)?;
    let albums = sqlx::query_as::<_, Album>(&format!("{} ORDER BY a.created_at ASC", ALBUM_SELECT))
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(albums)
}

#[tauri::command]
pub async fn get_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    let db = get_db(&state)?;
    let tags = sqlx::query_as::<_, Tag>(&format!("{} ORDER BY t.name ASC", TAG_SELECT))
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(tags)
}

#[tauri::command]
pub async fn create_album(name: String, color_index: Option<i32>, state: State<'_, AppState>) -> Result<Album, String> {
    let db = get_db(&state)?;
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Album name cannot be empty".to_string());
    }
    let album = Album::new(name, color_index.unwrap_or(0));
    sqlx::query("INSERT INTO albums (id, name, color_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&album.id)
        .bind(&album.name)
        .bind(album.color_index)
        .bind(album.created_at)
        .bind(album.updated_at)
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(album)
}

#[tauri::command]
pub async fn delete_album(album_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    sqlx::query("DELETE FROM albums WHERE id = ?")
        .bind(&album_id)
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_album(album_id: String, name: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    sqlx::query("UPDATE albums SET name = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(now_ms())
        .bind(&album_id)
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn add_to_album(album_id: String, item_ids: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    for item_id in &item_ids {
        sqlx::query("INSERT OR IGNORE INTO album_items (album_id, media_id, added_at) VALUES (?, ?, ?)")
            .bind(&album_id)
            .bind(item_id)
            .bind(now_ms())
            .execute(&db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_from_album(album_id: String, item_ids: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    for item_id in &item_ids {
        sqlx::query("DELETE FROM album_items WHERE album_id = ? AND media_id = ?")
            .bind(&album_id)
            .bind(item_id)
            .execute(&db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn read_exif(path: String, state: State<'_, AppState>) -> Result<ExifData, String> {
    // TODO: Use kamadak-exif crate
    let _ = (path, state);
    Ok(ExifData {
        captured_at: None,
        camera: None,
        lens: None,
        exposure: None,
        iso: None,
        latitude: None,
        longitude: None,
        width: None,
        height: None,
        metadata_error: None,
    })
}

#[tauri::command]
pub async fn write_exif(path: String, data: PartialExifData, state: State<'_, AppState>) -> Result<(), String> {
    let _ = (path, data, state);
    Ok(())
}

#[tauri::command]
pub async fn render_edited(request: RenderRequest, state: State<'_, AppState>) -> Result<ExportResult, String> {
    let _ = (request, state);
    Err("Not implemented - use image crate".to_string())
}

/// Only one batch export runs at a time. The UI sets this flag; the worker
/// stops at the next file boundary so the copy in progress is never half-written.
static BATCH_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn cancel_batch_export() -> Result<(), String> {
    BATCH_CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn batch_export(app: tauri::AppHandle, request: BatchExportRequest) -> Result<BatchExportResult, String> {
    // A new run always starts un-cancelled.
    BATCH_CANCEL.store(false, Ordering::SeqCst);

    let total = request.items.len() as u32;
    if total == 0 {
        return Err("Select at least one item to export.".to_string());
    }

    let folder = PathBuf::from(request.output_folder.trim());
    if request.output_folder.trim().is_empty() {
        return Err("Choose an output folder first.".to_string());
    }
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Could not create the output folder: {}", e))?;
    if !folder.is_dir() {
        return Err("The chosen output location is not a folder.".to_string());
    }

    // Decoding and encoding are CPU/disk bound; keep them off the async runtime.
    tauri::async_runtime::spawn_blocking(move || {
        let mut outputs: Vec<String> = Vec::new();
        let mut failed: Vec<BatchExportError> = Vec::new();
        let mut used_names: HashSet<String> = HashSet::new();
        let quality = (request.quality * 100.0).round().clamp(1.0, 100.0) as u8;
        let mut cancelled = false;

        for (position, item) in request.items.iter().enumerate() {
            if BATCH_CANCEL.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }

            let label = Path::new(&item.source_path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(&item.source_path)
                .to_string();

            match export_batch_item(item, &request, &folder, quality, &mut used_names) {
                Ok(path) => outputs.push(path.to_string_lossy().to_string()),
                Err(error) => failed.push(BatchExportError {
                    item_id: item.id.clone(),
                    error,
                }),
            }

            let _ = app.emit(
                "batch-progress",
                BatchExportProgress {
                    current: position as u32 + 1,
                    total,
                    current_file: label,
                },
            );
        }

        let processed = (outputs.len() + failed.len()) as u32;
        let _ = app.emit(
            "batch-progress",
            BatchExportProgress {
                current: processed,
                total,
                current_file: String::new(),
            },
        );

        Ok(BatchExportResult {
            exported: outputs.len() as u32,
            failed,
            outputs,
            cancelled,
        })
    })
    .await
    .map_err(|e| format!("Batch export stopped unexpectedly: {}", e))?
}

/// Replace characters macOS rejects in filenames and collapse whitespace.
fn sanitize_batch_name(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let trimmed = cleaned
        .trim()
        .trim_matches('.')
        .trim()
        .to_string();
    if trimmed.is_empty() {
        "export".to_string()
    } else {
        trimmed
    }
}

fn batch_output_extension(format: &str, source: &Path) -> String {
    match format {
        "jpeg" => "jpg".to_string(),
        "png" => "png".to_string(),
        "webp" => "webp".to_string(),
        _ => source
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .filter(|ext| !ext.is_empty())
            .unwrap_or_else(|| "jpg".to_string()),
    }
}

fn batch_date_label(ms: i64) -> String {
    OffsetDateTime::from_unix_timestamp(ms / 1000)
        .map(|dt| format!("{:04}-{:02}-{:02}", dt.year(), u8::from(dt.month()), dt.day()))
        .unwrap_or_else(|_| "unknown".to_string())
}

/// Render the filename pattern exactly the way the Batch screen previews it.
fn render_batch_filename(
    item: &BatchExportItem,
    pattern: &str,
    date_ms: Option<i64>,
    extension: &str,
) -> String {
    let source = Path::new(&item.source_path);
    let stem = source
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("export");
    let number = format!("{:03}", item.index + 1);
    let date = date_ms.map(batch_date_label).unwrap_or_else(|| "unknown".to_string());
    let template = if pattern.trim().is_empty() {
        "{name}_{number}"
    } else {
        pattern
    };

    let rendered = template
        .replace("{name}", &sanitize_batch_name(stem))
        .replace("{number}", &number)
        .replace("{date}", &date)
        .replace("{ext}", extension);
    let rendered = sanitize_batch_name(&rendered);

    // The pattern may include an extension; always finish with the extension
    // that matches the bytes we are about to write.
    let path = Path::new(&rendered);
    let existing_ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if existing_ext.is_empty() {
        format!("{}.{}", rendered, extension)
    } else if existing_ext == extension
        || (extension == "jpg" && existing_ext == "jpeg")
    {
        rendered
    } else {
        let base = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or(&rendered);
        format!("{}.{}", sanitize_batch_name(base), extension)
    }
}

/// Never overwrite an existing export (or a name used earlier in this batch).
fn unique_batch_path(folder: &Path, file_name: &str, used: &mut HashSet<String>) -> PathBuf {
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("export");
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");

    let mut candidate = file_name.to_string();
    let mut suffix = 2;
    while used.contains(&candidate.to_ascii_lowercase()) || folder.join(&candidate).exists() {
        candidate = if extension.is_empty() {
            format!("{}-{}", stem, suffix)
        } else {
            format!("{}-{}.{}", stem, suffix, extension)
        };
        suffix += 1;
    }
    used.insert(candidate.to_ascii_lowercase());
    folder.join(candidate)
}

fn resize_batch_image(image: DynamicImage, max_dimension: u32) -> DynamicImage {
    let (width, height) = image.dimensions();
    let longest = width.max(height);
    if longest == 0 || longest <= max_dimension {
        return image;
    }
    let scale = max_dimension as f64 / longest as f64;
    let next_width = ((width as f64) * scale).round().max(1.0) as u32;
    let next_height = ((height as f64) * scale).round().max(1.0) as u32;
    image.resize_exact(next_width, next_height, image::imageops::FilterType::Lanczos3)
}

fn write_batch_jpeg(image: DynamicImage, path: &Path, quality: u8) -> Result<(), String> {
    let rgb = image.to_rgb8();
    let file = std::fs::File::create(path)
        .map_err(|e| format!("Could not create the export file: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);
    JpegEncoder::new_with_quality(&mut writer, quality)
        .encode(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG encoding failed: {}", e))
}

fn write_batch_png(image: DynamicImage, path: &Path) -> Result<(), String> {
    let file = std::fs::File::create(path)
        .map_err(|e| format!("Could not create the export file: {}", e))?;
    let writer = std::io::BufWriter::new(file);
    PngEncoder::new_with_quality(writer, CompressionType::Default, FilterType::Adaptive)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|e| format!("PNG encoding failed: {}", e))
}

fn write_batch_webp(image: DynamicImage, path: &Path) -> Result<(), String> {
    let file = std::fs::File::create(path)
        .map_err(|e| format!("Could not create the export file: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);
    WebPEncoder::new_lossless(&mut writer)
        .encode(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|e| format!("WebP encoding failed: {}", e))
}

/// macOS ImageIO can decode HEIC/HEIF and other formats the Rust `image`
/// crate cannot. `sips` exposes that pipeline on every Mac, so use it as a
/// fallback for JPEG/PNG targets.
fn write_batch_with_sips(
    source: &Path,
    output: &Path,
    extension: &str,
    quality: u8,
    max_dimension: Option<u32>,
) -> Result<(), String> {
    let format = match extension {
        "jpg" | "jpeg" => "jpeg",
        "png" => "png",
        other => return Err(format!("Unsupported fallback format: {}", other)),
    };

    let mut command = std::process::Command::new("/usr/bin/sips");
    if let Some(max) = max_dimension.filter(|dim| *dim > 0) {
        command.arg("-Z").arg(max.to_string());
    }
    command.arg("-s").arg("format").arg(format);
    if format == "jpeg" {
        command.arg("-s").arg("formatOptions").arg(quality.to_string());
    }
    let result = command
        .arg(source)
        .arg("--out")
        .arg(output)
        .output()
        .map_err(|e| format!("Could not run the macOS image converter: {}", e))?;

    if !result.status.success() || !output.exists() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            "macOS could not decode this image.".to_string()
        } else {
            detail.to_string()
        });
    }
    Ok(())
}

fn export_batch_item(
    item: &BatchExportItem,
    request: &BatchExportRequest,
    folder: &Path,
    quality: u8,
    used: &mut HashSet<String>,
) -> Result<PathBuf, String> {
    let source = Path::new(&item.source_path);
    if !source.is_file() {
        return Err("Source file not found on disk.".to_string());
    }

    let output_ext = batch_output_extension(&request.format, source);
    let date = item.date.or_else(|| {
        std::fs::metadata(source)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
    });
    let file_name = render_batch_filename(item, &request.pattern, date, &output_ext);
    let output_path = unique_batch_path(folder, &file_name, used);

    let converting = request.format != "source";
    let resizing = request.max_dimension.map(|dim| dim > 0).unwrap_or(false);
    let kind = item.kind.as_deref().unwrap_or("photo");

    // Videos and RAW files cannot be decoded by the built-in image encoder.
    // They can still be renamed and copied without modification.
    if kind == "video" || kind == "raw" {
        if converting || resizing || request.strip_metadata {
            let message = if kind == "video" {
                "Video conversion is not supported yet. Choose “Keep source format” and turn off resizing and metadata stripping to copy videos."
            } else {
                "RAW conversion needs native macOS image support. Choose “Keep source format” and turn off resizing and metadata stripping to copy RAW files."
            };
            return Err(message.to_string());
        }
        std::fs::copy(source, &output_path)
            .map_err(|e| format!("Could not copy the file: {}", e))?;
        return Ok(output_path);
    }

    // A straight copy preserves the original bytes (and its metadata) exactly.
    if !converting && !resizing && !request.strip_metadata {
        std::fs::copy(source, &output_path)
            .map_err(|e| format!("Could not copy the file: {}", e))?;
        return Ok(output_path);
    }

    let image = match image::open(source) {
        Ok(image) => image,
        Err(decode_error) => {
            // HEIC/HEIF and some camera formats are only decodable through
            // macOS ImageIO. Fall back to `sips` when writing JPEG or PNG,
            // and use a temporary PNG when the target is WebP.
            let fallback_ext = match output_ext.as_str() {
                "jpg" | "jpeg" | "png" => output_ext.clone(),
                "webp" => "png".to_string(),
                _ => return Err(format!("Could not decode this image: {}", decode_error)),
            };
            let direct = fallback_ext == output_ext;
            let target = if direct {
                output_path.clone()
            } else {
                folder.join(format!(".stillroom-{}.png", Uuid::new_v4()))
            };

            if let Err(fallback_error) = write_batch_with_sips(
                source,
                &target,
                &fallback_ext,
                quality,
                request.max_dimension,
            ) {
                if !direct {
                    std::fs::remove_file(&target).ok();
                }
                return Err(format!(
                    "Could not decode this image: {} ({})",
                    decode_error, fallback_error
                ));
            }

            if direct {
                return Ok(output_path);
            }

            let decoded = image::open(&target)
                .map_err(|e| format!("Could not read the converted image: {}", e))?;
            let result = write_batch_webp(decoded, &output_path);
            std::fs::remove_file(&target).ok();
            return result.map(|_| output_path);
        }
    };
    let image = match request.max_dimension.filter(|dim| *dim > 0) {
        Some(max_dimension) => resize_batch_image(image, max_dimension),
        None => image,
    };

    match output_ext.as_str() {
        "jpg" | "jpeg" => write_batch_jpeg(image, &output_path, quality)?,
        "png" => write_batch_png(image, &output_path)?,
        "webp" => write_batch_webp(image, &output_path)?,
        other => {
            return Err(format!(
                "Can’t write .{} files yet. Choose JPEG, PNG, or WebP.",
                other
            ))
        }
    }

    Ok(output_path)
}

#[tauri::command]
pub async fn find_duplicates(state: State<'_, AppState>) -> Result<Vec<DuplicateGroup>, String> {
    let db = get_db(&state)?;

    // Load the catalog (hidden items included — a duplicate doesn't stop being
    // one just because it was hidden).
    let mut items: Vec<MediaItem> = sqlx::query_as::<_, MediaItem>("SELECT * FROM media_items")
        .fetch_all(&db)
        .await
        .map_err(|e| e.to_string())?;

    // Only files that share a size with at least one other file can be exact
    // duplicates, so hash only those — this keeps a full-library scan cheap.
    let mut size_counts: HashMap<i64, usize> = HashMap::new();
    for item in &items {
        *size_counts.entry(item.size).or_insert(0) += 1;
    }

    for item in items.iter_mut() {
        if item.sha256.as_deref().map(str::is_empty).unwrap_or(true)
            && size_counts.get(&item.size).copied().unwrap_or(0) > 1
        {
            if let Some(hash) = compute_file_sha256(&item.path).await {
                let _ = sqlx::query("UPDATE media_items SET sha256 = ? WHERE id = ?")
                    .bind(&hash)
                    .bind(&item.id)
                    .execute(&db)
                    .await;
                item.sha256 = Some(hash);
            }
        }
    }

    // Group by content hash.
    let mut groups_map: HashMap<String, Vec<MediaItem>> = HashMap::new();
    for item in items {
        if let Some(hash) = item.sha256.clone().filter(|h| !h.is_empty()) {
            groups_map.entry(hash).or_default().push(item);
        }
    }

    let mut groups: Vec<DuplicateGroup> = groups_map
        .into_iter()
        .filter(|(_, v)| v.len() > 1)
        .map(|(hash, items)| DuplicateGroup {
            id: hash.clone(),
            sha256: hash,
            size: items.first().map(|i| i.size).unwrap_or(0),
            items,
        })
        .collect();

    // Largest duplicate groups first.
    groups.sort_by(|a, b| b.items.len().cmp(&a.items.len()).then(b.size.cmp(&a.size)));

    Ok(groups)
}

async fn compute_file_sha256(path: &str) -> Option<String> {
    let path = path.to_string();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut file = std::fs::File::open(&path).ok()?;
        let mut ctx = ring::digest::Context::new(&ring::digest::SHA256);
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = file.read(&mut buf).ok()?;
            if n == 0 {
                break;
            }
            ctx.update(&buf[..n]);
        }
        Some(hex::encode(ctx.finish().as_ref()))
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn compute_hash(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let _ = (path, state);
    // TODO: SHA-256 via ring
    Ok("".to_string())
}

#[tauri::command]
pub async fn write_finder_tags(path: String, tags: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let _ = (path, tags, state);
    Ok(())
}

#[tauri::command]
pub async fn read_finder_tags(path: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let _ = (path, state);
    Ok(vec![])
}

/// Apply a single persisted (key, value) pair onto an `AppSettings` struct.
/// Shared by `get_settings` and `save_settings` so the parse contract lives in
/// one place. Unknown keys are ignored gracefully.
fn apply_setting(settings: &mut AppSettings, key: &str, value: &str) {
    match key {
        "appearance" => settings.appearance = value.to_string(),
        "accent_color" => settings.accent_color = value.to_string(),
        "sidebar_width" => settings.sidebar_width = value.parse().unwrap_or(220),
        "show_extensions" => settings.show_extensions = value.parse().unwrap_or(false),
        "animate_transitions" => settings.animate_transitions = value.parse().unwrap_or(true),
        "startup_view" => settings.startup_view = value.to_string(),
        "open_last_folder" => settings.open_last_folder = value.parse().unwrap_or(true),
        "restore_window_state" => settings.restore_window_state = value.parse().unwrap_or(true),
        "default_layout" => settings.default_layout = value.to_string(),
        "thumbnail_size" => settings.thumbnail_size = value.to_string(),
        "viewer_zoom_behavior" => settings.viewer_zoom_behavior = value.to_string(),
        "slideshow_interval" => settings.slideshow_interval = value.parse().unwrap_or(5),
        "slideshow_shuffle" => settings.slideshow_shuffle = value.parse().unwrap_or(false),
        "slideshow_loop" => settings.slideshow_loop = value.parse().unwrap_or(true),
        "video_auto_play" => settings.video_auto_play = value.parse().unwrap_or(true),
        "video_loop" => settings.video_loop = value.parse().unwrap_or(false),
        "watch_folders" => {
            settings.watch_folders = serde_json::from_str(&value).unwrap_or_default();
        }
        "auto_import" => settings.auto_import = value.parse().unwrap_or(false),
        "pair_raw_jpeg" => settings.pair_raw_jpeg = value.parse().unwrap_or(true),
        "stack_bursts" => settings.stack_bursts = value.parse().unwrap_or(true),
        "stack_live_photos" => settings.stack_live_photos = value.parse().unwrap_or(true),
        "strip_gps_on_export" => settings.strip_gps_on_export = value.parse().unwrap_or(true),
        "strip_all_metadata_on_export" => settings.strip_all_metadata_on_export = value.parse().unwrap_or(false),
        "allow_network_requests" => settings.allow_network_requests = value.parse().unwrap_or(false),
        "send_crash_reports" => settings.send_crash_reports = value.parse().unwrap_or(false),
        "max_cache_size_gb" => settings.max_cache_size_gb = value.parse().unwrap_or(5),
        "thumbnail_quality" => settings.thumbnail_quality = value.parse().unwrap_or(80),
        "enable_debug_logging" => settings.enable_debug_logging = value.parse().unwrap_or(false),
        "show_native_limit_warnings" => settings.show_native_limit_warnings = value.parse().unwrap_or(true),
        _ => {}
    }
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db = get_db(&state)?;
    Ok(load_persisted_settings(&db).await?)
}

/// Load the full set of persisted settings rows from the `settings` table into
/// an `AppSettings`, starting from `AppSettings::default()` for any keys not
/// yet stored. Shared by `get_settings` and `save_settings` so the read contract
/// lives in one place and a partial save can merge onto the *real* persisted
/// state instead of `AppSettings::default()`.
async fn load_persisted_settings(db: &SqlitePool) -> Result<AppSettings, String> {
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(db)
        .await
        .map_err(|e| e.to_string())?;
    let mut settings = AppSettings::default();
    for row in rows {
        let key: String = row.get("key");
        let value: String = row.get("value");
        apply_setting(&mut settings, &key, &value);
    }
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(patch: PartialSettings, state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db = get_db(&state)?;
    // Start from the SETTINGS CURRENTLY PERSISTED, then apply the incoming
    // patch on top. Previously this began from `AppSettings::default()`, which
    // silently reset every key NOT present in a partial patch to its default and
    // wrote those defaults back to disk — the root cause of settings "resetting"
    // on each save.
    let mut settings = load_persisted_settings(&db).await?;
    if let Some(v) = patch.appearance { settings.appearance = v; }
    if let Some(v) = patch.accent_color { settings.accent_color = v; }
    if let Some(v) = patch.sidebar_width { settings.sidebar_width = v; }
    if let Some(v) = patch.show_extensions { settings.show_extensions = v; }
    if let Some(v) = patch.animate_transitions { settings.animate_transitions = v; }
    if let Some(v) = patch.startup_view { settings.startup_view = v; }
    if let Some(v) = patch.open_last_folder { settings.open_last_folder = v; }
    if let Some(v) = patch.restore_window_state { settings.restore_window_state = v; }
    if let Some(v) = patch.default_layout { settings.default_layout = v; }
    if let Some(v) = patch.thumbnail_size { settings.thumbnail_size = v; }
    if let Some(v) = patch.viewer_zoom_behavior { settings.viewer_zoom_behavior = v; }
    if let Some(v) = patch.slideshow_interval { settings.slideshow_interval = v; }
    if let Some(v) = patch.slideshow_shuffle { settings.slideshow_shuffle = v; }
    if let Some(v) = patch.slideshow_loop { settings.slideshow_loop = v; }
    if let Some(v) = patch.video_auto_play { settings.video_auto_play = v; }
    if let Some(v) = patch.video_loop { settings.video_loop = v; }
    if let Some(v) = patch.watch_folders { settings.watch_folders = v; }
    if let Some(v) = patch.auto_import { settings.auto_import = v; }
    if let Some(v) = patch.pair_raw_jpeg { settings.pair_raw_jpeg = v; }
    if let Some(v) = patch.stack_bursts { settings.stack_bursts = v; }
    if let Some(v) = patch.stack_live_photos { settings.stack_live_photos = v; }
    if let Some(v) = patch.strip_gps_on_export { settings.strip_gps_on_export = v; }
    if let Some(v) = patch.strip_all_metadata_on_export { settings.strip_all_metadata_on_export = v; }
    if let Some(v) = patch.allow_network_requests { settings.allow_network_requests = v; }
    if let Some(v) = patch.send_crash_reports { settings.send_crash_reports = v; }
    if let Some(v) = patch.max_cache_size_gb { settings.max_cache_size_gb = v; }
    if let Some(v) = patch.thumbnail_quality { settings.thumbnail_quality = v; }
    if let Some(v) = patch.enable_debug_logging { settings.enable_debug_logging = v; }
    if let Some(v) = patch.show_native_limit_warnings { settings.show_native_limit_warnings = v; }

    let settings_map = vec![
        ("appearance", settings.appearance.clone()),
        ("accent_color", settings.accent_color.clone()),
        ("sidebar_width", settings.sidebar_width.to_string()),
        ("show_extensions", settings.show_extensions.to_string()),
        ("animate_transitions", settings.animate_transitions.to_string()),
        ("startup_view", settings.startup_view.clone()),
        ("open_last_folder", settings.open_last_folder.to_string()),
        ("restore_window_state", settings.restore_window_state.to_string()),
        ("default_layout", settings.default_layout.clone()),
        ("thumbnail_size", settings.thumbnail_size.clone()),
        ("viewer_zoom_behavior", settings.viewer_zoom_behavior.clone()),
        ("slideshow_interval", settings.slideshow_interval.to_string()),
        ("slideshow_shuffle", settings.slideshow_shuffle.to_string()),
        ("slideshow_loop", settings.slideshow_loop.to_string()),
        ("video_auto_play", settings.video_auto_play.to_string()),
        ("video_loop", settings.video_loop.to_string()),
        ("watch_folders", serde_json::to_string(&settings.watch_folders).unwrap_or_else(|_| "[]".to_string())),
        ("auto_import", settings.auto_import.to_string()),
        ("pair_raw_jpeg", settings.pair_raw_jpeg.to_string()),
        ("stack_bursts", settings.stack_bursts.to_string()),
        ("stack_live_photos", settings.stack_live_photos.to_string()),
        ("strip_gps_on_export", settings.strip_gps_on_export.to_string()),
        ("strip_all_metadata_on_export", settings.strip_all_metadata_on_export.to_string()),
        ("allow_network_requests", settings.allow_network_requests.to_string()),
        ("send_crash_reports", settings.send_crash_reports.to_string()),
        ("max_cache_size_gb", settings.max_cache_size_gb.to_string()),
        ("thumbnail_quality", settings.thumbnail_quality.to_string()),
        ("enable_debug_logging", settings.enable_debug_logging.to_string()),
        ("show_native_limit_warnings", settings.show_native_limit_warnings.to_string()),
    ];

    for (key, value) in settings_map {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
            .bind(key)
            .bind(value)
            .execute(&db)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(settings)
}

#[tauri::command]
pub async fn get_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

/// Purge the entire library catalog (media items, tags, albums, folders and
/// library folders, import sessions) while leaving original media files on disk.
/// This is irreversible through the UI.
#[tauri::command]
pub async fn delete_library_database(state: State<'_, AppState>) -> Result<(), String> {
    let db = get_db(&state)?;
    sqlx::query("DELETE FROM media_items")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM media_tags")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM album_items")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM albums")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM tags")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM library_folders")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM import_sessions")
        .execute(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn check_updates() -> Result<serde_json::Value, String> {
    Ok(json!({ "available": false }))
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&url)
        .status()
        .map_err(|e| format!("Could not open {}: {}", url, e))?;
    Ok(())
}
#[tauri::command]
pub async fn save_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod batch_export_tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "stillroom-batch-test-{}-{}",
            label,
            Uuid::new_v4()
        ));
        std::fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn test_item(source: &Path) -> BatchExportItem {
        BatchExportItem {
            id: "item-1".to_string(),
            source_path: source.to_string_lossy().to_string(),
            index: 0,
            kind: Some("photo".to_string()),
            date: Some(1_710_000_000_000),
        }
    }

    fn test_request(items: Vec<BatchExportItem>, folder: &Path, format: &str) -> BatchExportRequest {
        BatchExportRequest {
            items,
            output_folder: folder.to_string_lossy().to_string(),
            pattern: "{name}_{number}".to_string(),
            format: format.to_string(),
            quality: 0.85,
            strip_metadata: true,
            max_dimension: Some(10),
        }
    }

    #[test]
    fn renders_tokens_and_replaces_extension() {
        let item = BatchExportItem {
            id: "1".to_string(),
            source_path: "/tmp/My Photo.JPG".to_string(),
            index: 4,
            kind: Some("photo".to_string()),
            date: Some(1_710_000_000_000),
        };

        assert_eq!(
            render_batch_filename(&item, "{name}_{number}", Some(1_710_000_000_000), "jpg"),
            "My Photo_005.jpg"
        );
        assert_eq!(
            render_batch_filename(&item, "{date}-{name}.png", Some(1_710_000_000_000), "jpg"),
            "2024-03-09-My Photo.jpg"
        );
        assert_eq!(
            render_batch_filename(&item, "original.jpg", None, "webp"),
            "original.webp"
        );
    }

    #[test]
    fn exports_a_resized_jpeg() {
        let folder = temp_dir("resize");
        let source = folder.join("photo.png");
        image::RgbaImage::from_pixel(20, 10, image::Rgba([120, 30, 40, 255]))
            .save(&source)
            .expect("write source image");

        let item = test_item(&source);
        let request = test_request(vec![item.clone()], &folder, "jpeg");
        let mut used = HashSet::new();
        let output = export_batch_item(&item, &request, &folder, 85, &mut used)
            .expect("export should succeed");

        assert!(output.exists(), "output file should exist");
        assert_eq!(output.file_name().unwrap(), "photo_001.jpg");
        assert_eq!(image::image_dimensions(&output).unwrap(), (10, 5));

        std::fs::remove_dir_all(&folder).ok();
    }

    #[test]
    fn avoids_overwriting_existing_files() {
        let folder = temp_dir("collision");
        let source = folder.join("photo.png");
        image::RgbaImage::from_pixel(8, 8, image::Rgba([20, 40, 60, 255]))
            .save(&source)
            .expect("write source image");

        let item = test_item(&source);
        let request = test_request(vec![item.clone()], &folder, "png");
        let first = export_batch_item(&item, &request, &folder, 85, &mut HashSet::new())
            .expect("first export");
        let second = export_batch_item(&item, &request, &folder, 85, &mut HashSet::new())
            .expect("second export");

        assert_eq!(first.file_name().unwrap(), "photo_001.png");
        assert_eq!(second.file_name().unwrap(), "photo_001-2.png");
        assert!(first.exists() && second.exists());

        std::fs::remove_dir_all(&folder).ok();
    }

    #[test]
    fn copies_untouched_source_format() {
        let folder = temp_dir("copy");
        let source = folder.join("clip.mp4");
        std::fs::write(&source, b"not a real video, but a real file").expect("write source");

        let mut item = test_item(&source);
        item.kind = Some("video".to_string());
        let mut request = test_request(vec![item.clone()], &folder, "source");
        request.max_dimension = None;
        request.strip_metadata = false;

        let mut used = HashSet::new();
        let output = export_batch_item(&item, &request, &folder, 85, &mut used)
            .expect("video should copy unchanged");

        assert_eq!(std::fs::read(&output).unwrap(), std::fs::read(&source).unwrap());
        std::fs::remove_dir_all(&folder).ok();
    }
}
