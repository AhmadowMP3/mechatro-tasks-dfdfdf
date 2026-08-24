// Extra typography controls the Word-style editor needs but TipTap's core
// packages do not ship: font size (a textStyle attribute), font family,
// per-paragraph line height and per-paragraph text direction.

import { Extension } from "@tiptap/core";

/* ── font-size + font-family on the textStyle mark ─────────────── */

export const TextFormat = Extension.create({
  name: "textFormat",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {}),
          },
          fontFamily: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
            renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family:${attrs.fontFamily}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    type Api = { chain: () => { setMark: (n: string, a: unknown) => { run: () => boolean }; removeEmptyTextStyle: () => { run: () => boolean } } };
    return {
      setFontSize:
        (size: string) =>
        ({ chain }: Api) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }: Api) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
      setFontFamily:
        (family: string) =>
        ({ chain }: Api) =>
          chain().setMark("textStyle", { fontFamily: family }).run(),
      unsetFontFamily:
        () =>
        ({ chain }: Api) =>
          chain().setMark("textStyle", { fontFamily: null }).run(),
    } as never;
  },
});

/* ── line-height + dir on block nodes ─────────────────────────── */

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
    const apply = (attrs: Record<string, unknown>) => () => ({ commands }: Api) => {
      let ok = false;
      for (const type of BLOCKS) ok = commands.updateAttributes(type, attrs) || ok;
      return ok;
    };
    return {
      setLineHeight: (value: string) => apply({ lineHeight: value })(),
      unsetLineHeight: () => apply({ lineHeight: null })(),
      setBlockDir: (dir: "rtl" | "ltr" | null) => apply({ dir })(),
    } as never;
  },
});
