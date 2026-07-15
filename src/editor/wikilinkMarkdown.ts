/**
 * Wikilink syntax for @lezer/markdown, via its official MarkdownConfig
 * extension API. Adds real nodes to the markdown parse tree:
 *
 *   [[Target]]        → WikiLink( WikiLinkMark WikiLinkTarget WikiLinkMark )
 *   [[Target|Label]]  → WikiLink( WikiLinkMark WikiLinkTarget WikiLinkMark
 *                                 WikiLinkLabel WikiLinkMark )
 *
 * This is only the *editor-layer* parse (styling, autocomplete, click
 * targets). The vault-wide link index is parsed independently in Rust.
 */

import type { MarkdownConfig } from "@lezer/markdown";
import { tags as t } from "@lezer/highlight";

const BRACKET_OPEN = 91; // [
const BRACKET_CLOSE = 93; // ]
const PIPE = 124; // |
const NEWLINE = 10;

export const wikiLinkMarkdown: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    { name: "WikiLinkMark", style: t.processingInstruction },
    { name: "WikiLinkTarget", style: t.link },
    { name: "WikiLinkLabel", style: t.link },
  ],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== BRACKET_OPEN || cx.char(pos + 1) !== BRACKET_OPEN) {
          return -1;
        }
        // Scan for the closing ]] on the same line, tracking the first |.
        let i = pos + 2;
        let pipe = -1;
        for (;;) {
          if (i >= cx.end) return -1;
          const ch = cx.char(i);
          if (ch === NEWLINE || ch === BRACKET_OPEN) return -1;
          if (ch === PIPE && pipe < 0) pipe = i;
          if (ch === BRACKET_CLOSE) {
            if (cx.char(i + 1) === BRACKET_CLOSE) break;
            return -1;
          }
          i++;
        }
        const end = i + 2;
        const targetEnd = pipe >= 0 ? pipe : i;
        if (targetEnd === pos + 2) return -1; // empty target: [[]] / [[|x]]

        const children = [
          cx.elt("WikiLinkMark", pos, pos + 2),
          cx.elt("WikiLinkTarget", pos + 2, targetEnd),
        ];
        if (pipe >= 0) {
          children.push(cx.elt("WikiLinkMark", pipe, pipe + 1));
          if (pipe + 1 < i) {
            children.push(cx.elt("WikiLinkLabel", pipe + 1, i));
          }
        }
        children.push(cx.elt("WikiLinkMark", i, end));
        return cx.addElement(cx.elt("WikiLink", pos, end, children));
      },
    },
  ],
};
