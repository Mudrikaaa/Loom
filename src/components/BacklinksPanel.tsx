import { useStore } from "../state/store";

/** Right-hand panel: notes that link to the current note, with context. */
export function BacklinksPanel() {
  const currentId = useStore((s) => s.currentId);
  const backlinks = useStore((s) => s.backlinks);
  const openNote = useStore((s) => s.openNote);

  if (!currentId) return null;

  return (
    <aside className="backlinks-panel">
      <header className="backlinks-header">
        <span>Backlinks</span>
        <span className="backlinks-count">{backlinks.length}</span>
      </header>
      {backlinks.length === 0 ? (
        <div className="backlinks-empty">
          <p className="muted">
            No backlinks yet. Reference this note elsewhere with{" "}
            <code>[[…]]</code> and it will show up here.
          </p>
        </div>
      ) : (
        <ul className="backlinks-list">
          {backlinks.map((b) => (
            <li key={b.id}>
              <button
                className="backlink-item"
                onClick={() => void openNote(b.id)}
                title={b.id}
              >
                <span className="backlink-title">{b.title}</span>
                {b.context && (
                  <span className="backlink-context">{b.context}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
