//! Push events from Rust to the frontend.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::vault::NoteMeta;

pub const FILES_CHANGED: &str = "vault://files-changed";

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FilesChangedOrigin {
    /// Caused by a command from this app (our own save/create/rename/delete).
    #[serde(rename = "self")]
    SelfWrite,
    /// Caused by another program touching the vault.
    External,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesChangedPayload {
    pub origin: FilesChangedOrigin,
    pub changed: Vec<NoteMeta>,
    pub removed: Vec<String>,
}

pub fn emit_files_changed(
    app: &AppHandle,
    origin: FilesChangedOrigin,
    changed: Vec<NoteMeta>,
    removed: Vec<String>,
) {
    let _ = app.emit(
        FILES_CHANGED,
        FilesChangedPayload {
            origin,
            changed,
            removed,
        },
    );
}
