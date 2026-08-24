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
