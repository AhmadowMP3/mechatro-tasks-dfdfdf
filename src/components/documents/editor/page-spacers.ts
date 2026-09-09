// Page spacing in the editor comes from EXACTLY one place: a positive-height
// widget decoration inserted before the first block of each page.
//
// Invariant 4: the spacer height is always >= 0. A negative value would mean
// the paginator asked for less room than the content already occupies — that
// is a pagination bug, logged in development and clamped to 0. A negative
// margin is never rendered to compensate.

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const pageSpacerKey = new PluginKey("docPageSpacers");

/** Heights keyed by top-level node index. */
export type SpacerMap = Map<number, number>;

export function clampSpacer(value: number, nodeIndex: number): number {
  if (value < -0.5) {
    if (import.meta.env.DEV) {
      console.warn(`[docs] negative page spacer (${Math.round(value)}px) before node ${nodeIndex} — clamped to 0`);
    }
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function pageSpacerPlugin(read: () => SpacerMap) {
  return new Plugin({
    key: pageSpacerKey,
    props: {
      decorations(state) {
        const map = read();
        if (map.size === 0) return DecorationSet.empty;
        const decorations: Decoration[] = [];
        let index = 0;
        state.doc.forEach((_node, offset) => {
          const height = map.get(index);
          if (height && height > 0) {
            decorations.push(
              Decoration.widget(
                offset,
                () => {
                  const el = document.createElement("div");
                  el.className = "doc-page-spacer";
                  el.style.height = `${height}px`;
                  el.setAttribute("contenteditable", "false");
                  el.setAttribute("aria-hidden", "true");
                  return el;
                },
                { side: -1, key: `page-spacer-${index}-${height}` },
              ),
            );
          }
          index += 1;
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
