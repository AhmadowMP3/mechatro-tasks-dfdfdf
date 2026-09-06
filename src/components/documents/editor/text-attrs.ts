// Per-paragraph line height and text direction — the two Word-style controls
// TipTap's own extensions do not cover at block level.

import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockFormat: {
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
      setBlockDir: (dir: "rtl" | "ltr" | null) => ReturnType;
    };
  }
}

const BLOCKS = ["paragraph", "heading", "listItem", "blockquote"];
const CELLS = ["tableCell", "tableHeader"];

/* Inline CSS we keep verbatim on blocks and table cells. Imported Word
 * documents carry their spacing, indentation, shading and borders here, so
 * the page looks exactly like the original file and stays editable. */
const BLOCK_CSS = [
  "margin-top", "margin-bottom", "padding-inline-start", "padding-inline-end",
  "text-indent", "background-color", "border-bottom",
];
const CELL_CSS = [
  "background-color", "vertical-align", "padding",
  "border-top", "border-bottom", "border-left", "border-right", "border",
];

const pickCss = (el: HTMLElement, props: string[]): string | null => {
  const out = props
    .map((p) => {
      const v = el.style.getPropertyValue(p);
      return v ? `${p}:${v}` : "";
    })
    .filter(Boolean)
    .join(";");
  return out || null;
};

export const BlockFormat = Extension.create({
  name: "blockFormat",
  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {}),
          },
          dir: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).getAttribute("dir"),
            renderHTML: (attrs) => (attrs.dir ? { dir: attrs.dir } : {}),
          },
          blockStyle: {
            default: null,
            parseHTML: (el) => pickCss(el as HTMLElement, BLOCK_CSS),
            renderHTML: (attrs) => (attrs.blockStyle ? { style: String(attrs.blockStyle) } : {}),
          },
        },
      },
      {
        types: CELLS,
        attributes: {
          cellStyle: {
            default: null,
            parseHTML: (el) => pickCss(el as HTMLElement, CELL_CSS),
            renderHTML: (attrs) => (attrs.cellStyle ? { style: String(attrs.cellStyle) } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    type Api = { commands: { updateAttributes: (n: string, a: unknown) => boolean } };
    const apply = (attrs: Record<string, unknown>) => ({ commands }: Api) => {
      let ok = false;
      for (const type of BLOCKS) ok = commands.updateAttributes(type, attrs) || ok;
      return ok;
    };
    return {
      setLineHeight: (value: string) => apply({ lineHeight: value }),
      unsetLineHeight: () => apply({ lineHeight: null }),
      setBlockDir: (dir: "rtl" | "ltr" | null) => apply({ dir }),
    } as never;
  },
});
