//! The vault link index: forward links, backlinks, and target resolution,
//! maintained **incrementally**.
//!
//! Invariants:
//! - A file event re-parses only that file.
//! - Adding/removing/renaming a note re-resolves only the edges whose raw
//!   target could refer to it (tracked via `target_index`), never the whole
//!   vault.
//! - `backlinks` is kept consistent with `forward` on every mutation.

pub mod parser;
pub mod resolver;

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::vault::{NoteMeta, Vault};
use parser::parse_wikilinks;
use resolver::{keys_for_note, normalize_key, Resolver};

#[derive(Debug, Clone)]
pub struct Edge {
    pub raw: String,
    pub key: String,
    pub resolved: Option<String>,
    pub context: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkEntry {
    pub id: String,
    pub title: String,
    pub context: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    /// "note" or "phantom" (an unresolved wikilink target).
    pub kind: &'static str,
    pub degree: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphLink {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub links: Vec<GraphLink>,
}

/// Note body kept in memory for search: original for snippets, lowercase
/// for case-insensitive matching. ~1 KB/note ⇒ ~10 MB at 10k notes.
#[derive(Debug, Default)]
struct NoteText {
    original: String,
    lower: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    /// First matching line (trimmed/capped); empty for title-only matches.
    pub snippet: String,
}

#[derive(Debug, Default)]
pub struct VaultIndex {
    notes: HashMap<String, NoteMeta>,
    contents: HashMap<String, NoteText>,
    forward: HashMap<String, Vec<Edge>>,
    backlinks: HashMap<String, HashSet<String>>,
    /// normalized target key → sources that have an edge with that key.
    target_index: HashMap<String, HashSet<String>>,
    resolver: Resolver,
}

impl VaultIndex {
    /// Full build on vault open: read every note, then resolve every edge.
    pub fn build(vault: &Vault) -> std::io::Result<Self> {
        let mut index = VaultIndex::default();
        let metas = vault.scan();

        // Phase 1: register all notes so resolution sees the complete set.
        for meta in &metas {
            index.notes.insert(meta.id.clone(), meta.clone());
            index.resolver.add(&meta.id);
        }
        // Phase 2: parse, resolve, and retain text for search.
        for meta in metas {
            if let Ok(note) = vault.read_note(&meta.id) {
                index.set_edges(&meta.id, index_edges(&index.resolver, &note.content));
                index.contents.insert(
                    meta.id.clone(),
                    NoteText {
                        lower: note.content.to_lowercase(),
                        original: note.content,
                    },
                );
            }
        }
        Ok(index)
    }

    pub fn contains(&self, id: &str) -> bool {
        self.notes.contains_key(id)
    }

    pub fn notes(&self) -> Vec<NoteMeta> {
        self.notes.values().cloned().collect()
    }

    pub fn backlinks(&self, id: &str) -> Vec<BacklinkEntry> {
        let Some(sources) = self.backlinks.get(id) else {
            return Vec::new();
        };
        let mut entries: Vec<BacklinkEntry> = Vec::new();
        for source in sources {
            let Some(meta) = self.notes.get(source) else { continue };
            // First linking occurrence provides the context snippet.
            let context = self
                .forward
                .get(source)
                .and_then(|edges| {
                    edges
                        .iter()
                        .find(|e| e.resolved.as_deref() == Some(id))
                        .map(|e| e.context.clone())
                })
                .unwrap_or_default();
            entries.push(BacklinkEntry {
                id: source.clone(),
                title: meta.title.clone(),
                context,
            });
        }
        entries.sort_by_key(|a| a.title.to_lowercase());
        entries
    }

    /// Case-insensitive AND search over titles + bodies. Ranking: title
    /// prefix > title contains > body match count. Sequential scan over the
    /// in-memory lowercase text — measured single-digit ms at 10k notes.
    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let terms: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .take(8)
            .map(String::from)
            .collect();
        if terms.is_empty() {
            return Vec::new();
        }

        let mut scored: Vec<(i64, SearchHit)> = Vec::new();
        for (id, meta) in &self.notes {
            let title_lower = meta.title.to_lowercase();
            let text = self.contents.get(id);
            let mut score = 0i64;
            let mut matched_all = true;
            let mut body_matched = false;

            for term in &terms {
                let in_title = title_lower.contains(term.as_str());
                if in_title {
                    score += if title_lower.starts_with(term.as_str()) {
                        120
                    } else {
                        60
                    };
                }
                let body_hits = text
                    .map(|t| t.lower.matches(term.as_str()).take(20).count())
                    .unwrap_or(0);
                if body_hits > 0 {
                    body_matched = true;
                    score += 8 + body_hits as i64;
                }
                if !in_title && body_hits == 0 {
                    matched_all = false;
                    break;
                }
            }
            if !matched_all {
                continue;
            }

            let snippet = if body_matched {
                text.map(|t| snippet_for(&t.original, &terms)).unwrap_or_default()
            } else {
                String::new()
            };
            scored.push((
                score,
                SearchHit {
                    id: id.clone(),
                    title: meta.title.clone(),
                    snippet,
                },
            ));
        }

        scored.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.title.to_lowercase().cmp(&b.1.title.to_lowercase()))
        });
        scored.into_iter().take(limit).map(|(_, h)| h).collect()
    }

    /// Snapshot of the whole graph: every note (including isolated ones),
    /// phantom nodes for unresolved targets, deduplicated links.
    pub fn graph(&self) -> GraphData {
        let mut degree: HashMap<String, usize> = HashMap::new();
        let mut links: Vec<GraphLink> = Vec::new();
        // phantom key → display title
        let mut phantoms: HashMap<String, String> = HashMap::new();

        for (source, edges) in &self.forward {
            let mut seen: HashSet<String> = HashSet::new();
            for edge in edges {
                let target_id = match &edge.resolved {
                    Some(id) => {
                        if id == source {
                            continue; // self-links add noise, skip
                        }
                        id.clone()
                    }
                    None => {
                        let display = edge
                            .raw
                            .split('#')
                            .next()
                            .unwrap_or(&edge.raw)
                            .trim()
                            .to_string();
                        phantoms
                            .entry(edge.key.clone())
                            .or_insert(display);
                        format!("phantom:{}", edge.key)
                    }
                };
                if seen.insert(target_id.clone()) {
                    *degree.entry(source.clone()).or_default() += 1;
                    *degree.entry(target_id.clone()).or_default() += 1;
                    links.push(GraphLink {
                        source: source.clone(),
                        target: target_id,
                    });
                }
            }
        }

        let mut nodes: Vec<GraphNode> = self
            .notes
            .values()
            .map(|meta| GraphNode {
                id: meta.id.clone(),
                title: meta.title.clone(),
                kind: "note",
                degree: degree.get(&meta.id).copied().unwrap_or(0),
            })
            .collect();
        for (key, display) in phantoms {
            let id = format!("phantom:{key}");
            nodes.push(GraphNode {
                degree: degree.get(&id).copied().unwrap_or(0),
                id,
                title: display,
                kind: "phantom",
            });
        }
        GraphData { nodes, links }
    }

    /// Create or update a note from its content. Returns affected note ids
    /// whose backlink sets may have changed (for UI refresh decisions).
    pub fn upsert_note(&mut self, id: &str, content: &str, meta: NoteMeta) {
        let is_new = !self.notes.contains_key(id);
        self.notes.insert(id.to_string(), meta);
        self.contents.insert(
            id.to_string(),
            NoteText {
                original: content.to_string(),
                lower: content.to_lowercase(),
            },
        );
        if is_new {
            self.resolver.add(id);
        }
        let edges = index_edges(&self.resolver, content);
        self.set_edges(id, edges);
        if is_new {
            // Phantom links elsewhere may now resolve to this note.
            self.rebind_targets_of(id);
        }
    }

    pub fn remove_note(&mut self, id: &str) {
        // Drop outgoing edges (and their backlink entries).
        self.set_edges(id, Vec::new());
        self.forward.remove(id);
        self.notes.remove(id);
        self.contents.remove(id);
        self.resolver.remove(id);
        self.backlinks.remove(id);
        // Edges that resolved to this note must re-resolve (likely to None).
        self.rebind_targets_of(id);
    }

    pub fn rename_note(&mut self, old_id: &str, new_meta: NoteMeta) {
        let new_id = new_meta.id.clone();
        let edges = self.forward.remove(old_id).unwrap_or_default();

        // Move identity.
        self.notes.remove(old_id);
        self.resolver.remove(old_id);
        self.notes.insert(new_id.clone(), new_meta);
        self.resolver.add(&new_id);
        if let Some(text) = self.contents.remove(old_id) {
            self.contents.insert(new_id.clone(), text);
        }

        // Move outgoing edges: rewrite source in target_index and backlinks.
        for edge in &edges {
            if let Some(set) = self.target_index.get_mut(&edge.key) {
                set.remove(old_id);
                set.insert(new_id.clone());
            }
            if let Some(target) = &edge.resolved {
                if let Some(set) = self.backlinks.get_mut(target) {
                    set.remove(old_id);
                    set.insert(new_id.clone());
                }
            }
        }
        self.forward.insert(new_id.clone(), edges);

        // Incoming links are NOT moved: they still say [[OldName]] in their
        // source files. rebind re-resolves each one (usually to a phantom,
        // or to another note that now owns the old name).
        // Links pointing at either name re-resolve.
        self.rebind_targets_of(old_id);
        self.rebind_targets_of(&new_id);
    }

    /// Replace a note's outgoing edges, patching backlinks and target_index.
    fn set_edges(&mut self, id: &str, new_edges: Vec<Edge>) {
        let old_edges = self.forward.remove(id).unwrap_or_default();
        for edge in &old_edges {
            if let Some(set) = self.target_index.get_mut(&edge.key) {
                set.remove(id);
                if set.is_empty() {
                    self.target_index.remove(&edge.key);
                }
            }
            if let Some(target) = &edge.resolved {
                if let Some(set) = self.backlinks.get_mut(target) {
                    set.remove(id);
                    if set.is_empty() {
                        self.backlinks.remove(target);
                    }
                }
            }
        }
        for edge in &new_edges {
            self.target_index
                .entry(edge.key.clone())
                .or_default()
                .insert(id.to_string());
            if let Some(target) = &edge.resolved {
                self.backlinks
                    .entry(target.clone())
                    .or_default()
                    .insert(id.to_string());
            }
        }
        if !new_edges.is_empty() {
            self.forward.insert(id.to_string(), new_edges);
        }
    }

    /// Re-resolve every edge whose key could refer to `id` (its title key or
    /// its path key), fixing backlinks for edges whose resolution changed.
    fn rebind_targets_of(&mut self, id: &str) {
        let (title_key, path_key) = keys_for_note(id);
        let mut sources: HashSet<String> = HashSet::new();
        for key in [&title_key, &path_key] {
            if let Some(s) = self.target_index.get(key) {
                sources.extend(s.iter().cloned());
            }
        }
        for source in sources {
            let Some(mut edges) = self.forward.remove(&source) else {
                continue;
            };
            for edge in &mut edges {
                if edge.key == title_key || edge.key == path_key {
                    let new_resolved = self.resolver.resolve(&edge.key);
                    if new_resolved != edge.resolved {
                        if let Some(old) = &edge.resolved {
                            if let Some(set) = self.backlinks.get_mut(old) {
                                set.remove(&source);
                                if set.is_empty() {
                                    self.backlinks.remove(old);
                                }
                            }
                        }
                        if let Some(new) = &new_resolved {
                            self.backlinks
                                .entry(new.clone())
                                .or_default()
                                .insert(source.clone());
                        }
                        edge.resolved = new_resolved;
                    }
                }
            }
            self.forward.insert(source, edges);
        }
    }
}

/// First line (trimmed, capped) whose lowercase form contains any term.
/// Works line-by-line on the original text, so multi-byte lowercasing can
/// never misalign offsets.
fn snippet_for(original: &str, terms: &[String]) -> String {
    for line in original.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if terms.iter().any(|t| lower.contains(t.as_str())) {
            return trimmed.chars().take(180).collect();
        }
    }
    String::new()
}

fn index_edges(resolver: &Resolver, content: &str) -> Vec<Edge> {
    parse_wikilinks(content)
        .into_iter()
        .map(|raw| {
            let key = normalize_key(&raw.target);
            let resolved = resolver.resolve(&key);
            Edge {
                raw: raw.target,
                key,
                resolved,
                context: raw.context,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(id: &str) -> NoteMeta {
        NoteMeta {
            id: id.to_string(),
            title: crate::vault::title_of(id),
            mtime_ms: 0,
            size: 0,
        }
    }

    fn bl(index: &VaultIndex, id: &str) -> Vec<String> {
        index.backlinks(id).into_iter().map(|b| b.id).collect()
    }

    #[test]
    fn incremental_backlinks() {
        let mut i = VaultIndex::default();
        i.upsert_note("A.md", "links to [[B]]", meta("A.md"));
        // B doesn't exist yet: phantom.
        assert!(bl(&i, "B.md").is_empty());

        i.upsert_note("B.md", "", meta("B.md"));
        assert_eq!(bl(&i, "B.md"), vec!["A.md"]); // phantom now resolves

        i.upsert_note("A.md", "no more links", meta("A.md"));
        assert!(bl(&i, "B.md").is_empty());

        i.upsert_note("A.md", "[[B]] again", meta("A.md"));
        i.remove_note("B.md");
        assert!(bl(&i, "B.md").is_empty());
    }

    #[test]
    fn search_ranks_titles_over_bodies() {
        let mut i = VaultIndex::default();
        i.upsert_note("Graph Theory.md", "about structures", meta("Graph Theory.md"));
        i.upsert_note("Notes.md", "graph graph graph everywhere", meta("Notes.md"));
        i.upsert_note("Unrelated.md", "nothing here", meta("Unrelated.md"));

        let hits = i.search("graph", 10);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].id, "Graph Theory.md"); // title prefix beats body count
        assert_eq!(hits[1].id, "Notes.md");
        assert!(hits[1].snippet.contains("graph"));

        // AND semantics: both terms must appear somewhere.
        assert_eq!(i.search("graph everywhere", 10).len(), 1);
        assert!(i.search("zzz", 10).is_empty());
    }

    #[test]
    fn rename_moves_both_directions() {
        let mut i = VaultIndex::default();
        i.upsert_note("A.md", "[[B]]", meta("A.md"));
        i.upsert_note("B.md", "[[A]]", meta("B.md"));
        assert_eq!(bl(&i, "B.md"), vec!["A.md"]);

        // Rename B -> C: A's link to [[B]] becomes phantom; C's outgoing
        // link to A survives under the new name.
        i.rename_note("B.md", meta("C.md"));
        assert!(bl(&i, "C.md").is_empty());
        assert_eq!(bl(&i, "A.md"), vec!["C.md"]);
    }
}
