/**
 * CodeMirror 6 editor assembly: markdown + wikilink grammar, inline live
 * preview, Loom theme, autocomplete, and link interactions. Pure view layer —
 * all persistence goes through the store.
 */

import { useEffect, useRef } from "react";
import {
  EditorView,
  keymap,
  placeholder,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
} from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { openUrl } from "@tauri-apps/plugin-opener";

import { useStore } from "../state/store";
import { resolveTarget } from "../lib/resolve";
import { wikiLinkMarkdown } from "./wikilinkMarkdown";
import { livePreview, wikilinkResolver } from "./livePreview";
import { linkClickHandler, wikilinkCompletionSource } from "./interactions";
import { loomTheme, loomHighlight } from "./theme";

interface EditorProps {
  noteId: string;
  initialDoc: string;
}

export function Editor({ noteId, initialDoc }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Doc for a freshly opened note; not a reactive dep so our own typing
  // (which updates the store) doesn't recreate the view.
  const initialDocRef = useRef(initialDoc);
  initialDocRef.current = initialDoc;

  useEffect(() => {
    if (!containerRef.current) return;
    const store = () => useStore.getState();

    const view = new EditorView({
      doc: initialDocRef.current,
      parent: containerRef.current,
      extensions: [
        // editing basics
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        placeholder("Start writing… link notes with [[double brackets]]"),

        // language
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          extensions: [wikiLinkMarkdown],
        }),

        // appearance
        loomTheme,
        syntaxHighlighting(loomHighlight),
        livePreview,

        // app integration
        wikilinkResolver.of(
          (target) => resolveTarget(store().notes, target) !== undefined,
        ),
        autocompletion({
          override: [wikilinkCompletionSource(() => store().notes)],
        }),
        linkClickHandler({
          onFollowWikiLink: (target) => void store().followWikiLink(target),
          onOpenUrl: (url) =>
            void openUrl(url).catch((e) => store().showError(String(e))),
        }),

        // keys + persistence
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void store().saveNow();
              return true;
            },
          },
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            store().setContent(update.state.doc.toString());
          }
        }),
      ],
    });
    view.focus();
    return () => view.destroy();
  }, [noteId]);

  return <div ref={containerRef} className="editor-host" />;
}
