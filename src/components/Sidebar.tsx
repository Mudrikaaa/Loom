import { useState } from "react";
import { useStore } from "../state/store";
import { LoomLogo } from "./Logo";
import { SearchBar, Highlight } from "./SearchBar";
import type { NoteMeta } from "../lib/types";

function vaultName(root: string): string {
  const parts = root.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

function NoteRow({ note, active }: { note: NoteMeta; active: boolean }) {
  const openNote = useStore((s) => s.openNote);
  const renameNote = useStore((s) => s.renameNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(note.title);

  if (renaming) {
    return (
      <li className="note-row">
        <input
          className="inline-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              setRenaming(false);
              void renameNote(note.id, draft.trim());
            } else if (e.key === "Escape") {
              setRenaming(false);
              setDraft(note.title);
            }
          }}
          onBlur={() => {
            setRenaming(false);
            setDraft(note.title);
          }}
        />
      </li>
    );
  }

  const folder = note.id.includes("/")
    ? note.id.slice(0, note.id.lastIndexOf("/"))
    : null;

  return (
    <li className={`note-row${active ? " active" : ""}`}>
      <button
        className="note-row-main"
        onClick={() => void openNote(note.id)}
        title={note.id}
      >
        <span className="note-title">{note.title}</span>
        {folder && <span className="note-folder">{folder}</span>}
      </button>
      <span className="note-actions">
        <button
          className="icon-btn"
          title="Rename"
          onClick={() => {
            setDraft(note.title);
            setRenaming(true);
          }}
        >
          ✎
        </button>
        <button
          className="icon-btn danger"
          title="Delete (moves to system trash)"
          onClick={() => void deleteNote(note.id)}
        >
          🗑
        </button>
      </span>
    </li>
  );
}

export function Sidebar() {
  const vaultRoot = useStore((s) => s.vaultRoot);
  const notes = useStore((s) => s.notes);
  const currentId = useStore((s) => s.currentId);
  const pickVault = useStore((s) => s.pickVault);
  const createNote = useStore((s) => s.createNote);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const searchQuery = useStore((s) => s.searchQuery);
  const searchResults = useStore((s) => s.searchResults);
  const openNote = useStore((s) => s.openNote);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const searching = searchResults !== null;

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <LoomLogo size={20} />
      </div>
      <header className="sidebar-header">
        <button
          className="vault-name"
          title={`${vaultRoot}\nClick to switch vault`}
          onClick={() => void pickVault()}
        >
          {vaultRoot ? vaultName(vaultRoot) : "Vault"}
        </button>
        <span className="header-actions">
          <button
            className={`icon-btn graph-toggle${view === "graph" ? " on" : ""}`}
            title={view === "graph" ? "Back to editor" : "Open 3D graph"}
            onClick={() => setView(view === "graph" ? "editor" : "graph")}
          >
            ◈
          </button>
          <button
            className="icon-btn plus-btn"
            title="New note"
            onClick={() => {
              setNewTitle("");
              setCreating(true);
            }}
          >
            ＋
          </button>
        </span>
      </header>

      <SearchBar />

      {creating && (
        <div className="new-note-box">
          <input
            className="inline-input"
            autoFocus
            placeholder="Note title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                setCreating(false);
                void createNote(newTitle.trim());
              } else if (e.key === "Escape") {
                setCreating(false);
              }
            }}
            onBlur={() => setCreating(false)}
          />
        </div>
      )}

      {searching ? (
        searchResults.length === 0 ? (
          <div className="sidebar-empty">
            <p className="muted">No matches for “{searchQuery}”.</p>
          </div>
        ) : (
          <ul className="note-list">
            {searchResults.map((hit) => (
              <li
                key={hit.id}
                className={`note-row${hit.id === currentId ? " active" : ""}`}
              >
                <button
                  className="note-row-main"
                  onClick={() => void openNote(hit.id)}
                  title={hit.id}
                >
                  <span className="note-title">
                    <Highlight text={hit.title} query={searchQuery} />
                  </span>
                  {hit.snippet && (
                    <span className="result-snippet">
                      <Highlight text={hit.snippet} query={searchQuery} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : notes.length === 0 ? (
        <div className="sidebar-empty">
          <p>No notes yet.</p>
          <p className="muted">
            Click <strong>＋</strong> to create your first note.
          </p>
        </div>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} active={n.id === currentId} />
          ))}
        </ul>
      )}

      <footer className="sidebar-footer">
        {searching
          ? `${searchResults.length} match${searchResults.length === 1 ? "" : "es"}`
          : `${notes.length} note${notes.length === 1 ? "" : "s"}`}
      </footer>
    </aside>
  );
}
