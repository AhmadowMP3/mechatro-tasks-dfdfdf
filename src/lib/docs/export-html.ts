// Word/HTML serializer for business documents. Produces a Word-compatible
// HTML document (.doc) that mirrors the on-screen A4 paper exactly: branded
// header band with the logo, the same blocks/tables/totals, and the footer.
//
// Rationale: docx-js cannot reproduce the layout 1:1 and has no Arabic
// shaping guarantees inside tables, while Word's own HTML importer keeps our
// tables, colors, RTL and fonts. The file opens in Word / Google Docs and is
// fully editable there.

import { PAPER, type DocFooter, type DocHeader, type DocLang, type DocTheme } from "./types";
import { computeItems, money, type DocBlock, type DocClient, type DocModel } from "./model";
import { loadBrandLogo } from "@/lib/pdf/assets";

export type DocRenderInput = {
  header: DocHeader;
  footer: DocFooter;
  model: DocModel;
  client: DocClient;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  meta: { number: string; date: string; validUntil?: string; client?: string };
  title: string;
  /** Optional pre-computed page split (same one the PDF uses). */
  pages?: { showClientBox: boolean; blocks: DocBlock[] }[];
};

type Palette = { bg: string; surface: string; ink: string; muted: string; border: string; zebra: string };

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );

const nl2br = (s: unknown): string => esc(s).replace(/\r?\n/g, "<br/>");

export async function buildDocWordHtml(input: DocRenderInput): Promise<string> {
  const { header, footer, model, client, lang, theme, currency, meta, title } = input;
  const ar = lang === "ar";
  const c = PAPER[theme];
  const dir = ar ? "rtl" : "ltr";
  const align = ar ? "right" : "left";
  const opp = ar ? "left" : "right";
  const logo = header.showLogo ? await loadBrandLogo() : null;

  const contactBits = [
    header.phone,
    header.email,
    header.website,
    header.taxNumber ? (ar ? `الرقم الضريبي: ${header.taxNumber}` : `Tax No: ${header.taxNumber}`) : "",
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  const metaRows: [string, string][] = [
    [ar ? "الرقم" : "No.", meta.number || "—"],
    [ar ? "التاريخ" : "Date", meta.date || "—"],
  ];
  if (meta.validUntil) metaRows.push([ar ? "صالح حتى" : "Valid until", meta.validUntil]);
  if (meta.client) metaRows.push([ar ? "العميل" : "Client", meta.client]);

  const metaBox = header.showMetaBox
    ? `<table style="border-collapse:collapse;background:${c.surface};font-size:9pt" cellpadding="3">
        ${metaRows
          .map(
            ([k, v]) =>
              `<tr><td style="color:${c.muted};padding:2px 8px">${esc(k)}</td>` +
              `<td style="font-weight:bold;padding:2px 8px;direction:ltr">${esc(v)}</td></tr>`,
          )
          .join("")}
      </table>`
    : "";

  const headerBand = `
  <table style="width:100%;border-collapse:collapse" cellpadding="0">
    <tr>
      <td style="vertical-align:top;text-align:${align}">
        ${logo ? `<img src="${logo.dataUrl}" alt="Mechatro" height="${Math.round(header.logoHeight)}" style="height:${Math.round(header.logoHeight)}px" /><br/>` : ""}
        ${header.companyAr || header.companyEn ? `<span style="font-size:12pt;font-weight:bold">${esc(ar ? header.companyAr : header.companyEn)}</span><br/>` : ""}
        ${(ar ? header.addressAr : header.addressEn) ? `<span style="font-size:9pt;color:${c.muted}">${nl2br(ar ? header.addressAr : header.addressEn)}</span><br/>` : ""}
        ${contactBits.length ? `<span style="font-size:8.5pt;color:${c.muted};direction:ltr">${esc(contactBits.join("  ·  "))}</span>` : ""}
      </td>
      <td style="vertical-align:top;text-align:${opp};width:38%">
        ${(ar ? header.titleAr : header.titleEn) ? `<div style="font-size:18pt;font-weight:bold;color:${header.accent}">${esc(ar ? header.titleAr : header.titleEn)}</div>` : ""}
        ${metaBox}
      </td>
    </tr>
  </table>
  ${(ar ? header.extraAr : header.extraEn) ? `<div style="font-size:9pt;color:${c.muted};margin-top:8px">${nl2br(ar ? header.extraAr : header.extraEn)}</div>` : ""}
  ${header.showRule ? `<div style="border-top:2px solid ${header.accent};margin:10px 0 4px"></div>` : ""}`;

  // With a pre-computed page split, mirror the PDF exactly: each page's body
  // is emitted in order with an explicit page break between pages.
  const pages = input.pages && input.pages.length > 0 ? input.pages : null;
  const clientBox = pages
    ? pages[0]!.showClientBox ? renderClientBox(client, ar, c) : ""
    : model.showClientBox ? renderClientBox(client, ar, c) : "";
  const body = pages
    ? pages
        .map((p, i) => {
          const inner =
            (i > 0 && p.showClientBox ? renderClientBox(client, ar, c) : "") +
            p.blocks.map((b) => renderBlock(b, ar, c, currency)).join("");
          return i === 0 ? inner : `<div class="pb">${inner}</div>`;
        })
        .join("")
    : model.blocks.map((b) => renderBlock(b, ar, c, currency)).join("");

  const bank = ar ? footer.bankAr : footer.bankEn;
  const signature = ar ? footer.signatureAr : footer.signatureEn;
  const note = ar ? footer.noteAr : footer.noteEn;

  const footerBand = `
  ${footer.showRule ? `<div style="border-top:1px solid ${footer.accent};margin:14px 0 8px"></div>` : ""}
  ${
    bank || signature
      ? `<table style="width:100%;border-collapse:collapse"><tr>
          <td style="font-size:8.5pt;color:${c.muted};vertical-align:bottom;text-align:${align}">${nl2br(bank)}</td>
          <td style="font-size:8.5pt;color:${c.muted};vertical-align:bottom;text-align:center;width:30%">
            ${signature ? `<div style="border-top:1px solid ${c.border};padding-top:3px">${esc(signature)}</div>` : ""}
          </td>
        </tr></table>`
      : ""
  }
  <table style="width:100%;border-collapse:collapse;font-size:8pt;color:${c.muted}"><tr>
    <td style="text-align:${align}">${esc(footer.contactLine)}</td>
    <td style="text-align:center">${esc(note)}</td>
    <td style="text-align:${opp};direction:ltr">${footer.showGeneratedAt ? esc(new Date().toLocaleString("en-GB")) : ""}</td>
  </tr></table>`;

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument>
</xml><![endif]-->
<style>
@page WordSection1 { size: 21cm 29.7cm; margin: 1.4cm 1.4cm 1.2cm 1.4cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: 'Montserrat Arabic','Almarai','Montserrat','Segoe UI',sans-serif; font-size:10pt;
       color:${c.ink}; background:${c.bg}; direction:${dir}; text-align:${align}; }
table { mso-table-lspace:0pt; mso-table-rspace:0pt; }
td, th { vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
.pb { page-break-before: always; }

</style>
</head>
<body>
<div class="WordSection1">
${headerBand}
${clientBox}
${body}
${footerBand}
</div>
</body>
</html>`;
}

function renderClientBox(client: DocClient, ar: boolean, c: Palette): string {
  const name = ar ? client.nameAr || client.nameEn : client.nameEn || client.nameAr;
  const ref = ar ? client.refAr : client.refEn;
  const bits = [
    { l: ar ? "السيد/ة" : "Attn", v: client.attn },
    { l: ar ? "الهاتف" : "Phone", v: client.phone },
    { l: ar ? "الإيميل" : "Email", v: client.email },
    { l: ar ? "العنوان" : "Address", v: client.address },
    { l: ar ? "الرقم الضريبي" : "Tax No.", v: client.taxNumber },
    { l: ar ? "المرجع" : "Reference", v: ref },
  ].filter((b) => (b.v ?? "").trim());
  if (!name && bits.length === 0) return "";

  const cells = bits
    .map(
      (b, i) =>
        `${i % 2 === 0 ? "<tr>" : ""}<td style="font-size:9pt;padding:2px 6px;width:50%">` +
        `<span style="color:${c.muted}">${esc(b.l)}:</span> <span style="font-weight:bold">${esc(b.v)}</span></td>` +
        `${i % 2 === 1 ? "</tr>" : ""}`,
    )
    .join("");
  const closing = bits.length % 2 === 1 ? "<td></td></tr>" : "";

  return `<table style="width:100%;border-collapse:collapse;border:1px solid ${c.border};background:${c.surface};margin:12px 0" cellpadding="4">
    <tr><td colspan="2" style="font-size:8.5pt;color:${c.muted}">${ar ? "إلى" : "To"}</td></tr>
    ${name ? `<tr><td colspan="2" style="font-size:11pt;font-weight:bold">${esc(name)}</td></tr>` : ""}
    ${cells}${closing}
  </table>`;
}

function renderBlock(block: DocBlock, ar: boolean, c: Palette, currency: string): string {
  const cellBase = `border:1px solid ${c.border};padding:5px 7px;font-size:9.5pt`;
  const th = (t: string, w?: number) =>
    `<th style="${cellBase};background:${c.surface};font-weight:bold;text-align:inherit${w ? `;width:${w}px` : ""}">${esc(t)}</th>`;
  const td = (t: string, o?: { bold?: boolean; ltr?: boolean; colSpan?: number; end?: boolean }) =>
    `<td${o?.colSpan ? ` colspan="${o.colSpan}"` : ""} style="${cellBase}${o?.bold ? ";font-weight:bold" : ""}${o?.ltr ? ";direction:ltr" : ""}${o?.end ? ";text-align:end" : ""}">${esc(t)}</td>`;

  switch (block.kind) {
    case "heading": {
      const t = ar ? block.ar : block.en;
      return t ? `<div style="font-size:12.5pt;font-weight:bold;margin:14px 0 4px">${esc(t)}</div>` : "";
    }
    case "text": {
      const t = ar ? block.ar : block.en;
      return t ? `<div style="font-size:10pt;line-height:1.7;margin:6px 0">${nl2br(t)}</div>` : "";
    }
    case "spacer":
      return `<div style="height:${Math.max(4, block.size)}px">&nbsp;</div>`;
    case "pagebreak":
      return `<br clear="all" style="mso-special-character:line-break;page-break-before:always" /><div class="pb"></div>`;
    case "terms": {
      const t = ar ? block.ar : block.en;
      if (!t) return "";
      return `<table style="width:100%;border-collapse:collapse;border:1px solid ${c.border};margin:12px 0" cellpadding="6"><tr><td>
        <div style="font-size:10pt;font-weight:bold;margin-bottom:4px">${esc(ar ? block.titleAr : block.titleEn)}</div>
        <div style="font-size:9pt;color:${c.muted};line-height:1.7">${nl2br(t)}</div>
      </td></tr></table>`;
    }
    case "keyvalue": {
      const rows = block.rows.filter((r) => (ar ? r.kAr || r.vAr : r.kEn || r.vEn));
      if (!rows.length) return "";
      return `${(ar ? block.titleAr : block.titleEn) ? `<div style="font-size:10.5pt;font-weight:bold;margin:12px 0 4px">${esc(ar ? block.titleAr : block.titleEn)}</div>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px" cellpadding="4">
        ${rows
          .map(
            (r) =>
              `<tr><td style="font-size:9.5pt;color:${c.muted};border-bottom:1px dashed ${c.border};width:38%">${esc(ar ? r.kAr : r.kEn)}</td>` +
              `<td style="font-size:9.5pt;font-weight:bold;border-bottom:1px dashed ${c.border}">${esc(ar ? r.vAr : r.vEn)}</td></tr>`,
          )
          .join("")}
      </table>`;
    }
    case "table": {
      const head = ar ? block.headAr : block.headEn;
      if (!block.rows.length) return "";
      return `${(ar ? block.titleAr : block.titleEn) ? `<div style="font-size:10.5pt;font-weight:bold;margin:12px 0 4px">${esc(ar ? block.titleAr : block.titleEn)}</div>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
        <tr>${head.map((h) => th(h)).join("")}</tr>
        ${block.rows
          .map((r, i) => {
            const cells = ar ? r.cellsAr : r.cellsEn;
            return `<tr${i % 2 ? ` style="background:${c.zebra}"` : ""}>${head.map((_, ci) => td(cells[ci] ?? "")).join("")}</tr>`;
          })
          .join("")}
      </table>`;
    }
    case "items": {
      const t = computeItems(block);
      const cols = 3 + (block.showUnit ? 1 : 0) + (block.showQty ? 1 : 0) + (block.showPrice ? 1 : 0);
      const sum = (label: string, value: string, bold?: boolean) =>
        `<tr${bold ? ` style="background:${c.surface}"` : ""}>${td(label, { colSpan: cols - 1, bold, end: true })}${td(value, { bold, ltr: true })}</tr>`;
      return `${(ar ? block.titleAr : block.titleEn) ? `<div style="font-size:10.5pt;font-weight:bold;margin:12px 0 4px">${esc(ar ? block.titleAr : block.titleEn)}</div>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
        <tr>
          ${th("#", 28)}${th(ar ? "البيان" : "Description")}
          ${block.showUnit ? th(ar ? "الوحدة" : "Unit", 60) : ""}
          ${block.showQty ? th(ar ? "الكمية" : "Qty", 50) : ""}
          ${block.showPrice ? th(ar ? "سعر الوحدة" : "Unit price", 80) : ""}
          ${th(ar ? "الإجمالي" : "Total", 90)}
        </tr>
        ${t.lines
          .map(
            (l, i) =>
              `<tr${i % 2 ? ` style="background:${c.zebra}"` : ""}>${td(String((block.startIndex ?? 0) + i + 1))}${td((ar ? l.row.descAr : l.row.descEn) || "—")}` +
              `${block.showUnit ? td(ar ? l.row.unitAr : l.row.unitEn) : ""}` +
              `${block.showQty ? td(String(l.row.qty), { ltr: true }) : ""}` +
              `${block.showPrice ? td(money(l.row.price, ""), { ltr: true }) : ""}` +
              `${td(money(l.total, ""), { ltr: true })}</tr>`,
          )
          .join("")}
        ${
          block.showTotals
            ? [
                sum(ar ? "المجموع" : "Subtotal", money(t.subtotal, currency)),
                t.discount > 0 ? sum(ar ? "الخصم" : "Discount", `- ${money(t.discount, currency)}`) : "",
                block.taxRate > 0 ? sum(`${ar ? "الضريبة" : "Tax"} ${block.taxRate}%`, money(t.tax, currency)) : "",
                t.shipping > 0 ? sum(ar ? "الشحن" : "Shipping", money(t.shipping, currency)) : "",
                sum(ar ? "الإجمالي النهائي" : "Grand total", money(t.grand, currency), true),
              ].join("")
            : ""
        }
      </table>`;
    }
    default:
      return "";
  }
}

/** Download the Word-compatible document to the user's device. */
export async function downloadDocWord(input: DocRenderInput, filename: string): Promise<void> {
  const html = await buildDocWordHtml(input);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
