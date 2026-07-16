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

/** Digits are always rendered in Latin/ASCII across the app, even in Arabic. */
function shapeDigits(s: string, _lang: "ar" | "en"): string {
  return s;
}

/** Choose the safest font for a given string. In Arabic-mode PDFs we always
 *  use the embedded Montserrat Arabic (it also covers Latin glyphs), so
 *  headers/footers render in a single consistent typeface. */
function setFont(
  pdf: jsPDF,
  text: string,
  hasArabicFont: boolean,
  lang: "ar" | "en",
  weight: "normal" | "bold" = "normal",
) {
  const containsArabic = /[\u0600-\u06FF]/.test(text);
  if (hasArabicFont && (lang === "ar" || containsArabic)) {
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

async function drawHeader(pdf: jsPDF, hasArabicFont: boolean, lang: "ar" | "en") {
  const logo = await loadBrandLogo();
  const pageW = pdf.internal.pageSize.getWidth();
  // Blue hairline under header band.
  const [br, bg, bb] = hexToRgb(BRAND.blue);
  pdf.setDrawColor(br, bg, bb);
  pdf.setLineWidth(0.5);
  pdf.line(12, PAGE.marginTop - 4, pageW - 12, PAGE.marginTop - 4);

  if (logo?.dataUrl) {
    const targetH = 14; // mm
    const ratio = logo.widthPx / Math.max(1, logo.heightPx);
    const targetW = Math.min(64, targetH * ratio);
    pdf.addImage(logo.dataUrl, "PNG", 12, 5, targetW, targetH, undefined, "FAST");
  } else {
    pdf.setTextColor(...hexToRgb(BRAND.ink));
    setFont(pdf, "Mechatro", hasArabicFont, lang, "bold");
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

  // Cyan hairline above footer.
  const [br, bg, bb] = hexToRgb(BRAND.blue);
  pdf.setDrawColor(br, bg, bb);
  pdf.setLineWidth(0.5);
  pdf.line(12, pageH - PAGE.marginBottom + 1, pageW - 12, pageH - PAGE.marginBottom + 1);

  const [mr, mg, mb] = hexToRgb(BRAND.muted);
  pdf.setTextColor(mr, mg, mb);
  pdf.setFontSize(8.5);

  const pageStr = isAr
    ? shapeDigits(`الصفحة ${pageNum} / ${totalPages}`, "ar")
    : `Page ${pageNum} / ${totalPages}`;
  const genLabel = isAr ? "أُنشئ" : "Generated";
  const byLabel = isAr ? "بواسطة" : "by";
  const who = (opts.generatedBy ?? "").trim();
  const genStr = who
    ? `${genLabel}: ${formatGeneratedAt(opts.lang)} · ${byLabel} ${who}`
    : `${genLabel}: ${formatGeneratedAt(opts.lang)}`;

  const center = `${BRAND.name} · ${BRAND.nameAr}`;
  setFont(pdf, center, hasArabicFont);
  const centerW = pdf.getTextWidth(center);
  pdf.text(center, (pageW - centerW) / 2, y + 3);

  setFont(pdf, pageStr, hasArabicFont);
  if (isAr) {
    const w = pdf.getTextWidth(pageStr);
    pdf.text(pageStr, pageW - 12 - w, y + 3);
  } else {
    pdf.text(pageStr, 12, y + 3);
  }

  setFont(pdf, genStr, hasArabicFont);
  if (isAr) {
    pdf.text(genStr, 12, y + 3);
  } else {
    const w = pdf.getTextWidth(genStr);
    pdf.text(genStr, pageW - 12 - w, y + 3);
  }
}

/** Fill the current page with the brand-dark background so any negative space
 *  around the rasterised content blends into a single navy canvas. */
function fillPageBackground(pdf: jsPDF) {
  const [r, g, b] = hexToRgb(BRAND.navy);
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(r, g, b);
  pdf.rect(0, 0, pageW, pageH, "F");
}

/** After all pages are added, stamp the header + footer on every one. */
export async function stampChrome(pdf: jsPDF, opts: ChromeOptions): Promise<void> {
  const hasArabicFont = await ensureFonts(pdf);
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    // Header/footer draw on top of the rasterised content, so we don't repaint
    // the page background here (that would erase the content). Callers that
    // need a dark page fill should call it before adding images.
    await drawHeader(pdf, hasArabicFont);
    drawFooter(pdf, i, total, opts, hasArabicFont);
  }
}

/** Exported so pdf-export.ts can paint the dark backdrop per page before
 *  stamping the rasterised content, keeping the whole document on-brand. */
export { fillPageBackground };
