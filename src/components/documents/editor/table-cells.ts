// TipTap's default TableCell / TableHeader only declare colspan, rowspan and
// colwidth, so Word cell shading is dropped the moment a document is loaded.
// These extended versions add a `backgroundColor` attribute. Register them
// INSTEAD of the defaults — registering both means the default wins.

import { Table } from "@tiptap/extension-table";
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


/**
 * The table node itself carries its width alignment and RTL flag, so editing a
 * cell never resets an imported table to a full-width left-aligned grid.
 */
const pctOf = (raw: string | null | undefined): number | null => {
  const n = parseFloat((raw ?? "").replace("%", ""));
  return Number.isFinite(n) && n > 0 ? Math.min(100, n) : null;
};

export const GeometryTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableAlign: {
        default: "left" as string,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-table-align") ?? "left",
        renderHTML: () => ({}),
      },
      tableRtl: {
        default: false,
        parseHTML: (el: HTMLElement) => (el.getAttribute("dir") ?? "").toLowerCase() === "rtl",
        renderHTML: (attrs: Record<string, unknown>) => (attrs.tableRtl ? { dir: "rtl" } : {}),
      },
      /**
       * The table's own width, as a percentage of the body. Rendered inline so
       * the editor shows exactly what `toHtml` prints.
       */
      tableWidthPct: {
        default: 100,
        parseHTML: (el: HTMLElement) =>
          pctOf(el.getAttribute("data-width-pct")) ?? pctOf(el.style?.width) ?? 100,
        renderHTML: (attrs: Record<string, unknown>) => {
          const pct = pctOf(String(attrs.tableWidthPct ?? "")) ?? 100;
          const align = String(attrs.tableAlign ?? "left");
          const margin =
            align === "center"
              ? "margin-inline:auto"
              : align === "right"
                ? "margin-inline-start:auto;margin-inline-end:0"
                : "margin-inline-start:0;margin-inline-end:auto";
          return {
            "data-width-pct": String(pct),
            "data-table-align": align,
            style: `width:${pct}%;${margin}`,
          };
        },
      },
    };
  },
});
