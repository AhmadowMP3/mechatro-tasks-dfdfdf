// Rich (Word-style) document content: the body is a single HTML string
// authored in the editor. Two things inside that HTML are dynamic and get
// rebuilt on every render/export:
//
//   • <table data-items="{…}">  — the smart items table (auto totals)
//   • <span data-doc-field="…"> — auto fields (number / date / totals …)
//
// Everything else is plain formatted HTML (fonts, colors, tables, images),
// so it prints, paginates and exports to Word 1:1 with what was typed.

import { PAPER, type DocLang, type DocTheme } from "./types";
import { computeItems, money, uid, type ItemRow } from "./model";

export type ItemsData = {
  titleAr: string;
  titleEn: string;
  rows: ItemRow[];
  showUnit: boolean;
  showQty: boolean;
  showPrice: boolean;
  showTotals: boolean;
  taxRate: number;
  discount: number;
  shipping: number;
};

export type RichCtx = {
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  meta: { number?: string; date?: string; validUntil?: string; client?: string };
};

export function emptyItemsData(): ItemsData {
  return {
    titleAr: "البنود",
    titleEn: "Items",
    rows: [{ id: uid(), descAr: "", descEn: "", unitAr: "", unitEn: "", qty: 1, price: 0, discount: 0 }],
    showUnit: true,
    showQty: true,
    showPrice: true,
    showTotals: true,
    taxRate: 0,
    discount: 0,
    shipping: 0,
  };
}

export function mergeItemsData(raw: unknown): ItemsData {
  const base = emptyItemsData();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ItemsData>;
  const rows = Array.isArray(r.rows) && r.rows.length > 0 ? r.rows : base.rows;
  return { ...base, ...r, rows };
}

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

/* ── Auto fields ──────────────────────────────────────────────── */

export const DOC_FIELDS = [
  { key: "number", ar: "رقم المستند", en: "Document no." },
  { key: "date", ar: "التاريخ", en: "Date" },
  { key: "validUntil", ar: "صالح حتى", en: "Valid until" },
  { key: "client", ar: "اسم العميل", en: "Client name" },
  { key: "currency", ar: "العملة", en: "Currency" },
  { key: "subtotal", ar: "المجموع الفرعي", en: "Subtotal" },
  { key: "tax", ar: "الضريبة", en: "Tax" },
  { key: "total", ar: "الإجمالي النهائي", en: "Grand total" },
] as const;

export type DocFieldKey = (typeof DOC_FIELDS)[number]["key"];

export function fieldLabel(key: string, lang: DocLang): string {
  const f = DOC_FIELDS.find((d) => d.key === key);
  return f ? (lang === "ar" ? f.ar : f.en) : key;
}

/** Sum every items table found in the body so total fields stay correct. */
function docTotals(html: string, doc: Document | null): { subtotal: number; tax: number; grand: number } {
  let subtotal = 0;
  let tax = 0;
  let grand = 0;
  const tables = doc ? Array.from(doc.querySelectorAll("table[data-items]")) : [];
  for (const el of tables) {
    const data = readItemsAttr(el.getAttribute("data-items"));
    if (!data) continue;
    const t = computeItems(data);
    subtotal += t.subtotal;
    tax += t.tax;
    grand += t.grand;
  }
  void html;
  return { subtotal, tax, grand };
}

export function fieldValue(key: string, ctx: RichCtx, totals: { subtotal: number; tax: number; grand: number }): string {
  switch (key) {
    case "number": return ctx.meta.number ?? "—";
    case "date": return ctx.meta.date ?? "—";
    case "validUntil": return ctx.meta.validUntil ?? "—";
    case "client": return ctx.meta.client ?? "—";
    case "currency": return ctx.currency;
    case "subtotal": return money(totals.subtotal, ctx.currency);
    case "tax": return money(totals.tax, ctx.currency);
    case "total": return money(totals.grand, ctx.currency);
    default: return fieldLabel(key, ctx.lang);
  }
}

export function readItemsAttr(raw: string | null): ItemsData | null {
  if (!raw) return null;
  try { return mergeItemsData(JSON.parse(decodeURIComponent(raw))); } catch { /* fall through */ }
  try { return mergeItemsData(JSON.parse(raw)); } catch { return null; }
}

export function writeItemsAttr(data: ItemsData): string {
  return encodeURIComponent(JSON.stringify(data));
}

/* ── Smart items table markup ─────────────────────────────────── */

export function buildItemsTableHtml(data: ItemsData, ctx: RichCtx, startIndex = 0, showTotals = data.showTotals): string {
  const ar = ctx.lang === "ar";
  const c = PAPER[ctx.theme];
  const t = computeItems(data);
  const cols = 2 + (data.showUnit ? 1 : 0) + (data.showQty ? 1 : 0) + (data.showPrice ? 1 : 0) + 1;
  const th = (label: string, w?: number) =>
    `<th style="border:1px solid ${c.border};padding:6px 8px;font-weight:700;text-align:inherit;background:${c.surface}${w ? `;width:${w}px` : ""}">${esc(label)}</th>`;
  const td = (v: unknown, opts?: { bold?: boolean; ltr?: boolean; alignEnd?: boolean; span?: number }) =>
    `<td${opts?.span ? ` colspan="${opts.span}"` : ""} style="border:1px solid ${c.border};padding:6px 8px;vertical-align:top;` +
    `${opts?.bold ? "font-weight:700;" : ""}${opts?.ltr ? "direction:ltr;" : ""}${opts?.alignEnd ? `text-align:${ar ? "left" : "right"};` : ""}">${esc(v)}</td>`;

  const head =
    `<tr>${th("#", 32)}${th(ar ? "البيان" : "Description")}` +
    (data.showUnit ? th(ar ? "الوحدة" : "Unit", 70) : "") +
    (data.showQty ? th(ar ? "الكمية" : "Qty", 60) : "") +
    (data.showPrice ? th(ar ? "سعر الوحدة" : "Unit price", 90) : "") +
    th(ar ? "الإجمالي" : "Total", 100) +
    "</tr>";

  const body = t.lines
    .map((l, i) => {
      const zebra = i % 2 ? `background:${c.zebra};` : "";
      return (
        `<tr style="${zebra}">` +
        td(startIndex + i + 1) +
        td((ar ? l.row.descAr : l.row.descEn) || "—") +
        (data.showUnit ? td(ar ? l.row.unitAr : l.row.unitEn) : "") +
        (data.showQty ? td(l.row.qty, { ltr: true }) : "") +
        (data.showPrice ? td(money(l.row.price, ""), { ltr: true }) : "") +
        td(money(l.total, ""), { ltr: true }) +
        "</tr>"
      );
    })
    .join("");

  const sum = (label: string, value: string, bold = false) =>
    `<tr${bold ? ` style="background:${c.surface}"` : ""}>${td(label, { span: cols - 1, bold, alignEnd: true })}${td(value, { bold, ltr: true })}</tr>`;

  const totals = showTotals
    ? sum(ar ? "المجموع" : "Subtotal", money(t.subtotal, ctx.currency)) +
      (t.discount > 0 ? sum(ar ? "الخصم" : "Discount", `- ${money(t.discount, ctx.currency)}`) : "") +
      (Number(data.taxRate) > 0 ? sum(`${ar ? "الضريبة" : "Tax"} ${data.taxRate}%`, money(t.tax, ctx.currency)) : "") +
      (t.shipping > 0 ? sum(ar ? "الشحن" : "Shipping", money(t.shipping, ctx.currency)) : "") +
      sum(ar ? "الإجمالي النهائي" : "Grand total", money(t.grand, ctx.currency), true)
    : "";

  const title = (ar ? data.titleAr : data.titleEn) && startIndex === 0
    ? `<caption style="caption-side:top;text-align:inherit;font-weight:700;font-size:12.5px;padding-bottom:5px">${esc(ar ? data.titleAr : data.titleEn)}</caption>`
    : "";

  return (
    `<table data-items="${writeItemsAttr(data)}" style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;margin:6px 0">` +
    `${title}<thead>${head}</thead><tbody>${body}${totals}</tbody></table>`
  );
}

/**
 * Rebuild the dynamic parts of the body HTML for the current language, theme,
 * currency and meta. Browser-only (uses DOMParser); returns the input on the
 * server so SSR never crashes.
 */
export function resolveDocHtml(html: string, ctx: RichCtx): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html ?? "";
  const doc = new DOMParser().parseFromString(`<div id="root">${html ?? ""}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return html ?? "";

  const totals = docTotals(html, doc);

  root.querySelectorAll("span[data-doc-field]").forEach((el) => {
    const key = el.getAttribute("data-doc-field") ?? "";
    el.textContent = fieldValue(key, ctx, totals);
  });

  root.querySelectorAll("table[data-items]").forEach((el) => {
    const data = readItemsAttr(el.getAttribute("data-items"));
    if (!data) return;
    const wrap = doc.createElement("div");
    wrap.innerHTML = buildItemsTableHtml(data, ctx);
    const fresh = wrap.firstElementChild;
    if (fresh) el.replaceWith(fresh);
  });

  return root.innerHTML;
}

/** Seed body for a brand-new document (Word-style HTML). */
export function starterBodyHtml(opts: { lang: DocLang; termsAr?: string; termsEn?: string }): string {
  const ar = opts.lang === "ar";
  const terms = (ar ? opts.termsAr : opts.termsEn) ?? "";
  const items = `<table data-items="${writeItemsAttr(emptyItemsData())}"></table>`;
  const termsHtml = terms
    ? `<h3>${esc(ar ? "الشروط والأحكام" : "Terms & Conditions")}</h3>` +
      terms
        .split(/\n{2,}/)
        .map((p) => `<p style="font-size:11px">${esc(p).replace(/\n/g, "<br/>") || "<br/>"}</p>`)
        .join("")
    : "";
  return `<p><br/></p>${items}<p><br/></p>${termsHtml}`;
}
