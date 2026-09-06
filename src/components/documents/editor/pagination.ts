// Live A4 pagination for the document editor.
//
// The editor keeps ONE continuous ProseMirror document (so typing, undo and
// the cursor never jump), while this module pushes any block that would cross
// an A4 boundary down to the top of the next sheet. Whole blocks are moved
// with widget spacers; long tables are split between two rows instead, by
// padding out the last row that still fits on the page.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";

export type PageSpacer = {
  pos: number;
  h: number;
  /** "block" inserts a widget before pos; "row" pads the table row at pos..end. */
  kind?: "block" | "row";
  end?: number;
};

export const pageLayoutKey = new PluginKey<PageSpacer[]>("docPageLayout");

/** Gap drawn between two sheets on screen. */
export const SHEET_GAP = 26;

export const PageLayout = Extension.create({
  name: "pageLayout",
  addProseMirrorPlugins() {
    return [
      new Plugin<PageSpacer[]>({
        key: pageLayoutKey,
        state: {
          init: () => [],
          apply(tr, prev) {
            const next = tr.getMeta(pageLayoutKey) as PageSpacer[] | undefined;
            if (next) return next;
            if (!tr.docChanged) return prev;
            // Keep the spacers roughly in place until the next measure pass.
            return prev.map((s) => ({
              ...s,
              pos: tr.mapping.map(s.pos, -1),
              end: s.end === undefined ? undefined : tr.mapping.map(s.end, 1),
            }));
          },
        },
        props: {
          decorations(state) {
            const spacers = pageLayoutKey.getState(state) ?? [];
            if (!spacers.length) return DecorationSet.empty;
            const docSize = state.doc.content.size;
            const decos: Decoration[] = [];

            for (const s of spacers) {
              if (!(s.h > 0.5) || s.pos < 0 || s.pos > docSize) continue;

              if (s.kind === "row" && s.end !== undefined && s.end > s.pos && s.end <= docSize) {
                decos.push(
                  Decoration.node(s.pos, s.end, {
                    class: "doc-row-break",
                    style: `--doc-row-gap:${Math.round(s.h)}px`,
                  }),
                );
                continue;
              }

              decos.push(
                Decoration.widget(
                  s.pos,
                  () => {
                    const el = document.createElement("div");
                    el.className = "doc-page-spacer";
                    el.setAttribute("contenteditable", "false");
                    el.style.height = `${Math.round(s.h)}px`;
                    return el;
                  },
                  { side: -1, key: `pgs-${s.pos}-${Math.round(s.h)}` },
                ),
              );
            }

            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

export function readSpacers(editor: Editor): PageSpacer[] {
  return pageLayoutKey.getState(editor.state) ?? [];
}

export function writeSpacers(editor: Editor, spacers: PageSpacer[]) {
  const tr = editor.state.tr.setMeta(pageLayoutKey, spacers).setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

export function sameSpacers(a: PageSpacer[], b: PageSpacer[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (s, i) =>
      s.pos === b[i]!.pos &&
      s.end === b[i]!.end &&
      s.kind === b[i]!.kind &&
      Math.abs(s.h - b[i]!.h) < 1,
  );
}
