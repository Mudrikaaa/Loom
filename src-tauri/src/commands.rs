//! Tauri command surface. Commands that mutate files also update the index
//! synchronously, record the path for watcher self-write suppression, and
//! emit `vault://files-changed` themselves — so external edits are the only
//! thing the watcher has to report.

use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::config;
use crate::error::{AppError, Result};
use crate::events::{emit_files_changed, FilesChangedOrigin};
use crate::index::{BacklinkEntry, GraphData, VaultIndex};
use crate::vault::{NoteContent, NoteMeta, Vault};
use crate::{watcher, AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSnapshot {
    pub root: String,
    pub notes: Vec<NoteMeta>,
}

fn with_vault<T>(state: &State<AppState>, f: impl FnOnce(&Vault) -> Result<T>) -> Result<T> {
    let guard = state.vault.read().unwrap();
    let vault = guard.as_ref().ok_or(AppError::NoVault)?;
    f(vault)
}

fn with_index<T>(
    state: &State<AppState>,
    f: impl FnOnce(&mut VaultIndex) -> T,
) -> Result<T> {
    let mut guard = state.index.write().unwrap();
    let index = guard.as_mut().ok_or(AppError::NoVault)?;
    Ok(f(index))
}

/// Record a path so the watcher ignores the event our own write causes.
fn suppress_watch(state: &State<AppState>, vault: &Vault, id: &str) {
    if let Ok(path) = vault.abs_path(id) {
        state
            .recent_writes
            .lock()
            .unwrap()
            .insert(path, Instant::now());
    }
}

#[tauri::command]
pub fn get_last_vault(app: AppHandle) -> Option<String> {
    config::load(&app).last_vault
}

#[tauri::command]
pub async fn open_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<VaultSnapshot> {
    let vault = Vault::open(&path)?;
    let root = vault.root_string();
    let index = VaultIndex::build(&vault)?;
    let notes = index.notes();

    // Replace watcher first (dropping the old one stops its thread).
    let handle = watcher::start(app.clone(), vault.root_path()).map_err(|e| {
        AppError::Other(format!("could not watch vault folder: {e}"))
    })?;
    *state.watcher.lock().unwrap() = Some(handle);
    *state.vault.write().unwrap() = Some(vault);
    *state.index.write().unwrap() = Some(index);

    config::save(
        &app,
        &config::AppConfig {
            last_vault: Some(root.clone()),
        },
    );
    Ok(VaultSnapshot { root, notes })
}

#[tauri::command]
pub fn list_notes(state: State<AppState>) -> Result<Vec<NoteMeta>> {
    with_index(&state, |i| i.notes())
}

#[tauri::command]
pub fn read_note(state: State<AppState>, id: String) -> Result<NoteContent> {
    with_vault(&state, |v| v.read_note(&id))
}

#[tauri::command]
pub fn get_backlinks(state: State<AppState>, id: String) -> Result<Vec<BacklinkEntry>> {
    with_index(&state, |i| i.backlinks(&id))
}

#[tauri::command]
pub fn get_graph(state: State<AppState>) -> Result<GraphData> {
    with_index(&state, |i| i.graph())
}

#[tauri::command]
pub fn write_note(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    content: String,
    expected_mtime_ms: Option<u64>,
) -> Result<u64> {
    let meta = with_vault(&state, |v| {
        suppress_watch(&state, v, &id);
        v.write_note(&id, &content, expected_mtime_ms)?;
        v.meta_for_id(&id)
    })?;
    let mtime = meta.mtime_ms;
    with_index(&state, |i| i.upsert_note(&id, &content, meta.clone()))?;
    emit_files_changed(&app, FilesChangedOrigin::SelfWrite, vec![meta], vec![]);
    Ok(mtime)
}

#[tauri::command]
pub fn create_note(
    app: AppHandle,
    state: State<AppState>,
    title: String,
    folder: Option<String>,
) -> Result<NoteMeta> {
    let meta = with_vault(&state, |v| {
        let meta = v.create_note(&title, folder.as_deref())?;
        suppress_watch(&state, v, &meta.id);
        Ok(meta)
    })?;
    with_index(&state, |i| i.upsert_note(&meta.id, "", meta.clone()))?;
    emit_files_changed(&app, FilesChangedOrigin::SelfWrite, vec![meta.clone()], vec![]);
    Ok(meta)
}

#[tauri::command]
pub fn rename_note(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    new_title: String,
) -> Result<NoteMeta> {
    let meta = with_vault(&state, |v| {
        suppress_watch(&state, v, &id);
        let meta = v.rename_note(&id, &new_title)?;
        suppress_watch(&state, v, &meta.id);
        Ok(meta)
    })?;
    with_index(&state, |i| i.rename_note(&id, meta.clone()))?;
    emit_files_changed(
        &app,
        FilesChangedOrigin::SelfWrite,
        vec![meta.clone()],
        vec![id],
    );
    Ok(meta)
}

#[tauri::command]
pub fn delete_note(app: AppHandle, state: State<AppState>, id: String) -> Result<()> {
    with_vault(&state, |v| {
        suppress_watch(&state, v, &id);
        v.delete_note(&id)
    })?;
    with_index(&state, |i| i.remove_note(&id))?;
    emit_files_changed(&app, FilesChangedOrigin::SelfWrite, vec![], vec![id]);
    Ok(())
}
