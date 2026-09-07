// Word-fidelity attributes for the document editor.
//
// The preview renders the imported HTML verbatim, so the editor has to carry
// the very same inline styling through TipTap's schema. Instead of a short
// allow-list of CSS properties (which silently dropped everything else on
// import), every block, table part, image and list keeps its full `style` and
// `class` attribute, plus the two Word controls TipTap has no node for
// (line height and per-paragraph direction).

import { Extension, Mark, mergeAttributes } from "@tiptap/core";

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

/** Every node type that may carry imported Word styling. */
const STYLED_TYPES = [
  "paragraph", "heading", "listItem", "blockquote", "codeBlock",
  "bulletList", "orderedList", "horizontalRule",
  "table", "tableRow", "tableCell", "tableHeader",
  "divBlock", "image",
];

const DANGEROUS = /(expression\s*\(|javascript:|vbscript:|url\s*\(\s*['"]?\s*(javascript|data:text\/html))/i;
const BANNED_PROPS = /^(position|z-index|content|behavior|-moz-binding)$/i;

/** Keep the declaration list intact, minus anything unsafe or layout-breaking. */
export function safeStyle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const out = raw
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const prop = d.slice(0, d.indexOf(":")).trim();
      if (!prop || BANNED_PROPS.test(prop)) return false;
      return !DANGEROUS.test(d);
    })
    .join(";");
  return out || null;
}

const safeClass = (raw: string | null | undefined): string | null => {
  const out = (raw ?? "")
    .split(/\s+/)
    .filter((c) => c && !/^(ProseMirror|doc-page|doc-row-|doc-page-break)/.test(c))
    .join(" ");
  return out || null;
};

export const BlockFormat = Extension.create({
  name: "blockFormat",
  addGlobalAttributes() {
    return [
      {
        types: STYLED_TYPES,
        attributes: {
          keepStyle: {
            default: null,
            parseHTML: (el) => safeStyle((el as HTMLElement).getAttribute("style")),
            renderHTML: (attrs) => (attrs.keepStyle ? { style: String(attrs.keepStyle) } : {}),
          },
          keepClass: {
            default: null,
            parseHTML: (el) => safeClass((el as HTMLElement).getAttribute("class")),
            renderHTML: (attrs) => (attrs.keepClass ? { class: String(attrs.keepClass) } : {}),
          },
        },
      },
      {
        types: BLOCKS.concat(["tableCell", "tableHeader", "divBlock"]),
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
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          align: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).getAttribute("align"),
            renderHTML: (attrs) => (attrs.align ? { align: attrs.align } : {}),
          },
          valign: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).getAttribute("valign"),
            renderHTML: (attrs) => (attrs.valign ? { valign: attrs.valign } : {}),
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

/* ── Superscript / subscript ──────────────────────────────────── */

export const Superscript = Mark.create({
  name: "superscript",
  parseHTML() {
    return [{ tag: "sup" }, { style: "vertical-align", getAttrs: (v) => (v === "super" ? {} : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes), 0];
  },
});

export const Subscript = Mark.create({
  name: "subscript",
  parseHTML() {
    return [{ tag: "sub" }, { style: "vertical-align", getAttrs: (v) => (v === "sub" ? {} : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sub", mergeAttributes(HTMLAttributes), 0];
  },
});

/** Inline `style` on <span> that TextStyle does not already cover.
 *  Colour, size and family already travel on TextStyle — keeping them here as
 *  well would nest a second identical <span> on every export. */
const OWNED_BY_TEXTSTYLE = /^\s*(color|font-size|font-family|background-color)\s*:/i;

const inlineRest = (el: HTMLElement): string | null => {
  const rest = (safeStyle(el.getAttribute("style")) ?? "")
    .split(";")
    .filter((d) => d.trim() && !OWNED_BY_TEXTSTYLE.test(d))
    .join(";");
  return rest || null;
};

export const InlineStyle = Mark.create({
  name: "inlineStyle",
  priority: 90,
  addAttributes() {
    return {
      keepStyle: {
        default: null,
        parseHTML: (el) => inlineRest(el as HTMLElement),
        renderHTML: (attrs) => (attrs.keepStyle ? { style: String(attrs.keepStyle) } : {}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[style]",
        getAttrs: (el) => (inlineRest(el as HTMLElement) ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});
