// The Mechatro letterhead as a stand-alone HTML document: one A4 sheet per
// page of the imported file, each carrying the header (logo, title, number,
// dates) and the footer (contacts, page X / Y). The first sheet adds the client
// box, the last one the QR and the signature. Everything else is transparent,
// so the sheet can be laid over the imported page.
//
// The same HTML is laid out twice: once here in a hidden iframe (to measure
// the bands) and once by Chromium on the server (to print them). Two rules
// keep the two layouts identical:
//   1. Every font is embedded as a data URL — no system or web-font fallback
//      can differ between the user's browser and the server.
//   2. The measured header/footer heights are written back into the printed
//      HTML as fixed heights, so a band can never grow into the content.

import { DocClientCard } from "@/components/documents/DocBody";
import { DocPaper } from "@/components/documents/DocPaper";
import { logoFor } from "@/lib/brand/logo";
import { loadArabicFontB64, loadLatinFontB64 } from "@/lib/pdf/assets";
import { QR_ROW_H, qrStampHtml } from "@/lib/share/qr-stamp";
import type { DocFooter, DocHeader, DocLang } from "@/lib/docs/types";
import type { DocClient, LogoVariant } from "@/lib/docs/model";

import type { LetterheadBands } from "./prepare-docx";

export type LetterheadInput = {
  header: DocHeader;
  footer: DocFooter;
  lang: DocLang;
  meta: { number?: string; date?: string; validUntil?: string; client?: string };
  logoVariant?: LogoVariant;
  /** Printed as the client box on the first sheet. */
  client?: DocClient;
};

/** Measured band heights, written back as fixed heights when printing. */
export type LetterheadLock = { headerPx: number; footerPx: number };

/** Bands for the imported content plus the lock for the printed sheets. */
export type MeasuredLetterhead = LetterheadBands & { lock: LetterheadLock };

/** What the opaque parts of a sheet cover, in CSS px from the sheet's edges. */
export type LetterheadCover = {
  /** Header, plus the client box on the first sheet. */
  firstTopPx: number;
  topPx: number;
  bottomPx: number;
  /** Height of the QR / signature strip above the footer, last sheet only. */
  stripPx: number;
};

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

const EMPTY_QR_SLOT = /(<div data-qr-slot(?:="[^"]*")?[^>]*>)(<\/div>)/;

/** Width kept for each of the QR and signature cards, for the covered-content check. */
export const STRIP_CARD_PX = 270;

/**
 * The strip above the footer on the last sheet: QR on the reading-start side,
 * signature on the far side, each on its own small white card. Pure, so it is
 * unit-tested.
 */
export function signatureStripHtml(qrStamp: string | null, signature: string): string {
  const card = "background:#FFFFFF;border:1px solid #DCE5EE;border-radius:10px;padding:6px 10px;box-sizing:border-box";
  const qr = qrStamp ? `<div data-qr-card style="${card}">${qrStamp}</div>` : "";
  const sign = signature
    ? `<div data-signature-card style="${card};margin-inline-start:auto;width:190px;text-align:center">` +
      `<div style="height:40px;border-bottom:1px solid #94A3B8;margin-bottom:5px"></div>` +
      `<div style="font-size:10.5px;font-weight:700;color:#0B1A2A;overflow-wrap:anywhere">${escapeAttr(signature)}</div>` +
      `</div>`
    : "";
  return `<div style="display:flex;align-items:flex-end;width:100%;gap:16px;padding-bottom:6px;box-sizing:border-box">${qr}${sign}</div>`;
}

/** Put the QR stamp into a sheet's (empty) QR strip. Pure, so it is unit-tested. */
export function fillQrSlot(sheetMarkup: string, stampHtml: string): string {
  return sheetMarkup.replace(EMPTY_QR_SLOT, (_m, open: string, close: string) => `${open}${stampHtml}${close}`);
}

/**
 * Full HTML document with `total` letterhead sheets. The first sheet carries the
 * client box; the strip above the footer of the last one carries the
 * read-only-copy QR (with `qrDataUrl`) and the signature.
 */
export async function letterheadHtml(input: LetterheadInput, total: number, lock?: LetterheadLock, qrDataUrl?: string): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const ar = input.lang === "ar";
  const logoSrc = logoFor(input.lang);
  const [logo, arabic, latin] = await Promise.all([logoDataUrl(logoSrc), loadArabicFontB64(), loadLatinFontB64()]);
  const signature = ((ar ? input.footer.signatureAr : input.footer.signatureEn) ?? "").trim();
  // The signature moves from the footer of every page to the strip of the last one.
  const footer = { ...input.footer, signatureAr: "", signatureEn: "" };
  const last = Math.max(1, total);

  const sheets: string[] = [];
  for (let i = 1; i <= last; i++) {
    let markup = renderToStaticMarkup(
      <DocPaper
        header={input.header}
        footer={footer}
        lang={input.lang}
        theme="light"
        meta={input.meta}
        page={{ current: i, total }}
        sizing="fixed"
        logoVariant={input.logoVariant}
        bare
      >
        {i === 1 && input.client ? <DocClientCard client={input.client} lang={input.lang} theme="light" /> : null}
      </DocPaper>,
    );
    if (logo) markup = markup.split(`src="${escapeAttr(logoSrc)}"`).join(`src="${logo}"`);
    if (i === last && (qrDataUrl || signature)) {
      markup = fillQrSlot(markup, signatureStripHtml(qrDataUrl ? qrStampHtml(qrDataUrl, input.lang, "light") : null, signature));
    }
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
  /* The sheet, the body and the strip above the footer are see-through: the
     imported page shows there. Only the header, the footer and the small cards
     (client, QR, signature) cover it. */
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
export async function measureLetterhead(input: LetterheadInput): Promise<MeasuredLetterhead & { cover: LetterheadCover }> {
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
    // The bottom band starts at the QR strip, so the imported content never runs under the QR.
    const bottomBand = sheet.querySelector("[data-qr-slot]") ?? footer;

    const top = sheet.getBoundingClientRect().top;
    const headerPx = header.getBoundingClientRect().height;
    const footerPx = footer.getBoundingClientRect().height;
    // Content fitted between the bands also clears the client box, on every page.
    const clientBottom = sheet.querySelector(".pdf-card")?.getBoundingClientRect().bottom;
    const bodyTop = (clientBottom ?? body.getBoundingClientRect().top) - top;
    const footerTop = bottomBand.getBoundingClientRect().top - top;
    const bands = bandsFrom({ headerPx, footerPx, bodyTop, footerTop });
    return {
      ...bands,
      cover: {
        firstTopPx: clientBottom === undefined ? bands.lock.headerPx : Math.ceil(clientBottom - top),
        topPx: bands.lock.headerPx,
        bottomPx: bands.lock.footerPx,
        stripPx: QR_ROW_H,
      },
    };
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
