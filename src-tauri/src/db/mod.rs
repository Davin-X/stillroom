use sqlx::{sqlite::SqlitePoolOptions, SqlitePool, Row};
use std::path::PathBuf;
use tauri::Manager;
use crate::models::*;
use anyhow::Result;

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let db_path = get_db_path(app_handle)?;
        
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                    .busy_timeout(std::time::Duration::from_secs(30)),
            )
            .await?;
        
        let db = Self { pool };
        db.migrate().await?;
        Ok(db)
    }
    
    async fn migrate(&self) -> Result<()> {
        // Enable foreign keys
        sqlx::query("PRAGMA foreign_keys = ON").execute(&self.pool).await?;
        
        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS media_items (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                extension TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('photo','video','raw')),
                size INTEGER NOT NULL,
                modified_at INTEGER NOT NULL,
                captured_at INTEGER,
                width INTEGER,
                height INTEGER,
                camera TEXT,
                lens TEXT,
                exposure TEXT,
                iso INTEGER,
                latitude REAL,
                longitude REAL,
                sha256 TEXT,
                favorite INTEGER DEFAULT 0,
                hidden INTEGER DEFAULT 0,
                in_vault INTEGER DEFAULT 0,
                import_session_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_media_path ON media_items(path);
            CREATE INDEX IF NOT EXISTS idx_media_captured ON media_items(captured_at);
            CREATE INDEX IF NOT EXISTS idx_media_kind ON media_items(kind);
            CREATE INDEX IF NOT EXISTS idx_media_favorite ON media_items(favorite);
            CREATE INDEX IF NOT EXISTS idx_media_hidden ON media_items(hidden);
            CREATE INDEX IF NOT EXISTS idx_media_vault ON media_items(in_vault);
            CREATE INDEX IF NOT EXISTS idx_media_sha256 ON media_items(sha256);
            CREATE INDEX IF NOT EXISTS idx_media_session ON media_items(import_session_id);
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS albums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color_index INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color_index INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS media_tags (
                media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (media_id, tag_id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS album_items (
                album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
                media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
                added_at INTEGER NOT NULL,
                PRIMARY KEY (album_id, media_id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS import_sessions (
                id TEXT PRIMARY KEY,
                root_path TEXT NOT NULL,
                file_count INTEGER DEFAULT 0,
                status TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                completed_at INTEGER
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS vault_items (
                media_id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
                encrypted_key TEXT NOT NULL,
                added_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Backfill dimensions for existing photos scanned before the fix.
        // Only touches rows where width is 0 or NULL.
        let rows = sqlx::query("SELECT id, path FROM media_items WHERE kind = 'photo' AND (width IS NULL OR width = 0)")
            .fetch_all(&self.pool)
            .await?;
        for row in rows {
            let id: String = row.get("id");
            let path: String = row.get("path");
            if let Ok((w, h)) = image::image_dimensions(&path) {
                sqlx::query("UPDATE media_items SET width = ?, height = ? WHERE id = ?")
                    .bind(w as i32)
                    .bind(h as i32)
                    .bind(&id)
                    .execute(&self.pool)
                    .await?;
            }
        }

        Ok(())
    }
    
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    Ok(app_dir.join("stillroom.db"))
}