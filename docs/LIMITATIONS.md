# Loom — Known limitations & roadmap

## Known limitations

1. **Editor rendering gaps.** Images render as raw Markdown (no inline
   preview); tables stay plain text; setext headings get basic treatment.
   The live-preview pass covers headings, emphasis, code, quotes, lists,
   tasks, rules, links, and wikilinks.
2. **External rename ≠ rename.** A rename done outside the app arrives as
   delete+create (filesystem watchers can't reliably say otherwise), so an
   open note renamed externally is treated as deleted (conflict banner if
   dirty). In-app renames are first-class.
3. **Leaving an unresolved conflict abandons your in-editor version.**
   If the conflict banner is up and you switch notes anyway, the disk
   version wins (your unsaved text is discarded). The banner is prominent,
   but the escape hatch is deliberate rather than blocking navigation.
4. **Phantom/resolved link styling refreshes lazily.** After creating or
   renaming a note, wikilinks elsewhere update their editor styling on the
   next edit/selection change, not instantly. (Index and graph are correct
   immediately.)
5. **External auto-reload resets the cursor.** When a clean open note is
   reloaded from disk, the editor view is rebuilt and the caret returns to
   the start.
6. **Fast-path graph trades glamour for speed.** Above 2,000 nodes: no
   bloom, no always-on labels (hover tooltip instead), and layout settle is
   main-thread-bound (chunky first seconds at 10k).
7. **Search is substring-based.** No fuzzy matching, no stemming, no
   phrase queries; AND-only semantics, 50-result cap.
8. **Single window, single vault.** One vault open at a time; no
   multi-pane editing.
9. **Platforms.** Only Windows 11 is tested. macOS/Linux are expected to
   work via Tauri but are unverified (notably the file watcher and trash
   behavior differ per-OS).
10. **Vault scale ceiling untested beyond 10k.** Everything is verified to
    10k notes / 80k links; beyond that the O(vault) vault-open cost (~2.9 s
    at 10k) and graph settle time will grow first.

## Documented stretch ideas (explicitly out of MVP scope, per the brief)

Semantic/AI-suggested links · git-based graph time-travel · command palette ·
tag-based graph coloring · daily-note mode.

## Five upgrade ideas beyond the stretch list

1. **Layout in a Web Worker.** Run `d3-force-3d` off the main thread and
   stream positions back per tick — smooth 60 fps *during* settle at 10k+,
   and the door to even larger vaults.
2. **Rename refactoring.** On in-app rename, rewrite `[[OldName]]` →
   `[[NewName]]` across the vault behind a preview dialog (the index
   already knows every affected file and edge — this is UI, not plumbing).
3. **Local graph mode.** A one-hop/two-hop neighborhood view centered on
   the current note — often more useful day-to-day than the full
   constellation, and trivially fast at any vault size.
4. **Transclusion (`![[Note]]`).** Render embedded notes inline in live
   preview, with cycle detection — the parser and resolver already
   understand the target syntax.
5. **Index persistence + fuzzy search.** Cache the index on disk (rebuild
   only changed files on open, cutting the 2.9 s cold start to near-zero)
   and upgrade search with a trigram/fuzzy layer (typo tolerance, phrase
   queries) — e.g., embedded tantivy.
