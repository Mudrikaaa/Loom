# Loom — Architecture

A case study of a local-first Markdown notes app with a 3D knowledge graph.
Stack: Tauri 2 (Rust backend) + React 19/TypeScript, CodeMirror 6 editor,
Three.js graph rendering.

## 1. Process boundaries

The rule that shaped everything: **Rust owns anything that touches disk or
scales with vault size; the frontend renders and interacts.** The UI never
re-derives vault state — it is a subscriber.

```
┌────────────────────────────── Tauri app ──────────────────────────────┐
│                                                                       │
│  Rust core (src-tauri)                Frontend (src/)                 │
│  ┌─────────────────────────┐          ┌──────────────────────────┐    │
│  │ vault.rs   fs ops, scan │ commands │ state/store.ts (Zustand) │    │
│  │ index/     link index   │ ◄──────► │ editor/  CodeMirror 6    │    │
│  │  parser.rs  wikilinks   │          │ graph/   Three.js views  │    │
│  │  resolver.rs targets    │  events  │ components/ panels, UI   │    │
│  │  mod.rs     fwd/back    │ ───────► │ lib/ipc.ts typed wrappers│    │
│  │ watcher.rs notify+deb.  │          └──────────────────────────┘    │
│  │ commands.rs, events.rs  │                                          │
│  └─────────────────────────┘                                          │
└───────────────────────────────────────────────────────────────────────┘
```

- **Commands** (request/response): `open_vault`, `read_note`, `write_note`,
  `create/rename/delete_note`, `get_backlinks`, `get_graph`, `search`,
  `list_notes`, `get_last_vault`.
- **Events** (push): `vault://files-changed { origin: self|external,
  changed: NoteMeta[], removed: id[] }` — the single channel through which
  the UI learns about index changes.

## 2. Data model

- **NoteId** = normalized vault-relative path with forward slashes
  (`topics/Graph Theory.md`). Ids are validated component-by-component so
  they can never escape the vault root.
- **`VaultIndex`** (in-memory, Rust):
  - `notes: id → NoteMeta` (title, mtime, size)
  - `contents: id → { original, lowercase }` (retained for search; ~1 KB/note)
  - `forward: id → [Edge { raw, key, resolved: Option<id>, context }]`
  - `backlinks: id → {source ids}` (derived, kept consistent on every mutation)
  - `target_index: normalized-target-key → {source ids}` — the trick that
    makes updates incremental (below)
  - `resolver`: `lowercase basename → ids` + `lowercase relpath → id`

### Wikilink resolution rules

`[[Target#anchor]]` / `[[Target|label]]`: anchor and label are ignored for
resolution; matching is case-insensitive and a trailing `.md` is optional.
A target containing `/` resolves by full vault-relative path; a bare target
resolves by title (basename), and duplicate titles resolve to the
shallowest path (ties broken lexicographically). Unresolved targets become
**phantoms**: dashed in the editor, dim nodes in the graph, click-to-create.

### The incremental invariant

Rebuilding a 10k-note index takes ~1.6 s — fine once at vault open,
unacceptable per keystroke. So:

1. A file event re-parses **only that file**, then diffs its old vs. new
   outgoing edges, patching `backlinks` and `target_index`.
2. Creating/removing/renaming a note must also fix *other* notes' links that
   point at it (a phantom may now resolve; a resolved link may now dangle).
   `target_index` maps every normalized target key to the notes that use it,
   so only those edges re-resolve — never the whole vault. Any edge that
   resolved to note X necessarily used X's title key or path key, so the
   affected set is exact.

Measured cost of one incremental update at 10k notes: **~12 µs**.

This invariant is unit-tested; the tests caught a real bug during
development (a rename moved the backlink set wholesale to the new name,
when each incoming link — still written as `[[OldName]]` — must re-resolve
individually, usually to a phantom).

## 3. File watching & the conflict policy

`notify` (recommended watcher) feeds a worker thread that batches events in
a 300 ms debounce window, filters to `.md`, skips dot/dependency folders,
and classifies by existence check (create/modify vs. remove — renames arrive
as remove+create pairs on Windows).

**Self-write suppression**: every mutating command records its absolute path
in a short-lived set before writing; the watcher drops events for those
paths. Commands update the index synchronously themselves and emit their own
`files-changed` (origin `self`), so watcher traffic is purely external —
no echo loops, and the UI can distinguish "my own save" from "someone else
touched this file."

**Conflict policy** (fully implemented, not just documented):

| State of open note | External event | Behavior |
| --- | --- | --- |
| clean | modified | auto-reload in place, informational toast |
| dirty | modified | banner: *Reload from disk* / *Keep mine (overwrite)*; all saves blocked until resolved |
| dirty | save hits changed mtime | same banner (every save carries an mtime precondition; the write is refused server-side with a structured `conflict` error) |
| dirty | deleted | banner: *Discard my version* / *Restore my version* |
| clean | deleted | note closes, toast |

The precondition lives in Rust (`write_note(expected_mtime)`), so the race
window is the filesystem's, not the UI's.

## 4. Editor (CodeMirror 6)

- **Wikilink grammar**: no maintained CM6 wikilink extension existed on npm
  (verified at build time), so Loom uses `@lezer/markdown`'s official
  `MarkdownConfig` extension API — a ~70-line inline parser that adds real
  `WikiLink / WikiLinkMark / WikiLinkTarget / WikiLinkLabel` nodes to the
  parse tree. Parser-integrated and incremental; not regex-on-strings.
- **Inline live preview**: a `ViewPlugin` walks the syntax tree over the
  *visible ranges only* and hides formatting marks (`#`, `**`, `` ` ``,
  `[[ ]]`, quote `>`, link URLs) unless the selection touches the enclosing
  element — the Obsidian-style reveal pattern, original implementation.
  Widgets replace list bullets (•), horizontal rules, and task markers
  (clickable checkboxes that edit the underlying `[x]`).
- The editor resolves wikilinks against the note list through a facet for
  instant phantom/resolved styling; the authoritative resolution stays in
  Rust. Autocomplete on `[[` is served from the store's note list.

## 5. Graph: two renderers, one threshold

The stress test made this a story about draw calls.

- **≤ 2000 nodes — library path** (`react-force-graph-3d`): per-object
  rendering, adaptive bloom, depth fog, text labels below 400 nodes,
  hover-focus (neighbors stay lit, the rest dims). Comfortable at ~27 fps
  @ 1.2k nodes on integrated graphics.
- **> 2000 nodes — instanced fast path** (`BigGraph.tsx`, custom): the
  measured problem was 5 fps at 5.5k nodes, because per-object rendering
  means one draw call per node *and per link* (~45k). The fast path draws
  the same scene in **two draw calls**: one `InstancedMesh` for all nodes
  (per-instance transform + color) and one `LineSegments` batch for all
  links. Layout comes from the same `d3-force-3d` engine; orbit/zoom/pan,
  raycast hover-focus, and click-to-open are reimplemented directly.
  Result: **60 fps at 10.5k nodes / 80k links** (screenshot-verified).

Graph data is a Rust-side snapshot (`get_graph`, ~50 ms at 10k) refreshed
on a 1.5 s debounce after index changes; phantom nodes are synthesized from
unresolved edges grouped by normalized target key.

Debugging war story: the black-viewport bug. Calling
`d3ReheatSimulation()` in a mount effect crashed the engine (`undefined
.tick()`) because the library ingests graph data asynchronously — the
exception killed its render loop, leaving a live page with a dead canvas.
Diagnosed by instrumenting the app to POST uncaught errors to a local
collector; fixed by configuring forces without reheating.

## 6. Search

Sequential scan in Rust over in-memory lowercase text (title + body),
AND-semantics across whitespace-separated terms, ranked: title-prefix (120)
> title-contains (60) > body occurrences (8 + count, capped). Snippets are
extracted line-by-line from the *original* text so multi-byte lowercasing
can never misalign offsets. Measured 22–44 ms per query at 10k notes —
comfortably inside the UI's 150 ms debounce. No search database: the index
is rebuilt from disk on vault open (2.9 s at 10k) and patched incrementally
afterwards, so there is nothing to corrupt or migrate.

## 7. Frontend state

One Zustand store owns: vault snapshot, current note (content, mtime, dirty,
save state), conflict state machine, backlinks, graph snapshot, search
state, and view routing (editor vs. graph). Mutations flow through store
actions only, which keeps the autosave lifecycle (800 ms debounce + flush on
note switch + Ctrl+S) and the conflict blocking in one place. The store
module rejects HMR (`import.meta.hot.invalidate`) — a hot-swapped store is a
fresh instance stuck at boot with nobody left to boot it.

## 8. Testing & tooling

- **Unit tests** (Rust): parser edge cases (code fences, malformed links),
  resolver rules (paths, duplicate titles), index invariants (incremental
  backlinks, rename semantics), search ranking. The rename and
  search-after-build tests each caught a real implementation bug.
- **`genvault`**: deterministic synthetic-vault generator (note count, link
  density, phantom %, folder spread, seed); embeds code fences containing
  fake `[[links]]` that the indexer must ignore.
- **`benchindex`**: times full build, graph snapshot, incremental upsert,
  search, and backlink queries against any vault.
- **Dev graph harness**: `?graphtest=N` renders the graph view with N
  synthetic nodes in a plain browser (no Tauri) for visual debugging.
