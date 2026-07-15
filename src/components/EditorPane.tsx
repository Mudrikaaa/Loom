import { useStore } from "../state/store";
import { Editor } from "../editor/Editor";
import { ConflictBanner } from "./ConflictBanner";

function SaveIndicator() {
  const dirty = useStore((s) => s.dirty);
  const saveState = useStore((s) => s.saveState);
  if (saveState === "error") return <span className="save-dot error" title="Save failed">●</span>;
  if (dirty || saveState === "saving")
    return <span className="save-dot dirty" title="Unsaved changes">●</span>;
  return <span className="save-dot clean" title="Saved">●</span>;
}

export function EditorPane() {
  const currentId = useStore((s) => s.currentId);
  const content = useStore((s) => s.content);
  const externalVersion = useStore((s) => s.externalVersion);
  const notes = useStore((s) => s.notes);

  if (!currentId) {
    return (
      <main className="editor-pane">
        <div className="editor-empty">
          <p className="muted">Select a note, or create one with ＋</p>
        </div>
      </main>
    );
  }

  const title =
    notes.find((n) => n.id === currentId)?.title ??
    currentId.replace(/\.md$/i, "");

  return (
    <main className="editor-pane">
      <header className="editor-header">
        <h1 className="editor-title">{title}</h1>
        <SaveIndicator />
      </header>
      <ConflictBanner />
      {/* key: external reloads replace the document → fresh editor view */}
      <Editor
        key={`${currentId}#${externalVersion}`}
        noteId={currentId}
        initialDoc={content}
      />
    </main>
  );
}
