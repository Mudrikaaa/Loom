/**
 * Editor interactions: Ctrl/Cmd+click to follow wikilinks and web links,
 * and wikilink autocomplete triggered by `[[`.
 */

import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { NoteMeta } from "../lib/types";

export interface LinkHandlers {
  /** Raw wikilink target text, e.g. "Graph Theory" or "topics/Graph Theory#intro". */
  onFollowWikiLink: (target: string) => void;
  onOpenUrl: (url: string) => void;
}

export function linkClickHandler(handlers: LinkHandlers) {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) {
        return false;
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;

      for (
        let node = syntaxTree(view.state).resolveInner(pos, 0);
        node;
        node = node.parent!
      ) {
        if (node.name === "WikiLink") {
          const target = node.getChild("WikiLinkTarget");
          if (target) {
            event.preventDefault();
            handlers.onFollowWikiLink(
              view.state.doc.sliceString(target.from, target.to),
            );
            return true;
          }
        }
        if (node.name === "URL") {
          const url = view.state.doc.sliceString(node.from, node.to);
          if (/^https?:\/\//i.test(url)) {
            event.preventDefault();
            handlers.onOpenUrl(url);
            return true;
          }
        }
        if (node.name === "Link" || node.name === "Autolink") {
          const urlNode = node.getChild("URL");
          if (urlNode) {
            const url = view.state.doc.sliceString(urlNode.from, urlNode.to);
            if (/^https?:\/\//i.test(url)) {
              event.preventDefault();
              handlers.onOpenUrl(url);
              return true;
            }
          }
        }
        if (!node.parent) break;
      }
      return false;
    },
  });
}

/**
 * Completion source for `[[…`. Lists every note; inserts the note title and
 * the closing `]]` (reusing an existing `]]` if the user already typed it).
 */
export function wikilinkCompletionSource(getNotes: () => NoteMeta[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^\[\]|]*$/);
    if (!match) return null;
    const from = match.from + 2;

    const options = getNotes().map((note) => ({
      label: note.title,
      detail: note.id.includes("/")
        ? note.id.slice(0, note.id.lastIndexOf("/"))
        : undefined,
      apply: (view: EditorView, _completion: unknown, applyFrom: number, applyTo: number) => {
        const closed =
          view.state.sliceDoc(applyTo, applyTo + 2) === "]]";
        const insert = note.title + (closed ? "" : "]]");
        view.dispatch({
          changes: { from: applyFrom, to: applyTo, insert },
          selection: { anchor: applyFrom + note.title.length + 2 },
        });
      },
    }));

    return { from, options, validFor: /^[^\[\]|]*$/ };
  };
}
