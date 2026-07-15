mod commands;
mod config;
mod events;
mod watcher;

// Public for the genvault/benchindex utility binaries.
pub mod error;
pub mod index;
pub mod vault;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use std::time::Instant;

/// Shared app state: the open vault, its link index, the live file watcher,
/// and the self-write suppression set.
#[derive(Default)]
pub struct AppState {
    pub vault: RwLock<Option<vault::Vault>>,
    pub index: RwLock<Option<index::VaultIndex>>,
    pub watcher: Mutex<Option<watcher::WatcherHandle>>,
    pub recent_writes: Mutex<HashMap<PathBuf, Instant>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_last_vault,
            commands::open_vault,
            commands::list_notes,
            commands::read_note,
            commands::get_backlinks,
            commands::get_graph,
            commands::write_note,
            commands::create_note,
            commands::rename_note,
            commands::delete_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
