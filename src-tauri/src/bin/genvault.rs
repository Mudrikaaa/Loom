//! Synthetic vault generator for stress-testing Loom.
//!
//! Usage:
//!   cargo run --release --bin genvault -- --out <DIR> [--notes 5000]
//!       [--avg-links 8] [--phantom-pct 5] [--folders 6] [--seed 42]
//!
//! Produces `--notes` Markdown files spread over `--folders` subfolders, each
//! with headings, paragraphs, lists, an occasional code fence (containing a
//! fake [[link]] that must NOT be indexed), and on average `--avg-links`
//! wikilinks. `--phantom-pct` percent of links point at nonexistent notes.
//! Deterministic for a given seed.

use std::fs;
use std::path::PathBuf;

struct Args {
    out: PathBuf,
    notes: usize,
    avg_links: usize,
    phantom_pct: u64,
    folders: usize,
    seed: u64,
}

fn parse_args() -> Result<Args, String> {
    let mut out = None;
    let mut notes = 5000usize;
    let mut avg_links = 8usize;
    let mut phantom_pct = 5u64;
    let mut folders = 6usize;
    let mut seed = 42u64;

    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        let key = argv[i].as_str();
        let val = argv
            .get(i + 1)
            .ok_or_else(|| format!("missing value for {key}"))?;
        match key {
            "--out" => out = Some(PathBuf::from(val)),
            "--notes" => notes = val.parse().map_err(|_| format!("bad --notes: {val}"))?,
            "--avg-links" => {
                avg_links = val.parse().map_err(|_| format!("bad --avg-links: {val}"))?
            }
            "--phantom-pct" => {
                phantom_pct = val.parse().map_err(|_| format!("bad --phantom-pct: {val}"))?
            }
            "--folders" => folders = val.parse().map_err(|_| format!("bad --folders: {val}"))?,
            "--seed" => seed = val.parse().map_err(|_| format!("bad --seed: {val}"))?,
            other => return Err(format!("unknown flag: {other}")),
        }
        i += 2;
    }
    Ok(Args {
        out: out.ok_or("--out <DIR> is required")?,
        notes,
        avg_links,
        phantom_pct,
        folders: folders.max(1),
        seed,
    })
}

/// xorshift64* — tiny deterministic PRNG, no dependencies.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }
    fn below(&mut self, n: u64) -> u64 {
        if n == 0 {
            0
        } else {
            self.next() % n
        }
    }
}

const WORDS: &[&str] = &[
    "graph", "thread", "loom", "weave", "signal", "lattice", "kernel", "memory",
    "vector", "prism", "cursor", "packet", "orbit", "cache", "quartz", "cipher",
    "meadow", "harbor", "circuit", "ember", "argon", "fable", "tensor", "mosaic",
    "drift", "anchor", "beacon", "canvas", "delta", "echo", "flux", "glyph",
];

fn title_for(i: usize) -> String {
    format!("Note {i:05}")
}

fn folder_for(i: usize, folders: usize) -> Option<String> {
    let f = i % folders;
    if f == 0 {
        None
    } else {
        Some(format!("topic-{f}"))
    }
}

fn sentence(rng: &mut Rng, links: &mut Vec<String>) -> String {
    let len = 6 + rng.below(10) as usize;
    let mut parts: Vec<String> = Vec::with_capacity(len);
    for _ in 0..len {
        parts.push(WORDS[rng.below(WORDS.len() as u64) as usize].to_string());
    }
    // Splice pending links into the sentence.
    while let Some(link) = links.pop() {
        let at = rng.below(parts.len() as u64) as usize;
        parts.insert(at, link);
        if rng.below(2) == 0 {
            break;
        }
    }
    let mut s = parts.join(" ");
    s.get_mut(0..1).map(|c| c.make_ascii_uppercase());
    s.push('.');
    s
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("genvault: {e}");
            eprintln!("usage: genvault --out <DIR> [--notes N] [--avg-links L] [--phantom-pct P] [--folders F] [--seed S]");
            std::process::exit(2);
        }
    };
    let mut rng = Rng(args.seed | 1);
    let started = std::time::Instant::now();
    let mut total_links = 0usize;
    let mut total_phantoms = 0usize;

    for i in 0..args.notes {
        // Uniform 0..2L keeps the mean at L with variety.
        let n_links = rng.below(2 * args.avg_links as u64 + 1) as usize;
        let mut links: Vec<String> = Vec::with_capacity(n_links);
        for _ in 0..n_links {
            if rng.below(100) < args.phantom_pct {
                links.push(format!("[[Phantom {}]]", rng.below(500)));
                total_phantoms += 1;
            } else {
                let t = rng.below(args.notes as u64) as usize;
                if rng.below(10) == 0 {
                    links.push(format!("[[{}|see also]]", title_for(t)));
                } else {
                    links.push(format!("[[{}]]", title_for(t)));
                }
            }
            total_links += 1;
        }

        let title = title_for(i);
        let mut body = format!("# {title}\n\n");
        let paragraphs = 2 + rng.below(3);
        for p in 0..paragraphs {
            let sentences = 2 + rng.below(3);
            for _ in 0..sentences {
                body.push_str(&sentence(&mut rng, &mut links));
                body.push(' ');
            }
            body.push_str("\n\n");
            if p == 0 && rng.below(3) == 0 {
                body.push_str("## Details\n\n");
            }
        }
        if rng.below(4) == 0 {
            body.push_str("- first point\n- second point with **bold**\n- [ ] a task\n\n");
        }
        if i % 10 == 0 {
            // Fenced code containing a fake link: the indexer must skip it.
            body.push_str("```rust\nlet not_a_link = \"[[NotALink]]\";\n```\n\n");
        }
        // Flush any links that didn't get spliced.
        for link in links.drain(..) {
            body.push_str(&link);
            body.push(' ');
        }

        let dir = match folder_for(i, args.folders) {
            Some(f) => args.out.join(f),
            None => args.out.clone(),
        };
        fs::create_dir_all(&dir).expect("create folder");
        fs::write(dir.join(format!("{title}.md")), body).expect("write note");
    }

    println!(
        "generated {} notes ({} links, {} phantom) in {:?} at {}",
        args.notes,
        total_links,
        total_phantoms,
        started.elapsed(),
        args.out.display()
    );
}
