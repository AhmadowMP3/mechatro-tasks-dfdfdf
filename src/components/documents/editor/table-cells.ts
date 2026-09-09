// TipTap's default TableCell / TableHeader only declare colspan, rowspan and
// colwidth, so Word cell shading is dropped the moment a document is loaded.
// These extended versions add a `backgroundColor` attribute. Register them
// INSTEAD of the defaults — registering both means the default wins.

import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

const FILL_RE = /^#[0-9A-Fa-f]{6}$/;

const toHex = (raw: string | null | undefined): string | null => {
  const v = (raw ?? "").trim();
  if (!v || /^(auto|transparent|inherit|none)$/i.test(v)) return null;
  if (FILL_RE.test(v)) return v.toUpperCase();
  const short = /^#([0-9A-Fa-f]{3})$/.exec(v);
  if (short) return `#${short[1].split("").map((c) => c + c).join("")}`.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("")}`.toUpperCase();
  }
  return null;
};

const backgroundColor = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) =>
      toHex(el.getAttribute("data-bg") ?? el.style.backgroundColor ?? el.getAttribute("bgcolor")),
    renderHTML: (attrs: Record<string, unknown>) => {
      const color = toHex(typeof attrs.backgroundColor === "string" ? attrs.backgroundColor : null);
      if (!color) return {};
      return { "data-bg": color, style: `background-color:${color}` };
    },
  },
};

export const ShadedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColor };
  },
});

export const ShadedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColor };
  },
});
