// Draws the unified header (logo) and footer (Page X/Y + generated meta) on
// every page of a jsPDF document. All positioning is in millimetres.

import type { jsPDF } from "jspdf";
import { BRAND, PAGE, formatGeneratedAt } from "./brand";
import { loadBrandLogo, loadArabicFontB64 } from "./assets";

export type ChromeOptions = {
  lang: "ar" | "en";
  generatedBy?: string | null;
};

const FONT_ID = "MontserratArabic";

let fontEmbedded = new WeakSet<object>();

async function ensureFonts(pdf: jsPDF): Promise<boolean> {
  if (fontEmbedded.has(pdf)) return true;
  const b64 = await loadArabicFontB64();
  if (!b64) return false;
  try {
    pdf.addFileToVFS("MontserratArabic-Regular.ttf", b64);
    pdf.addFont("MontserratArabic-Regular.ttf", FONT_ID, "normal");
    fontEmbedded.add(pdf);
    return true;
  } catch {
    return false;
  }
}

/** Convert ASCII digits to Arabic-Indic when producing Arabic text. */
function shapeDigits(s: string, lang: "ar" | "en"): string {
  if (lang !== "ar") return s;
  return s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d, 10)]);
}

/** Choose the safest font for a given string (uses embedded Arabic when the
 *  string contains Arabic codepoints, otherwise the default Helvetica). */
function setFont(pdf: jsPDF, text: string, hasArabicFont: boolean, weight: "normal" | "bold" = "normal") {
  const containsArabic = /[\u0600-\u06FF]/.test(text);
  if (containsArabic && hasArabicFont) {
    pdf.setFont(FONT_ID, "normal");
  } else {
    pdf.setFont("helvetica", weight);
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

async function drawHeader(pdf: jsPDF, hasArabicFont: boolean) {
  const logo = await loadBrandLogo();
  const pageW = pdf.internal.pageSize.getWidth();
  // Gold hairline under header band.
  const [gr, gg, gb] = hexToRgb(BRAND.gold);
  pdf.setDrawColor(gr, gg, gb);
  pdf.setLineWidth(0.4);
  pdf.line(12, PAGE.marginTop - 4, pageW - 12, PAGE.marginTop - 4);

  if (logo?.dataUrl) {
    const targetH = 12; // mm
    const ratio = logo.widthPx / Math.max(1, logo.heightPx);
    const targetW = Math.min(60, targetH * ratio);
    // Left-aligned on both LTR and RTL — the mark is a bilingual wordmark.
    pdf.addImage(logo.dataUrl, "PNG", 12, 6, targetW, targetH, undefined, "FAST");
  } else {
    // Fallback: text wordmark
    pdf.setTextColor(...hexToRgb(BRAND.navy));
    setFont(pdf, "Mechatro", hasArabicFont, "bold");
    pdf.setFontSize(16);
    pdf.text("Mechatro", 12, 14);
  }
}

function drawFooter(
  pdf: jsPDF,
  pageNum: number,
  totalPages: number,
  opts: ChromeOptions,
  hasArabicFont: boolean,
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const y = pageH - PAGE.marginBottom + 5;
  const isAr = opts.lang === "ar";

  // Gold hairline above footer.
  const [gr, gg, gb] = hexToRgb(BRAND.gold);
  pdf.setDrawColor(gr, gg, gb);
  pdf.setLineWidth(0.4);
  pdf.line(12, pageH - PAGE.marginBottom + 1, pageW - 12, pageH - PAGE.marginBottom + 1);

  const [mr, mg, mb] = hexToRgb(BRAND.muted);
  pdf.setTextColor(mr, mg, mb);
  pdf.setFontSize(8.5);

  // Left: Page X / Y (LTR) or Generated (RTL, mirror)
  // Right: Generated (LTR) or Page X / Y (RTL)
  const pageStr = isAr
    ? shapeDigits(`الصفحة ${pageNum} / ${totalPages}`, "ar")
    : `Page ${pageNum} / ${totalPages}`;
  const genLabel = isAr ? "أُنشئ" : "Generated";
  const byLabel = isAr ? "بواسطة" : "by";
  const who = (opts.generatedBy ?? "").trim();
  const genStr = who
    ? `${genLabel}: ${formatGeneratedAt(opts.lang)} · ${byLabel} ${who}`
    : `${genLabel}: ${formatGeneratedAt(opts.lang)}`;

  // Center brand wordmark
  const center = isAr ? `${BRAND.name} · ${BRAND.nameAr}` : `${BRAND.name} · ${BRAND.nameAr}`;
  setFont(pdf, center, hasArabicFont);
  const centerW = pdf.getTextWidth(center);
  pdf.text(center, (pageW - centerW) / 2, y + 3);

  // Page counter — outer side
  setFont(pdf, pageStr, hasArabicFont);
  if (isAr) {
    // Arabic reads right-to-left; put page counter on the right.
    const w = pdf.getTextWidth(pageStr);
    pdf.text(pageStr, pageW - 12 - w, y + 3);
  } else {
    pdf.text(pageStr, 12, y + 3);
  }

  // Generated meta — inner side (opposite of page counter)
  setFont(pdf, genStr, hasArabicFont);
  if (isAr) {
    pdf.text(genStr, 12, y + 3);
  } else {
    const w = pdf.getTextWidth(genStr);
    pdf.text(genStr, pageW - 12 - w, y + 3);
  }
}

/** After all pages are added, stamp the header + footer on every one. */
export async function stampChrome(pdf: jsPDF, opts: ChromeOptions): Promise<void> {
  const hasArabicFont = await ensureFonts(pdf);
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    await drawHeader(pdf, hasArabicFont);
    drawFooter(pdf, i, total, opts, hasArabicFont);
  }
}
