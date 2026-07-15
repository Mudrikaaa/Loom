/**
 * Central app state (Zustand). Owns the vault snapshot, the currently open
 * note, and the debounced-autosave lifecycle. Components never call ipc
 * directly for mutations — they go through actions here so dirty/save state
 * stays consistent.
 */

import { create } from "zustand";
import { open as pickFolder, confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import * as ipc from "../lib/ipc";
import {
  errorMessage,
  isAppError,
  type BacklinkEntry,
  type FilesChangedPayload,
  type GraphData,
  type NoteMeta,
} from "../lib/types";
import { normalizeTarget, resolveTarget } from "../lib/resolve";

export type Phase = "boot" | "noVault" | "opening" | "ready";
export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Conflict policy (see architecture doc):
 * - open + clean + changed on disk        → auto-reload, subtle toast
 * - open + dirty + changed on disk        → "modified" banner, saves blocked
 * - open + dirty + deleted on disk        → "deleted" banner
 * - save hits mtime precondition failure  → "modified" banner
 * The user resolves via reload / keep-mine / discard. Never silent data loss.
 */
export type Conflict = "modified" | "deleted" | null;

interface LoomStore {
  phase: Phase;
  vaultRoot: string | null;
  notes: NoteMeta[];

  currentId: string | null;
  /** Editor document for the current note. Source of truth while a note is open. */
  content: string;
  /** mtime of the disk version our editor content is based on (save precondition). */
  mtimeMs: number;
  dirty: boolean;
  saveState: SaveState;
  conflict: Conflict;
  backlinks: BacklinkEntry[];
  /** Bumped when the editor doc is replaced from outside (reload/conflict). */
  externalVersion: number;

  /** Transient error toast; null when hidden. */
  error: string | null;
  /** Transient info toast; null when hidden. */
  info: string | null;

  /** Main-area view. The graph is a sibling of the editor, not a note. */
  view: "editor" | "graph";
  graph: GraphData | null;
  graphLoading: boolean;

  boot(): Promise<void>;
  pickVault(): Promise<void>;
  openVaultPath(path: string): Promise<void>;
  openNote(id: string): Promise<void>;
  closeNote(): Promise<void>;
  setContent(text: string): void;
  saveNow(): Promise<void>;
  createNote(title: string, folder?: string): Promise<void>;
  /** Ctrl+click on a wikilink: open the note if it resolves, create it if not. */
  followWikiLink(rawTarget: string): Promise<void>;
  renameNote(id: string, newTitle: string): Promise<void>;
  deleteNote(id: string): Promise<void>;
  showError(message: string): void;
  clearError(): void;

  setView(view: "editor" | "graph"): void;
  loadGraph(): Promise<void>;

  handleFilesChanged(payload: FilesChangedPayload): void;
  refreshBacklinks(): Promise<void>;
  /** Conflict banner: replace editor content with the disk version. */
  conflictReload(): Promise<void>;
  /** Conflict banner: force-write my version over the disk version. */
  conflictKeepMine(): Promise<void>;
  /** Conflict banner (deleted): drop my version and close the note. */
  conflictDiscard(): void;
}

const AUTOSAVE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(store: () => LoomStore) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void store().saveNow();
  }, AUTOSAVE_MS);
}

function cancelScheduledSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

const GRAPH_REFRESH_MS = 1500;
let graphTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGraphRefresh(store: () => LoomStore) {
  if (graphTimer) clearTimeout(graphTimer);
  graphTimer = setTimeout(() => {
    graphTimer = null;
    void store().loadGraph();
  }, GRAPH_REFRESH_MS);
}

function sortNotes(notes: NoteMeta[]): NoteMeta[] {
  return [...notes].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

export const useStore = create<LoomStore>((set, get) => ({
  phase: "boot",
  vaultRoot: null,
  notes: [],
  currentId: null,
  content: "",
  mtimeMs: 0,
  dirty: false,
  saveState: "idle",
  conflict: null,
  backlinks: [],
  externalVersion: 0,
  error: null,
  info: null,
  view: "editor",
  graph: null,
  graphLoading: false,

  async boot() {
    void ipc.onFilesChanged((payload) => get().handleFilesChanged(payload));
    try {
      const last = await ipc.getLastVault();
      if (last) {
        await get().openVaultPath(last);
      } else {
        set({ phase: "noVault" });
      }
    } catch (e) {
      set({ phase: "noVault", error: errorMessage(e) });
    }
  },

  async pickVault() {
    const chosen = await pickFolder({
      directory: true,
      title: "Choose a vault folder",
    });
    if (typeof chosen === "string" && chosen) {
      await get().openVaultPath(chosen);
    }
  },

  async openVaultPath(path: string) {
    await get().closeNote();
    set({ phase: "opening", error: null });
    try {
      const snapshot = await ipc.openVault(path);
      set({
        phase: "ready",
        vaultRoot: snapshot.root,
        notes: sortNotes(snapshot.notes),
      });
    } catch (e) {
      set((s) => ({
        phase: s.vaultRoot ? "ready" : "noVault",
        error: errorMessage(e),
      }));
    }
  },

  async openNote(id: string) {
    if (get().currentId === id) return;
    await get().closeNote();
    try {
      const note = await ipc.readNote(id);
      set({
        currentId: note.id,
        content: note.content,
        mtimeMs: note.mtimeMs,
        dirty: false,
        saveState: "idle",
        conflict: null,
        backlinks: [],
      });
      void get().refreshBacklinks();
    } catch (e) {
      get().showError(errorMessage(e));
    }
  },

  /** Flush any pending save, then clear the current note. */
  async closeNote() {
    cancelScheduledSave();
    // An unresolved conflict means "my content" vs disk is still the user's
    // call — leaving the note abandons the in-editor version deliberately.
    if (get().dirty && !get().conflict) await get().saveNow();
    set({
      currentId: null,
      content: "",
      mtimeMs: 0,
      dirty: false,
      saveState: "idle",
      conflict: null,
      backlinks: [],
    });
  },

  setContent(text: string) {
    if (get().currentId === null) return;
    set({ content: text, dirty: true });
    scheduleSave(get);
  },

  async saveNow() {
    cancelScheduledSave();
    const { currentId, content, mtimeMs, dirty, conflict } = get();
    // While a conflict is unresolved, all saves are blocked — the banner's
    // explicit actions are the only way to write.
    if (!currentId || !dirty || conflict) return;
    set({ saveState: "saving" });
    try {
      const newMtime = await ipc.writeNote(currentId, content, mtimeMs);
      // Only clear dirty if nothing was typed while the write was in flight.
      const stillCurrent =
        get().currentId === currentId && get().content === content;
      set((s) => ({
        mtimeMs: s.currentId === currentId ? newMtime : s.mtimeMs,
        dirty: stillCurrent ? false : s.dirty,
        saveState: stillCurrent ? "saved" : s.saveState,
        notes: s.notes.map((n) =>
          n.id === currentId ? { ...n, mtimeMs: newMtime, size: content.length } : n,
        ),
      }));
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        // mtime precondition failed: the file changed under us mid-edit.
        set({ saveState: "error", conflict: "modified" });
      } else {
        set({ saveState: "error" });
        get().showError(errorMessage(e));
      }
    }
  },

  async createNote(title: string, folder?: string) {
    try {
      await get().closeNote();
      const meta = await ipc.createNote(title, folder);
      set((s) => ({ notes: sortNotes([...s.notes, meta]) }));
      await get().openNote(meta.id);
    } catch (e) {
      get().showError(errorMessage(e));
    }
  },

  async followWikiLink(rawTarget: string) {
    const target = normalizeTarget(rawTarget);
    if (!target) return;
    const existing = resolveTarget(get().notes, target);
    if (existing) {
      await get().openNote(existing.id);
      return;
    }
    // Phantom link: create the note, honoring a folder path in the target.
    const slash = target.lastIndexOf("/");
    const folder = slash >= 0 ? target.slice(0, slash) : undefined;
    const title = slash >= 0 ? target.slice(slash + 1) : target;
    await get().createNote(title.replace(/\.md$/i, ""), folder);
  },

  async renameNote(id: string, newTitle: string) {
    try {
      cancelScheduledSave();
      if (get().currentId === id && get().dirty) await get().saveNow();
      const meta = await ipc.renameNote(id, newTitle);
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === id ? meta : n))),
        currentId: s.currentId === id ? meta.id : s.currentId,
        mtimeMs: s.currentId === id ? meta.mtimeMs : s.mtimeMs,
      }));
    } catch (e) {
      get().showError(errorMessage(e));
    }
  },

  async deleteNote(id: string) {
    const note = get().notes.find((n) => n.id === id);
    const ok = await confirmDialog(
      `Move "${note?.title ?? id}" to the system trash?`,
      { title: "Delete note", kind: "warning" },
    );
    if (!ok) return;
    try {
      if (get().currentId === id) {
        cancelScheduledSave();
        set({ currentId: null, content: "", mtimeMs: 0, dirty: false, saveState: "idle" });
      }
      await ipc.deleteNote(id);
      set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    } catch (e) {
      get().showError(errorMessage(e));
    }
  },

  showError(message: string) {
    set({ error: message });
  },

  clearError() {
    set({ error: null, info: null });
  },

  setView(view) {
    set({ view });
    if (view === "graph") void get().loadGraph();
  },

  async loadGraph() {
    if (get().graphLoading) return;
    set((s) => ({ graphLoading: s.graph === null }));
    try {
      const graph = await ipc.getGraph();
      set({ graph, graphLoading: false });
    } catch (e) {
      set({ graphLoading: false });
      get().showError(errorMessage(e));
    }
  },

  handleFilesChanged(payload: FilesChangedPayload) {
    const { changed, removed, origin } = payload;

    // Keep the graph fresh (debounced) once it has been loaded.
    if (get().graph !== null) scheduleGraphRefresh(get);

    // Merge into the note list.
    set((s) => {
      const byId = new Map(s.notes.map((n) => [n.id, n]));
      for (const id of removed) byId.delete(id);
      for (const meta of changed) byId.set(meta.id, meta);
      return { notes: sortNotes([...byId.values()]) };
    });

    const currentId = get().currentId;
    if (!currentId) return;

    if (removed.includes(currentId)) {
      if (get().dirty) {
        set({ conflict: "deleted" });
      } else {
        void get().closeNote();
        set({ info: "The open note was deleted on disk." });
      }
      return;
    }

    const currentChanged = changed.some((n) => n.id === currentId);
    if (currentChanged && origin === "external") {
      if (get().dirty) {
        set({ conflict: "modified" });
      } else {
        // Clean → auto-reload in place.
        void (async () => {
          try {
            const note = await ipc.readNote(currentId);
            if (get().currentId !== currentId || get().dirty) return;
            set((s) => ({
              content: note.content,
              mtimeMs: note.mtimeMs,
              externalVersion: s.externalVersion + 1,
              info: "Reloaded from disk (changed externally).",
            }));
          } catch (e) {
            get().showError(errorMessage(e));
          }
        })();
      }
    }

    // Any link edit elsewhere can change this note's backlinks.
    void get().refreshBacklinks();
  },

  async refreshBacklinks() {
    const id = get().currentId;
    if (!id) return;
    try {
      const backlinks = await ipc.getBacklinks(id);
      if (get().currentId === id) set({ backlinks });
    } catch {
      // Non-fatal; panel just goes stale.
    }
  },

  async conflictReload() {
    const id = get().currentId;
    if (!id) return;
    try {
      const note = await ipc.readNote(id);
      set((s) => ({
        content: note.content,
        mtimeMs: note.mtimeMs,
        dirty: false,
        saveState: "idle",
        conflict: null,
        externalVersion: s.externalVersion + 1,
      }));
    } catch (e) {
      get().showError(errorMessage(e));
    }
  },

  async conflictKeepMine() {
    const id = get().currentId;
    if (!id) return;
    try {
      // No mtime precondition: this is the explicit overwrite.
      const newMtime = await ipc.writeNote(id, get().content);
      set({ mtimeMs: newMtime, dirty: false, saveState: "saved", conflict: null });
    } catch (e) {
      get().showError(errorMessage(e));
    }
  },

  conflictDiscard() {
    void get().closeNote();
  },
}));
