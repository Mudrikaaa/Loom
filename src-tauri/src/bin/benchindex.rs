//! Index performance harness: times the operations that matter for the
//! "thousands of notes without freezing" requirement, against a real vault
//! folder (typically one produced by `genvault`).
//!
//! Usage: cargo run --release --bin benchindex -- <VAULT_DIR>

use std::time::Instant;

use loom_lib::index::VaultIndex;
use loom_lib::vault::Vault;

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: benchindex <VAULT_DIR>");
        std::process::exit(2);
    });

    let vault = Vault::open(&path).expect("open vault");

    // Full build (what `open_vault` does).
    let t = Instant::now();
    let mut index = VaultIndex::build(&vault).expect("build index");
    let build_time = t.elapsed();
    let notes = index.notes();
    println!("notes:            {}", notes.len());
    println!("full index build: {build_time:?}");

    // Graph snapshot (what the graph view requests).
    let t = Instant::now();
    let graph = index.graph();
    println!(
        "graph snapshot:   {:?} ({} nodes, {} links)",
        t.elapsed(),
        graph.nodes.len(),
        graph.links.len()
    );

    // Incremental single-file update (what one watcher event costs).
    if let Some(meta) = notes.first().cloned() {
        let note = vault.read_note(&meta.id).expect("read note");
        let t = Instant::now();
        const REPS: u32 = 100;
        for _ in 0..REPS {
            index.upsert_note(&meta.id, &note.content, meta.clone());
        }
        println!("incremental upsert (avg of {REPS}): {:?}", t.elapsed() / REPS);
    }

    // Search latency (what one debounced keystroke costs).
    for query in ["graph", "lattice kernel", "note 00042"] {
        let t = Instant::now();
        let hits = index.search(query, 50);
        println!(
            "search {query:?}:   {:?} ({} hits)",
            t.elapsed(),
            hits.len()
        );
    }

    // Backlink queries (what opening a note costs).
    let t = Instant::now();
    let mut total = 0usize;
    for meta in notes.iter().take(1000) {
        total += index.backlinks(&meta.id).len();
    }
    println!(
        "backlinks query (avg of {}): {:?} ({} entries total)",
        notes.len().min(1000),
        t.elapsed() / notes.len().min(1000) as u32,
        total
    );
}
