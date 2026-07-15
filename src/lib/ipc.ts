/** Typed wrappers around every Tauri command. The only file that calls `invoke`. */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  BacklinkEntry,
  FilesChangedPayload,
  GraphData,
  NoteContent,
  NoteMeta,
  VaultSnapshot,
} from "./types";

export function getLastVault(): Promise<string | null> {
  return invoke("get_last_vault");
}

export function openVault(path: string): Promise<VaultSnapshot> {
  return invoke("open_vault", { path });
}

export function listNotes(): Promise<NoteMeta[]> {
  return invoke("list_notes");
}

export function readNote(id: string): Promise<NoteContent> {
  return invoke("read_note", { id });
}

/** Returns the new mtime. Rejects with `kind: "conflict"` if the file changed on disk. */
export function writeNote(
  id: string,
  content: string,
  expectedMtimeMs?: number,
): Promise<number> {
  return invoke("write_note", { id, content, expectedMtimeMs: expectedMtimeMs ?? null });
}

export function createNote(title: string, folder?: string): Promise<NoteMeta> {
  return invoke("create_note", { title, folder: folder ?? null });
}

export function renameNote(id: string, newTitle: string): Promise<NoteMeta> {
  return invoke("rename_note", { id, newTitle });
}

export function deleteNote(id: string): Promise<void> {
  return invoke("delete_note", { id });
}

export function getBacklinks(id: string): Promise<BacklinkEntry[]> {
  return invoke("get_backlinks", { id });
}

export function getGraph(): Promise<GraphData> {
  return invoke("get_graph");
}

export function onFilesChanged(
  handler: (payload: FilesChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<FilesChangedPayload>("vault://files-changed", (e) =>
    handler(e.payload),
  );
}
