//! Vault file watching: `notify` recursive watcher → 300 ms debounce batches
//! → incremental index updates → one `vault://files-changed` event.
//!
//! Self-write suppression: commands that write record the absolute path in
//! `AppState::recent_writes`; watcher events for those paths within the
//! suppression window are dropped (the command already updated the index and
//! emitted its own event).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Manager};

use crate::events::{emit_files_changed, FilesChangedOrigin};
use crate::vault::NoteMeta;
use crate::AppState;

const DEBOUNCE: Duration = Duration::from_millis(300);
pub const SUPPRESSION_WINDOW: Duration = Duration::from_millis(2000);

pub struct WatcherHandle {
    // Kept alive; dropping stops the watcher and ends the worker thread.
    _watcher: RecommendedWatcher,
}

pub fn start(app: AppHandle, root: PathBuf) -> notify::Result<WatcherHandle> {
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })?;
    watcher.watch(&root, RecursiveMode::Recursive)?;
    std::thread::spawn(move || worker(app, rx));
    Ok(WatcherHandle { _watcher: watcher })
}

fn worker(app: AppHandle, rx: Receiver<notify::Result<notify::Event>>) {
    loop {
        // Block for the first event of a batch.
        let first = match rx.recv() {
            Ok(ev) => ev,
            Err(_) => return, // watcher dropped
        };
        let mut paths: HashSet<PathBuf> = HashSet::new();
        collect(first, &mut paths);

        // Absorb everything that arrives within the debounce window.
        let deadline = Instant::now() + DEBOUNCE;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            match rx.recv_timeout(remaining) {
                Ok(ev) => collect(ev, &mut paths),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    process_batch(&app, &paths);
                    return;
                }
            }
        }
        process_batch(&app, &paths);
    }
}

fn collect(event: notify::Result<notify::Event>, paths: &mut HashSet<PathBuf>) {
    if let Ok(ev) = event {
        for p in ev.paths {
            paths.insert(p);
        }
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .map(|e| e.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn in_hidden_dir(id: &str) -> bool {
    id.split('/')
        .any(|part| part.starts_with('.') || crate::vault::is_ignored_dir(part))
}

fn process_batch(app: &AppHandle, paths: &HashSet<PathBuf>) {
    let state = app.state::<AppState>();

    // Purge stale suppression entries; collect live ones.
    let suppressed: HashSet<PathBuf> = {
        let mut recent = state.recent_writes.lock().unwrap();
        let now = Instant::now();
        recent.retain(|_, t| now.duration_since(*t) < SUPPRESSION_WINDOW);
        recent.keys().cloned().collect()
    };

    let vault_guard = state.vault.read().unwrap();
    let Some(vault) = vault_guard.as_ref() else {
        return;
    };
    let mut index_guard = state.index.write().unwrap();
    let Some(index) = index_guard.as_mut() else {
        return;
    };

    let mut changed: Vec<NoteMeta> = Vec::new();
    let mut removed: Vec<String> = Vec::new();

    for path in paths {
        if !is_markdown(path) || suppressed.contains(path) {
            continue;
        }
        let Some(id) = vault.id_for(path) else {
            continue;
        };
        if in_hidden_dir(&id) {
            continue;
        }
        if path.is_file() {
            if let (Ok(note), Ok(meta)) = (vault.read_note(&id), vault.meta_for_id(&id)) {
                index.upsert_note(&id, &note.content, meta.clone());
                changed.push(meta);
            }
        } else if index.contains(&id) {
            index.remove_note(&id);
            removed.push(id);
        }
    }

    if !changed.is_empty() || !removed.is_empty() {
        emit_files_changed(app, FilesChangedOrigin::External, changed, removed);
    }
}
