//! Vault filesystem layer: scanning, reading, and writing Markdown notes.
//!
//! A note id is its vault-relative path with forward slashes, e.g.
//! `topics/Graph Theory.md`. Ids are validated so they can never escape
//! the vault root.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use walkdir::WalkDir;

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub mtime_ms: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub id: String,
    pub content: String,
    pub mtime_ms: u64,
}

#[derive(Debug)]
pub struct Vault {
    root: PathBuf,
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .map(|e| e.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

/// Directories that hold dependency/build markdown, never the user's notes.
pub fn is_ignored_dir(name: &str) -> bool {
    matches!(name, "node_modules" | "target" | "dist" | "build" | "__pycache__")
}

/// Windows-safe filename from a user-typed title.
fn sanitize_title(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') && !c.is_control())
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').trim().to_string();
    if cleaned.is_empty() {
        "Untitled".to_string()
    } else {
        cleaned
    }
}

impl Vault {
    pub fn open(root: &str) -> Result<Self> {
        let root = dunce::canonicalize(root)
            .map_err(|_| AppError::Other(format!("cannot open folder: {root}")))?;
        if !root.is_dir() {
            return Err(AppError::Other(format!(
                "not a folder: {}",
                root.display()
            )));
        }
        Ok(Self { root })
    }

    pub fn root_string(&self) -> String {
        self.root.to_string_lossy().to_string()
    }

    pub fn root_path(&self) -> PathBuf {
        self.root.clone()
    }

    /// Recursively list all `.md` files, skipping dot-directories and
    /// well-known dependency/build folders that are never notes.
    pub fn scan(&self) -> Vec<NoteMeta> {
        let mut notes = Vec::new();
        let walker = WalkDir::new(&self.root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                if !e.file_type().is_dir() || e.depth() == 0 {
                    return true;
                }
                let name = e.file_name().to_string_lossy();
                !(name.starts_with('.') || is_ignored_dir(&name))
            });
        for entry in walker.flatten() {
            if !entry.file_type().is_file() || !is_markdown(entry.path()) {
                continue;
            }
            if let (Some(id), Ok(meta)) = (self.id_for(entry.path()), entry.metadata()) {
                notes.push(NoteMeta {
                    title: title_of(&id),
                    id,
                    mtime_ms: mtime_ms(&meta),
                    size: meta.len(),
                });
            }
        }
        notes
    }

    /// Vault-relative id (forward slashes) for an absolute path inside the vault.
    pub fn id_for(&self, path: &Path) -> Option<String> {
        let rel = path.strip_prefix(&self.root).ok()?;
        Some(rel.to_string_lossy().replace('\\', "/"))
    }

    /// Absolute path for a note id, rejecting anything that could escape the root.
    pub fn abs_path(&self, id: &str) -> Result<PathBuf> {
        if id.is_empty() || id.contains('\\') {
            return Err(AppError::InvalidId(id.to_string()));
        }
        let rel = Path::new(id);
        let valid = rel
            .components()
            .all(|c| matches!(c, Component::Normal(_)));
        if !valid {
            return Err(AppError::InvalidId(id.to_string()));
        }
        Ok(self.root.join(rel))
    }

    pub fn meta_for_id(&self, id: &str) -> Result<NoteMeta> {
        let path = self.abs_path(id)?;
        let meta = fs::metadata(&path).map_err(|_| AppError::NotFound(id.to_string()))?;
        Ok(NoteMeta {
            title: title_of(id),
            id: id.to_string(),
            mtime_ms: mtime_ms(&meta),
            size: meta.len(),
        })
    }

    pub fn read_note(&self, id: &str) -> Result<NoteContent> {
        let path = self.abs_path(id)?;
        let meta = fs::metadata(&path).map_err(|_| AppError::NotFound(id.to_string()))?;
        let content = fs::read_to_string(&path)?;
        Ok(NoteContent {
            id: id.to_string(),
            content,
            mtime_ms: mtime_ms(&meta),
        })
    }

    /// Write a note. When `expected_mtime_ms` is given and the file on disk
    /// has a different mtime, the write is refused with `Conflict` — this is
    /// the save precondition of the conflict policy.
    pub fn write_note(
        &self,
        id: &str,
        content: &str,
        expected_mtime_ms: Option<u64>,
    ) -> Result<u64> {
        let path = self.abs_path(id)?;
        if let (Some(expected), Ok(meta)) = (expected_mtime_ms, fs::metadata(&path)) {
            let on_disk = mtime_ms(&meta);
            if on_disk != expected {
                return Err(AppError::Conflict {
                    disk_mtime_ms: on_disk,
                });
            }
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, content)?;
        Ok(mtime_ms(&fs::metadata(&path)?))
    }

    /// Create an empty note from a title, uniquified with " 2", " 3", … suffixes.
    pub fn create_note(&self, title: &str, folder: Option<&str>) -> Result<NoteMeta> {
        let title = sanitize_title(title);
        let dir = match folder {
            Some(f) if !f.is_empty() => {
                let p = self.abs_path(&format!("{f}/_probe"))?;
                p.parent().unwrap().to_path_buf()
            }
            _ => self.root.clone(),
        };
        fs::create_dir_all(&dir)?;
        let mut n = 1u32;
        let path = loop {
            let name = if n == 1 {
                format!("{title}.md")
            } else {
                format!("{title} {n}.md")
            };
            let candidate = dir.join(&name);
            if !candidate.exists() {
                break candidate;
            }
            n += 1;
            if n > 9999 {
                return Err(AppError::AlreadyExists(title));
            }
        };
        fs::write(&path, "")?;
        let id = self
            .id_for(&path)
            .ok_or_else(|| AppError::Other("created note outside vault".into()))?;
        self.meta_for_id(&id)
    }

    /// Rename a note in place (same folder), keeping content.
    pub fn rename_note(&self, id: &str, new_title: &str) -> Result<NoteMeta> {
        let old_path = self.abs_path(id)?;
        if !old_path.is_file() {
            return Err(AppError::NotFound(id.to_string()));
        }
        let new_title = sanitize_title(new_title);
        let new_path = old_path
            .parent()
            .unwrap_or(&self.root)
            .join(format!("{new_title}.md"));
        if new_path == old_path {
            return self.meta_for_id(id);
        }
        if new_path.exists() {
            return Err(AppError::AlreadyExists(new_title));
        }
        fs::rename(&old_path, &new_path)?;
        let new_id = self
            .id_for(&new_path)
            .ok_or_else(|| AppError::Other("renamed note outside vault".into()))?;
        self.meta_for_id(&new_id)
    }

    /// Move a note to the system trash (recoverable), never a hard delete.
    pub fn delete_note(&self, id: &str) -> Result<()> {
        let path = self.abs_path(id)?;
        if !path.is_file() {
            return Err(AppError::NotFound(id.to_string()));
        }
        trash::delete(&path).map_err(|e| AppError::Other(format!("could not delete: {e}")))
    }
}

/// Display title of a note id: file stem of the last path segment.
pub fn title_of(id: &str) -> String {
    let name = id.rsplit('/').next().unwrap_or(id);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
        .to_string()
}
