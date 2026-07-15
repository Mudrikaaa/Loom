//! Wikilink target resolution against the set of notes in the vault.
//!
//! Rules (documented in the architecture writeup):
//! - Targets are matched case-insensitively; a trailing `#anchor` and a
//!   trailing `.md` are ignored.
//! - A target containing `/` matches by full vault-relative path.
//! - A bare target matches by note title (basename); if several notes share
//!   the title, the shallowest path wins (ties broken lexicographically).

use std::collections::{BTreeSet, HashMap};

use crate::vault::title_of;

/// Normalized lookup key for a raw wikilink target.
pub fn normalize_key(raw_target: &str) -> String {
    let t = raw_target.split('#').next().unwrap_or("").trim();
    let t = t.replace('\\', "/");
    let lower = t.to_lowercase();
    let lower = lower
        .strip_suffix(".md")
        .map(str::to_string)
        .unwrap_or(lower);
    lower.trim_end_matches('/').to_string()
}

/// The two keys under which a note is findable: its title and its path.
pub fn keys_for_note(id: &str) -> (String, String) {
    let title_key = title_of(id).to_lowercase();
    let path_key = normalize_key(id);
    (title_key, path_key)
}

#[derive(Debug, Default)]
pub struct Resolver {
    by_path: HashMap<String, String>,
    by_title: HashMap<String, BTreeSet<String>>,
}

impl Resolver {
    pub fn add(&mut self, id: &str) {
        let (title_key, path_key) = keys_for_note(id);
        self.by_path.insert(path_key, id.to_string());
        self.by_title.entry(title_key).or_default().insert(id.to_string());
    }

    pub fn remove(&mut self, id: &str) {
        let (title_key, path_key) = keys_for_note(id);
        self.by_path.remove(&path_key);
        if let Some(set) = self.by_title.get_mut(&title_key) {
            set.remove(id);
            if set.is_empty() {
                self.by_title.remove(&title_key);
            }
        }
    }

    /// Resolve a normalized key to a note id.
    pub fn resolve(&self, key: &str) -> Option<String> {
        if key.is_empty() {
            return None;
        }
        if key.contains('/') {
            return self.by_path.get(key).cloned();
        }
        self.by_title.get(key).and_then(|ids| {
            ids.iter()
                .min_by_key(|id| (id.matches('/').count(), (*id).clone()))
                .cloned()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes() {
        assert_eq!(normalize_key("Graph Theory#intro"), "graph theory");
        assert_eq!(normalize_key("topics/Graph Theory.md"), "topics/graph theory");
        assert_eq!(normalize_key("  A\\B  "), "a/b");
    }

    #[test]
    fn resolves_titles_and_paths() {
        let mut r = Resolver::default();
        r.add("topics/Graph Theory.md");
        r.add("Inbox.md");
        assert_eq!(
            r.resolve("graph theory"),
            Some("topics/Graph Theory.md".into())
        );
        assert_eq!(
            r.resolve("topics/graph theory"),
            Some("topics/Graph Theory.md".into())
        );
        assert_eq!(r.resolve("inbox"), Some("Inbox.md".into()));
        assert_eq!(r.resolve("nope"), None);
    }

    #[test]
    fn duplicate_titles_prefer_shallowest() {
        let mut r = Resolver::default();
        r.add("deep/nested/Note.md");
        r.add("Note.md");
        assert_eq!(r.resolve("note"), Some("Note.md".into()));
        r.remove("Note.md");
        assert_eq!(r.resolve("note"), Some("deep/nested/Note.md".into()));
    }
}
