// The Mechatro letterhead as a stand-alone HTML document: one A4 sheet per
// page of the imported file, each carrying the header (logo, title, number,
// dates) and the footer (contacts, page X / Y). The body area is transparent,
// so the sheet can be laid over the imported page.
//
// The same HTML is laid out twice: once here in a hidden iframe (to measure
// the bands) and once by Chromium on the server (to print them). Two rules
// keep the two layouts identical:
//   1. Every font is embedded as a data URL — no system or web-font fallback
//      can differ between the user's browser and the server.
//   2. The measured header/footer heights are written back into the printed
//      HTML as fixed heights, so a band can never grow into the content.

import { DocPaper } from "@/components/documents/DocPaper";
import { logoFor } from "@/lib/brand/logo";
import { loadArabicFontB64, loadLatinFontB64 } from "@/lib/pdf/assets";
import type { DocFooter, DocHeader, DocLang } from "@/lib/docs/types";
import type { LogoVariant } from "@/lib/docs/model";

import type { LetterheadBands } from "./prepare-docx";

export type LetterheadInput = {
  header: DocHeader;
  footer: DocFooter;
  lang: DocLang;
  meta: { number?: string; date?: string; validUntil?: string; client?: string };
  logoVariant?: LogoVariant;
};

/** Measured band heights, written back as fixed heights when printing. */
export type LetterheadLock = { headerPx: number; footerPx: number };

/** Bands for the imported content plus the lock for the printed sheets. */
export type MeasuredLetterhead = LetterheadBands & { lock: LetterheadLock };

/** 297 mm in CSS px — the real sheet height Chromium prints. */
export const A4_HEIGHT_PX = (297 * 96) / 25.4;
/** 210 mm in CSS px. */
export const A4_WIDTH_PX = (210 * 96) / 25.4;
/** Space kept between the imported body and the letterhead bands. */
export const BAND_GAP_PX = 8;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

const logoCache = new Map<string, Promise<string | null>>();

function logoDataUrl(src: string): Promise<string | null> {
  let hit = logoCache.get(src);
  if (!hit) {
    hit = fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(blobToDataUrl)
      .catch(() => null);
    logoCache.set(src, hit);
  }
  return hit;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Font stack used for every element of the sheet — embedded fonts only. */
export function letterheadFontStack(lang: DocLang): string {
  return lang === "ar" ? "'LH Arabic', 'LH Latin'" : "'LH Latin', 'LH Arabic'";
}

/** @font-face rules for the embedded fonts (empty string for a missing one). */
export function letterheadFontFaces(fonts: { arabic: string | null; latin: string | null }): string {
  const face = (family: string, b64: string | null, weight: string) =>
    b64
      ? `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: block; src: url(data:font/ttf;base64,${b64}) format('truetype'); }`
      : "";
  return [face("LH Arabic", fonts.arabic, "100 900"), face("LH Latin", fonts.latin, "100 900")].join("\n");
}

/** CSS that fixes the band heights to what was measured. */
export function letterheadLockCss(lock: LetterheadLock | undefined): string {
  if (!lock) return "";
  const h = Math.max(0, Math.round(lock.headerPx * 100) / 100);
  const f = Math.max(0, Math.round(lock.footerPx * 100) / 100);
  return `
  .lh-page [data-doc-header] { height: ${h}px !important; min-height: ${h}px !important; max-height: ${h}px !important; overflow: hidden !important; box-sizing: border-box; }
  .lh-page [data-doc-footer] { height: ${f}px !important; min-height: ${f}px !important; max-height: ${f}px !important; overflow: hidden !important; box-sizing: border-box; }`;
}

/** Full HTML document with `total` letterhead sheets. */
export async function letterheadHtml(input: LetterheadInput, total: number, lock?: LetterheadLock): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const ar = input.lang === "ar";
  const logoSrc = logoFor(input.lang);
  const [logo, arabic, latin] = await Promise.all([logoDataUrl(logoSrc), loadArabicFontB64(), loadLatinFontB64()]);

  const sheets: string[] = [];
  for (let i = 1; i <= Math.max(1, total); i++) {
    let markup = renderToStaticMarkup(
      <DocPaper
        header={input.header}
        footer={input.footer}
        lang={input.lang}
        theme="light"
        meta={input.meta}
        page={{ current: i, total }}
        sizing="fixed"
        logoVariant={input.logoVariant}
        bare
      />,
    );
    if (logo) markup = markup.split(`src="${escapeAttr(logoSrc)}"`).join(`src="${logo}"`);
    sheets.push(`<div class="lh-page">${markup}</div>`);
  }

  const stack = letterheadFontStack(input.lang);

  return `<!doctype html>
<html lang="${input.lang}" dir="${ar ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<style>
  ${letterheadFontFaces({ arabic, latin })}
  @page { size: 210mm 297mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  /* Embedded fonts only: the browser and the server must pick the same glyphs. */
  .lh-page, .lh-page * { font-family: ${stack} !important; }
  .lh-page { width: 210mm; height: 297mm; overflow: hidden; break-after: page; page-break-after: always; }
  .lh-page:last-child { break-after: auto; page-break-after: auto; }
  /* The sheet itself, the body and the QR row are see-through: the imported
     page shows there. The header and footer bands keep their white paper. */
  .lh-page > div, .lh-page .doc-page-body, .lh-page [data-doc-body-content], .lh-page [data-qr-slot] { background: transparent !important; }
  .lh-page [data-doc-header], .lh-page [data-doc-footer] { background: #FFFFFF !important; }
  ${letterheadLockCss(lock)}
</style>
</head>
<body>${sheets.join("")}</body>
</html>`;
}

async function waitForAssets(doc: Document): Promise<void> {
  const fonts = (doc as unknown as { fonts?: { ready: Promise<unknown>; load?: (f: string) => Promise<unknown> } }).fonts;
  // Force both embedded faces to load before anything is measured.
  if (fonts?.load) {
    await Promise.all([
      fonts.load("400 16px 'LH Arabic'").catch(() => undefined),
      fonts.load("700 16px 'LH Latin'").catch(() => undefined),
    ]);
  }
  if (fonts?.ready) await fonts.ready.catch(() => undefined);
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }),
    ),
  );
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * Lay out one letterhead sheet in a hidden iframe and read where the imported
 * body may start and end, plus the band heights to lock for printing.
 */
export async function measureLetterhead(input: LetterheadInput): Promise<MeasuredLetterhead> {
  const html = await letterheadHtml(input, 1);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("letterhead_measure_failed");
    doc.open();
    doc.write(html);
    doc.close();
    await waitForAssets(doc);

    const sheet = doc.querySelector(".lh-page");
    const header = sheet?.querySelector("[data-doc-header]");
    const body = sheet?.querySelector("[data-doc-body-content]");
    const footer = sheet?.querySelector("[data-doc-footer]");
    if (!sheet || !header || !body || !footer) throw new Error("letterhead_measure_failed");

    const top = sheet.getBoundingClientRect().top;
    const headerPx = header.getBoundingClientRect().height;
    const footerPx = footer.getBoundingClientRect().height;
    const bodyTop = body.getBoundingClientRect().top - top;
    const footerTop = footer.getBoundingClientRect().top - top;
    return bandsFrom({ headerPx, footerPx, bodyTop, footerTop });
  } finally {
    iframe.remove();
  }
}

/** Measured layout → content bands. Pure, so it is unit-tested. */
export function bandsFrom(m: { headerPx: number; footerPx: number; bodyTop: number; footerTop: number }): MeasuredLetterhead {
  // The lock rounds band heights up, so the bands are computed from the
  // rounded values too: the content can only end up with more room, never less.
  const headerPx = Math.ceil(m.headerPx);
  const footerPx = Math.ceil(m.footerPx);
  const bodyTop = Math.max(m.bodyTop, headerPx);
  const footerTop = Math.min(m.footerTop, A4_HEIGHT_PX - footerPx);
  return {
    topPx: Math.ceil(bodyTop),
    bottomPx: Math.ceil(A4_HEIGHT_PX - footerTop + BAND_GAP_PX),
    lock: { headerPx, footerPx },
  };
}
