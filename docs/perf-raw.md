# Raw stress-test data (working notes)

Machine: HP dv2041tu, Windows 11 Home, release builds (rustc 1.97).
Date: 2026-07-15.

## Synthetic vault generation (genvault, seed 42)

| Vault | Notes | Links | Phantom links | Gen time |
| --- | --- | --- | --- | --- |
| vault-1k | 1,000 | 5,949 | 303 | 3.0 s |
| vault-5k | 5,000 | 39,863 | 1,973 | 14.6 s |
| vault-10k | 10,000 | 80,051 | 3,985 | 31.7 s |

## Index benchmarks (benchindex, release)

| Metric | 1k | 5k | 10k |
| --- | --- | --- | --- |
| Full index build (vault open) | 165 ms | 804 ms | 1.60 s |
| Graph snapshot | 2.6 ms (1,223 n / 5,924 l) | 23.6 ms (5,492 n / 39,820 l) | 50.7 ms (10,500 n / 80,015 l) |
| Incremental upsert (1 file, avg 100) | 9.8 µs | 10.5 µs | 11.6 µs |
| Backlinks query (avg 1000) | 5.6 µs | 10.1 µs | 9.7 µs |

Notes:
- Full build is a one-time cost per vault open, on an async command (UI spinner).
- Incremental upsert is the per-file-event cost: effectively free at any scale.
- Graph snapshot excludes IPC serialization; frontend refresh is debounced 1.5 s.

## Frontend FPS (3D graph, in-app meter) — to be filled from user readings

| Vault | Initial layout | After settle | Interaction (orbit/zoom) |
| --- | --- | --- | --- |
| user vault | | | |
| vault-5k | | | |
| vault-10k | | | |
