// Word/HTML serializer for business documents. Produces a Word-compatible
// HTML document (.doc) that mirrors the on-screen A4 paper exactly: branded
// header band with the logo, the same blocks/tables/totals, and the footer.
//
// Rationale: docx-js cannot reproduce the layout 1:1 and has no Arabic
// shaping guarantees inside tables, while Word's own HTML importer keeps our
// tables, colors, RTL and fonts. The file opens in Word / Google Docs and is
// fully editable there.

import { PAPER, type DocFooter, type DocHeader, type DocLang, type DocTheme } from "./types";
import { type DocClient, type DocModel } from "./model";
import { loadBrandLogo } from "@/lib/pdf/assets";
import { logoFilter } from "@/components/documents/DocPaper";

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
  pages?: { showClientBox: boolean; html?: string }[];
};

type Palette = { bg: string; surface: string; ink: string; muted: string; border: string; zebra: string };

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );

const nl2br = (s: unknown): string => esc(s).replace(/\r?\n/g, "<br/>");

export async function buildDocWordHtml(input: DocRenderInput): Promise<string> {
  const { header, footer, model, client, lang, theme, meta, title } = input;
  const ar = lang === "ar";
  const c = PAPER[theme];
  const dir = ar ? "rtl" : "ltr";
  const align = ar ? "right" : "left";
  const opp = ar ? "left" : "right";
  const logo = header.showLogo ? await loadBrandLogo(ar ? "ar" : "en") : null;
  const logoCss = logoFilter(model.logoVariant, theme) ? `;filter:${logoFilter(model.logoVariant, theme)}` : "";

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

  const logoBand = logo
    ? `<div style="text-align:${header.logoAlign === "center" ? "center" : header.logoAlign === "end" ? opp : align};margin-bottom:10px">` +
      `<img src="${logo.dataUrl}" alt="Mechatro" height="${Math.round(header.logoHeight)}" style="height:${Math.round(header.logoHeight)}px;max-width:100%${logoCss}" /></div>`
    : "";

  const headerBand = `
  ${logoBand}
  <table style="width:100%;border-collapse:collapse;table-layout:fixed" cellpadding="0">
    <tr>
      <td style="vertical-align:top;text-align:${align};width:31%">
        ${header.companyAr || header.companyEn ? `<span style="font-size:12pt;font-weight:bold">${esc(ar ? header.companyAr : header.companyEn)}</span><br/>` : ""}
        ${(ar ? header.addressAr : header.addressEn) ? `<span style="font-size:9pt;color:${c.muted}">${nl2br(ar ? header.addressAr : header.addressEn)}</span><br/>` : ""}
        ${contactBits.length ? `<span style="font-size:8.5pt;color:${c.muted};direction:ltr">${esc(contactBits.join("  ·  "))}</span>` : ""}
      </td>
      <td style="vertical-align:top;text-align:center;width:38%">
        ${(ar ? header.titleAr : header.titleEn) ? `<div style="font-size:17pt;font-weight:bold;color:${header.accent};${ar ? "" : "text-transform:uppercase;letter-spacing:1px;"}">${esc(ar ? header.titleAr : header.titleEn)}</div>` : ""}
      </td>
      <td style="vertical-align:top;text-align:${opp};width:31%">
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
            (typeof p.html === "string" ? p.html : "");
          return i === 0 ? inner : `<div class="pb">${inner}</div>`;
        })
        .join("")
    : (model.html ?? "");

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
  <table style="width:100%;border-collapse:collapse;font-size:8pt;color:${c.muted}">
    ${footer.contactRows
      .map((row) => {
        const text = ((ar ? row.ar : row.en) || (ar ? row.en : row.ar) || "").trim();
        if (!text) return "";
        return `<tr><td style="text-align:${align};direction:${dir};width:100%">${esc(text)}</td></tr>`;
      })
      .join("")}
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:8pt;color:${c.muted};margin-top:4px"><tr>
    <td style="text-align:${align}">${esc(note)}</td>
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
img { max-width:100%; height:auto; page-break-inside: avoid; }
img[data-align="center"] { display:block; margin-left:auto; margin-right:auto; }
img[data-align="right"] { display:block; margin-left:auto; margin-right:0; }
img[data-align="left"] { display:block; margin-left:0; margin-right:auto; }


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
