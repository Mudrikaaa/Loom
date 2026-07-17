import { Fragment } from "react";
import { useStore } from "../state/store";

/** Wrap query terms in <mark> for result highlighting. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0 || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i}>{part}</mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchBar() {
  const searchQuery = useStore((s) => s.searchQuery);
  const searchResults = useStore((s) => s.searchResults);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const clearSearch = useStore((s) => s.clearSearch);
  const openNote = useStore((s) => s.openNote);

  return (
    <div className="search-box">
      <span className="search-icon" aria-hidden>
        ⌕
      </span>
      <input
        className="search-input"
        placeholder="Search vault…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            clearSearch();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Enter" && searchResults?.length) {
            void openNote(searchResults[0].id);
          }
        }}
      />
      {searchQuery && (
        <button className="search-clear" title="Clear (Esc)" onClick={clearSearch}>
          ✕
        </button>
      )}
    </div>
  );
}
