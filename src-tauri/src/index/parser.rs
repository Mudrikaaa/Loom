//! Wikilink extraction from Markdown source. This is the authoritative
//! parser for the vault-wide link index (the editor has its own Lezer-based
//! parse purely for styling).
//!
//! Rules:
//! - `[[Target]]` and `[[Target|Label]]`; only the target part is indexed.
//! - Links must open and close on the same line.
//! - Links inside fenced code blocks (``` / ~~~) and inline code are ignored.

/// One extracted link occurrence.
#[derive(Debug, Clone, PartialEq)]
pub struct RawLink {
    /// The raw target text, untrimmed of `#anchor` (resolution strips it).
    pub target: String,
    /// The (trimmed, capped) line the link appeared on — backlink context.
    pub context: String,
}

pub fn parse_wikilinks(content: &str) -> Vec<RawLink> {
    let mut links = Vec::new();
    let mut fence: Option<(u8, usize)> = None; // (fence byte, run length)

    for line in content.lines() {
        let trimmed = line.trim_start();
        if let Some((ch, len)) = fence {
            if fence_run(trimmed, ch) >= len && only_fence(trimmed, ch) {
                fence = None;
            }
            continue;
        }
        if let Some(open) = fence_open(trimmed) {
            fence = Some(open);
            continue;
        }
        scan_line(line, &mut links);
    }
    links
}

fn fence_run(s: &str, ch: u8) -> usize {
    s.bytes().take_while(|&b| b == ch).count()
}

/// A closing fence is the fence run possibly followed by whitespace only.
fn only_fence(s: &str, ch: u8) -> bool {
    s[fence_run(s, ch)..].trim().is_empty()
}

fn fence_open(s: &str) -> Option<(u8, usize)> {
    for ch in [b'`', b'~'] {
        let run = fence_run(s, ch);
        if run >= 3 {
            return Some((ch, run));
        }
    }
    None
}

fn scan_line(line: &str, links: &mut Vec<RawLink>) {
    let bytes = line.as_bytes();
    let mut i = 0;
    let mut in_code = false;
    let mut code_ticks = 0usize;

    while i < bytes.len() {
        if bytes[i] == b'`' {
            let run = bytes[i..].iter().take_while(|&&b| b == b'`').count();
            if in_code {
                if run >= code_ticks {
                    in_code = false;
                }
            } else {
                in_code = true;
                code_ticks = run;
            }
            i += run;
            continue;
        }
        if !in_code && bytes[i] == b'[' && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            if let Some(close) = find_close(bytes, i + 2) {
                // Safe slicing: '[' and ']' are ASCII, so these are char boundaries.
                let inner = &line[i + 2..close];
                let target = inner.split('|').next().unwrap_or("").trim();
                if !target.is_empty() {
                    links.push(RawLink {
                        target: target.to_string(),
                        context: line.trim().chars().take(200).collect(),
                    });
                }
                i = close + 2;
                continue;
            }
        }
        i += 1;
    }
}

/// Position of the `]]` closing a link opened before `from`; bails on `[`.
fn find_close(bytes: &[u8], from: usize) -> Option<usize> {
    let mut i = from;
    while i < bytes.len() {
        match bytes[i] {
            b'[' => return None,
            b']' if i + 1 < bytes.len() && bytes[i + 1] == b']' => {
                return if i > from { Some(i) } else { None };
            }
            _ => {}
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(content: &str) -> Vec<String> {
        parse_wikilinks(content)
            .into_iter()
            .map(|l| l.target)
            .collect()
    }

    #[test]
    fn basic_and_labeled() {
        assert_eq!(
            targets("See [[Alpha]] and [[Beta|the b note]]."),
            vec!["Alpha", "Beta"]
        );
    }

    #[test]
    fn skips_code() {
        let md = "a [[Real]]\n```\n[[NotALink]]\n```\nand `[[AlsoNot]]` but [[Yes]]";
        assert_eq!(targets(md), vec!["Real", "Yes"]);
    }

    #[test]
    fn rejects_malformed() {
        assert!(targets("[[]] [[ ]] [[unclosed and [[nested]]").is_empty() == false);
        assert_eq!(targets("[[]] [[ ]] x [[ok]]"), vec!["ok"]);
        assert_eq!(targets("[[a\nb]]"), Vec::<String>::new());
    }

    #[test]
    fn anchors_and_paths_kept_raw() {
        assert_eq!(
            targets("[[topics/Graph Theory#intro]]"),
            vec!["topics/Graph Theory#intro"]
        );
    }
}
