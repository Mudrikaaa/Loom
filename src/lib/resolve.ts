/**
 * Editor-layer wikilink resolution against the loaded note list.
 * Matches, case-insensitively: full vault-relative path (with or without
 * `.md`) first, then bare note title (basename). The authoritative vault-wide
 * resolver lives in Rust; this mirrors its rules for instant editor feedback.
 */

import type { NoteMeta } from "./types";

/** `[[Target#heading]]` → `Target`; trims whitespace. */
export function normalizeTarget(rawTarget: string): string {
  return rawTarget.split("#")[0].trim();
}

export function resolveTarget(
  notes: NoteMeta[],
  rawTarget: string,
): NoteMeta | undefined {
  const target = normalizeTarget(rawTarget).toLowerCase();
  if (!target) return undefined;
  const asPath = target.endsWith(".md") ? target : `${target}.md`;
  let byTitle: NoteMeta | undefined;
  for (const n of notes) {
    if (n.id.toLowerCase() === asPath) return n;
    if (!byTitle && n.title.toLowerCase() === target) byTitle = n;
  }
  return byTitle;
}
