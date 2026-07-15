/**
 * Loom editor theme: chrome (EditorView.theme) + markdown/code token styling
 * (HighlightStyle), matched to the app's charcoal-plum + rose palette. Colors
 * reference the CSS variables from App.css where possible. Code-token colors
 * are part of the main HighlightStyle (a `fallback` style never activates
 * when a primary style is configured, so they must live here).
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const MONO =
  "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace";

export const loomTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "15.5px",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: "20px 36px 50vh",
      maxWidth: "800px",
      margin: "0 auto",
      lineHeight: "1.7",
      caretColor: "var(--accent)",
    },
    ".cm-scroller": { overflow: "auto" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground": { background: "#3f2735 !important" },
    "&.cm-focused .cm-selectionBackground": {
      background: "#4f3042 !important",
    },
    ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    ".cm-placeholder": { color: "var(--text-muted)" },

    /* wikilinks */
    ".cm-wikilink": {
      color: "var(--accent-strong)",
      cursor: "pointer",
      transition: "text-shadow 0.15s",
    },
    ".cm-wikilink:hover": {
      textDecoration: "underline",
      textShadow: "0 0 12px rgba(243, 184, 215, 0.8)",
    },
    ".cm-wikilink-phantom": {
      color: "var(--text-muted)",
      borderBottom: "1px dashed var(--text-muted)",
    },

    /* live-preview widgets & lines */
    ".cm-hr": {
      display: "inline-block",
      width: "100%",
      height: "2px",
      background:
        "linear-gradient(90deg, transparent, var(--accent-deep), var(--accent-strong), transparent)",
      verticalAlign: "middle",
      borderRadius: "2px",
    },
    ".cm-bullet": { color: "var(--accent)" },
    ".cm-task-checkbox": {
      accentColor: "var(--accent)",
      verticalAlign: "middle",
      margin: "0 1px 2px 0",
      cursor: "pointer",
    },
    ".cm-blockquote-line": {
      borderLeft: "3px solid var(--accent)",
      paddingLeft: "12px",
      background:
        "linear-gradient(90deg, rgba(232, 147, 192, 0.05), transparent 60%)",
    },
    ".cm-codeblock-line": {
      background: "rgba(232, 147, 192, 0.05)",
      fontFamily: MONO,
      fontSize: "0.9em",
      padding: "0 10px",
    },

    /* autocomplete panel */
    ".cm-tooltip": {
      background: "rgba(26, 20, 25, 0.96)",
      backdropFilter: "blur(8px)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow:
        "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(232, 147, 192, 0.07)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      padding: "5px 12px",
      color: "var(--text)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background:
        "linear-gradient(90deg, rgba(232, 147, 192, 0.25), rgba(232, 147, 192, 0.08))",
      color: "var(--accent-strong)",
    },
    ".cm-completionDetail": {
      color: "var(--text-muted)",
      fontStyle: "normal",
      fontSize: "0.85em",
    },
  },
  { dark: true },
);

export const loomHighlight = HighlightStyle.define([
  /* ---- markdown ---- */
  {
    tag: t.heading1,
    fontSize: "1.65em",
    fontWeight: "750",
    background: "linear-gradient(110deg, #f6eef4, #f3b8d7)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "700", color: "#f2cfe4" },
  { tag: t.heading3, fontSize: "1.22em", fontWeight: "650", color: "#eedde8" },
  { tag: t.heading4, fontSize: "1.1em", fontWeight: "650", color: "#eadfe6" },
  { tag: t.heading5, fontWeight: "650", color: "#eadfe6" },
  { tag: t.heading6, fontWeight: "650", color: "var(--text-muted)" },
  { tag: t.strong, fontWeight: "700", color: "#fdf5fa" },
  { tag: t.emphasis, fontStyle: "italic" },
  {
    tag: t.strikethrough,
    textDecoration: "line-through",
    color: "var(--text-muted)",
  },
  {
    tag: t.monospace,
    fontFamily: MONO,
    fontSize: "0.9em",
    color: "#f3b8d7",
  },
  { tag: t.link, color: "var(--accent-strong)" },
  { tag: t.url, color: "var(--text-muted)" },
  { tag: t.processingInstruction, color: "#5c5058" },
  { tag: t.quote, color: "#cfc0cb", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "var(--text-muted)" },
  { tag: t.list, color: "var(--accent)" },

  /* ---- code tokens (fenced code blocks) ---- */
  { tag: t.keyword, color: "#e8a2c8" },
  { tag: [t.string, t.special(t.string)], color: "#a5d6a0" },
  { tag: t.comment, color: "#6e6470", fontStyle: "italic" },
  { tag: [t.number, t.integer, t.float], color: "#e6c98a" },
  { tag: [t.bool, t.atom, t.null], color: "#ff8fa3" },
  { tag: [t.typeName, t.className, t.namespace], color: "#f3cfe3" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#edb3d2" },
  { tag: t.propertyName, color: "#dcc0d0" },
  { tag: t.definition(t.variableName), color: "#ece4ea" },
  { tag: t.variableName, color: "#ded4dc" },
  { tag: [t.operator, t.regexp, t.escape], color: "#e795c4" },
  { tag: t.tagName, color: "#e8a2c8" },
  { tag: t.attributeName, color: "#e6c98a" },
  { tag: t.meta, color: "#a599a3" },
  { tag: t.punctuation, color: "#a599a3" },
  { tag: t.invalid, color: "#ff7a7a" },
]);
