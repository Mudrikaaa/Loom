/**
 * Loom editor theme: chrome (EditorView.theme) + markdown/code token styling
 * (HighlightStyle). Colors reference the CSS variables from App.css so the
 * editor and the rest of the UI stay in sync. Code-token colors are part of
 * the main HighlightStyle (a `fallback` style never activates when a primary
 * style is configured, so they must live here).
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
      caretColor: "var(--accent-cyan)",
    },
    ".cm-scroller": { overflow: "auto" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground": { background: "#1c3059 !important" },
    "&.cm-focused .cm-selectionBackground": {
      background: "#224073 !important",
    },
    ".cm-cursor": { borderLeftColor: "var(--accent-cyan)", borderLeftWidth: "2px" },
    ".cm-placeholder": { color: "var(--text-muted)" },

    /* wikilinks */
    ".cm-wikilink": {
      color: "var(--accent-strong)",
      cursor: "pointer",
      transition: "text-shadow 0.15s",
    },
    ".cm-wikilink:hover": {
      textDecoration: "underline",
      textShadow: "0 0 12px rgba(122, 176, 255, 0.8)",
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
        "linear-gradient(90deg, transparent, var(--accent), var(--accent-cyan), transparent)",
      verticalAlign: "middle",
      borderRadius: "2px",
    },
    ".cm-bullet": { color: "var(--accent-cyan)" },
    ".cm-task-checkbox": {
      accentColor: "var(--accent)",
      verticalAlign: "middle",
      margin: "0 1px 2px 0",
      cursor: "pointer",
    },
    ".cm-blockquote-line": {
      borderLeft: "3px solid var(--accent-cyan)",
      paddingLeft: "12px",
      background: "linear-gradient(90deg, rgba(77, 225, 255, 0.05), transparent 60%)",
    },
    ".cm-codeblock-line": {
      background: "rgba(24, 42, 84, 0.35)",
      fontFamily: MONO,
      fontSize: "0.9em",
      padding: "0 10px",
    },

    /* autocomplete panel */
    ".cm-tooltip": {
      background: "rgba(10, 16, 32, 0.95)",
      backdropFilter: "blur(8px)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(77, 141, 255, 0.08)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      padding: "5px 12px",
      color: "var(--text)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "linear-gradient(90deg, rgba(77, 141, 255, 0.25), rgba(77, 225, 255, 0.12))",
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
    background: "linear-gradient(110deg, #9dc2ff, #4de1ff)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "700", color: "#a8c7ff" },
  { tag: t.heading3, fontSize: "1.22em", fontWeight: "650", color: "#b7d0ff" },
  { tag: t.heading4, fontSize: "1.1em", fontWeight: "650", color: "#c5d8ff" },
  { tag: t.heading5, fontWeight: "650", color: "#c5d8ff" },
  { tag: t.heading6, fontWeight: "650", color: "var(--text-muted)" },
  { tag: t.strong, fontWeight: "700", color: "#eef3ff" },
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
    color: "#7ce7ff",
  },
  { tag: t.link, color: "var(--accent-strong)" },
  { tag: t.url, color: "var(--text-muted)" },
  { tag: t.processingInstruction, color: "#44507a" },
  { tag: t.quote, color: "#a9b6d8", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "var(--text-muted)" },
  { tag: t.list, color: "var(--accent-cyan)" },

  /* ---- code tokens (fenced code blocks) ---- */
  { tag: t.keyword, color: "#82aaff" },
  { tag: [t.string, t.special(t.string)], color: "#8be9a8" },
  { tag: t.comment, color: "#5a6b95", fontStyle: "italic" },
  { tag: [t.number, t.integer, t.float], color: "#f2c982" },
  { tag: [t.bool, t.atom, t.null], color: "#ff9ac1" },
  { tag: [t.typeName, t.className, t.namespace], color: "#7ce7ff" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#5fd0ff" },
  { tag: t.propertyName, color: "#9ecbff" },
  { tag: t.definition(t.variableName), color: "#e2e8f8" },
  { tag: t.variableName, color: "#d3dcf5" },
  { tag: [t.operator, t.regexp, t.escape], color: "#89ddff" },
  { tag: t.tagName, color: "#82aaff" },
  { tag: t.attributeName, color: "#f2c982" },
  { tag: t.meta, color: "#7d8bb0" },
  { tag: t.punctuation, color: "#8fa1c9" },
  { tag: t.invalid, color: "#ff7a8a" },
]);
