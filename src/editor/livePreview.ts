/**
 * Inline live preview: markdown formatting marks are hidden and replaced by
 * their rendered look, except where the selection touches the element — there
 * the raw syntax is revealed for editing (Obsidian-style interaction pattern,
 * original implementation).
 *
 * Works entirely from the Lezer syntax tree over the *visible* viewport
 * ranges, so cost is bounded by screen size, not document size.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { EditorState, Facet, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/** Editor asks the app "does this wikilink target resolve to a note?" */
export const wikilinkResolver = Facet.define<
  (target: string) => boolean,
  (target: string) => boolean
>({
  combine: (values) => values[values.length - 1] ?? (() => true),
});

const hide = Decoration.replace({});
const quoteLine = Decoration.line({ class: "cm-blockquote-line" });
const codeLine = Decoration.line({ class: "cm-codeblock-line" });

class HrWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-hr";
    return el;
  }
  eq() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-bullet";
    el.textContent = "•";
    return el;
  }
  eq() {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly markerFrom: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.markerFrom === this.markerFrom;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task-checkbox";
    box.checked = this.checked;
    box.onmousedown = (e) => {
      e.preventDefault();
      // TaskMarker is "[x]" / "[ ]": flip the middle character.
      view.dispatch({
        changes: {
          from: this.markerFrom + 1,
          to: this.markerFrom + 2,
          insert: this.checked ? " " : "x",
        },
      });
    };
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

/** Does any selection range touch [from, to] (inclusive of boundaries)? */
function touches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

/** Same, but expanded to whole lines (for line-level elements). */
function touchesLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return touches(state, line.from, line.to);
}

/** Hide a mark, swallowing one trailing space so text sits flush. */
function hideMarkWithSpace(
  deco: Range<Decoration>[],
  state: EditorState,
  from: number,
  to: number,
) {
  const end = state.doc.sliceString(to, to + 1) === " " ? to + 1 : to;
  deco.push(hide.range(from, end));
}

function decorateWikiLink(
  deco: Range<Decoration>[],
  state: EditorState,
  node: SyntaxNode,
  resolves: (target: string) => boolean,
) {
  const revealed = touches(state, node.from, node.to);
  let target: SyntaxNode | null = null;
  let label: SyntaxNode | null = null;
  const marks: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === "WikiLinkMark") marks.push(c);
    else if (c.name === "WikiLinkTarget") target = c;
    else if (c.name === "WikiLinkLabel") label = c;
  }
  const targetText = target
    ? state.doc.sliceString(target.from, target.to)
    : "";
  const cls =
    "cm-wikilink" + (resolves(targetText) ? "" : " cm-wikilink-phantom");
  deco.push(
    Decoration.mark({
      class: cls,
      attributes: { title: "Ctrl+click to open" },
    }).range(node.from, node.to),
  );
  if (!revealed) {
    for (const m of marks) deco.push(hide.range(m.from, m.to));
    // [[Target|Label]] shows only the label when the cursor is away.
    if (label && target) deco.push(hide.range(target.from, target.to));
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const deco: Range<Decoration>[] = [];
  const state = view.state;
  const resolves = state.facet(wikilinkResolver);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        switch (node.name) {
          case "WikiLink":
            decorateWikiLink(deco, state, node.node, resolves);
            return false; // children handled above

          case "HeaderMark": {
            if (!touchesLine(state, node.from)) {
              hideMarkWithSpace(deco, state, node.from, node.to);
            }
            break;
          }

          case "EmphasisMark":
          case "StrikethroughMark": {
            const parent = node.node.parent;
            if (parent && !touches(state, parent.from, parent.to)) {
              deco.push(hide.range(node.from, node.to));
            }
            break;
          }

          case "CodeMark": {
            const parent = node.node.parent;
            if (
              parent?.name === "InlineCode" &&
              !touches(state, parent.from, parent.to)
            ) {
              deco.push(hide.range(node.from, node.to));
            }
            break;
          }

          case "LinkMark":
          case "URL": {
            const parent = node.node.parent;
            if (
              parent?.name === "Link" &&
              !touches(state, parent.from, parent.to)
            ) {
              deco.push(hide.range(node.from, node.to));
            }
            break;
          }

          case "QuoteMark": {
            if (!touchesLine(state, node.from)) {
              hideMarkWithSpace(deco, state, node.from, node.to);
            }
            break;
          }

          case "Blockquote": {
            const first = state.doc.lineAt(node.from).number;
            const last = state.doc.lineAt(node.to).number;
            for (let l = first; l <= last; l++) {
              deco.push(quoteLine.range(state.doc.line(l).from));
            }
            break;
          }

          case "HorizontalRule": {
            if (!touchesLine(state, node.from)) {
              deco.push(
                Decoration.replace({ widget: new HrWidget() }).range(
                  node.from,
                  node.to,
                ),
              );
            }
            break;
          }

          case "ListMark": {
            const text = state.doc.sliceString(node.from, node.to);
            if (
              (text === "-" || text === "*" || text === "+") &&
              !touches(state, node.from, node.to + 1)
            ) {
              deco.push(
                Decoration.replace({ widget: new BulletWidget() }).range(
                  node.from,
                  node.to,
                ),
              );
            }
            break;
          }

          case "TaskMarker": {
            if (!touches(state, node.from, node.to)) {
              const checked = /x/i.test(
                state.doc.sliceString(node.from, node.to),
              );
              deco.push(
                Decoration.replace({
                  widget: new CheckboxWidget(checked, node.from),
                }).range(node.from, node.to),
              );
            }
            break;
          }

          case "FencedCode": {
            const first = state.doc.lineAt(node.from).number;
            const last = state.doc.lineAt(node.to).number;
            for (let l = first; l <= last; l++) {
              deco.push(codeLine.range(state.doc.line(l).from));
            }
            break;
          }
        }
        return undefined;
      },
    });
  }
  return Decoration.set(deco, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
