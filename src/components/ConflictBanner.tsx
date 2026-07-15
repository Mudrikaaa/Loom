import { useStore } from "../state/store";

/**
 * The visible half of the conflict policy: shown when the open note is dirty
 * and the file changed (or vanished) on disk. Saves stay blocked until the
 * user picks a side.
 */
export function ConflictBanner() {
  const conflict = useStore((s) => s.conflict);
  const conflictReload = useStore((s) => s.conflictReload);
  const conflictKeepMine = useStore((s) => s.conflictKeepMine);
  const conflictDiscard = useStore((s) => s.conflictDiscard);

  if (!conflict) return null;

  return (
    <div className="conflict-banner" role="alert">
      <span className="conflict-text">
        {conflict === "modified"
          ? "This file changed on disk while you were editing."
          : "This file was deleted on disk while you were editing."}
      </span>
      <span className="conflict-actions">
        {conflict === "modified" ? (
          <>
            <button className="btn-conflict" onClick={() => void conflictReload()}>
              Reload from disk (discard my edits)
            </button>
            <button className="btn-conflict primary" onClick={() => void conflictKeepMine()}>
              Keep mine (overwrite)
            </button>
          </>
        ) : (
          <>
            <button className="btn-conflict" onClick={() => conflictDiscard()}>
              Discard my version
            </button>
            <button className="btn-conflict primary" onClick={() => void conflictKeepMine()}>
              Restore my version
            </button>
          </>
        )}
      </span>
    </div>
  );
}
