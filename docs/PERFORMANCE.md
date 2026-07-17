# Loom — Performance report

**Requirement**: "Handle a vault with thousands of notes without freezing
the UI — validate this with a synthetic test vault, don't assume it."
This report is the validation.

## Methodology

- Machine: HP laptop (dv2041tu), Windows 11 Home, integrated graphics.
  All numbers are from this machine — a deliberately modest baseline.
- Rust measurements: `benchindex` (release build, rustc 1.97) against
  deterministic vaults from `genvault` (seed 42).
- FPS: measured by the in-app meter (rAF-based) in the running dev app,
  read from user-captured screenshots — not extrapolated.

Synthetic vaults:

| Vault | Notes | Links | Phantom links |
| --- | --- | --- | --- |
| vault-1k | 1,000 | 5,949 | 303 |
| vault-5k | 5,000 | 39,863 | 1,973 |
| vault-10k | 10,000 | 80,051 | 3,985 |

Generated content includes headings, paragraphs, lists, labeled links, and
fenced code blocks containing fake `[[links]]` the indexer must ignore.

## Rust core (release)

| Metric | 1k | 5k | 10k |
| --- | --- | --- | --- |
| Full index build (vault open, incl. search text) | 165 ms¹ | 804 ms¹ | 2.9 s |
| Graph snapshot | 2.6 ms | 23.6 ms | 50.7 ms |
| Incremental upsert (1 file, avg of 100) | 9.8 µs | 10.5 µs | 11.6 µs |
| Backlinks query (avg of 1000) | 5.6 µs | 10.1 µs | 9.7 µs |
| Search `"graph"` (50-hit cap) | — | — | 41.7 ms |
| Search `"lattice kernel"` (AND) | — | — | 43.7 ms |
| Search `"note 00042"` | — | — | 22.7 ms |

¹ measured before search-text retention was added; 10k figure includes it.

The headline: **incremental update cost is flat (~10 µs) regardless of
vault size** — the whole point of the `target_index` design. Vault open is
the only O(vault) operation, and it runs on an async command behind a
spinner.

## Graph rendering (FPS, user-verified)

| Vault | Renderer | FPS |
| --- | --- | --- |
| vault-1k (1,223 n / 5,924 l) | library (per-object, bloom, fog, hover) | 27–29 |
| vault-5k (5,492 n / 39,820 l) | library — *before* fast path | **5 (unacceptable)** |
| vault-5k (5,492 n / 39,820 l) | instanced fast path | **60** |
| vault-10k (10,500 n / 80,015 l) | instanced fast path | **60** |

The 5 fps failure was a draw-call problem (one Three.js object per node and
per link ≈ 45k draw calls), not a triangle-count problem. The fast path
(`BigGraph.tsx`) renders all nodes as a single `InstancedMesh` and all links
as a single `LineSegments` batch — two draw calls — and locked to 60 fps at
both scales. During the initial force-layout settle the frame rate is
bounded by the physics tick on the main thread (visibly chunky for the
first seconds at 10k), then locks to 60; sidebar and editor stay responsive
throughout.

## Typing latency

Autosave writes + incremental index updates cost ~10 µs per event in the
index plus one file write; with the watcher active there is no measurable
typing lag at any tested vault size (self-writes are suppressed from the
watcher, so typing generates no watcher traffic at all).

## Reproducing

```sh
cd src-tauri
cargo run --release --bin genvault -- --out <DIR> --notes 10000 --avg-links 8
cargo run --release --bin benchindex -- <DIR>
```

Raw working notes: [perf-raw.md](perf-raw.md).
