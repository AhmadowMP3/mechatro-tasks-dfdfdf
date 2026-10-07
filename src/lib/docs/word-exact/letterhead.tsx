// The Mechatro letterhead as a stand-alone HTML document: one A4 sheet per
// page of the Word render, each carrying the header (logo, title, number,
// dates) and the footer (contacts, page X / Y). The body area is transparent,
// so the sheet can be laid over the Word engine's PDF page.
//
// The very same HTML is measured here in a hidden iframe and rendered to PDF
// by Chromium on the server, so the bands we reserve in the Word file are the
// bands that get printed.

import { DocPaper } from "@/components/documents/DocPaper";
import { logoFor } from "@/lib/brand/logo";
import { loadArabicFontB64 } from "@/lib/pdf/assets";
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

/** 297 mm in CSS px — the real sheet height Chromium prints. */
const A4_HEIGHT_PX = (297 * 96) / 25.4;
/** Space kept between the Word body and the letterhead bands. */
const BAND_GAP_PX = 8;

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

/** Full HTML document with `total` letterhead sheets. */
export async function letterheadHtml(input: LetterheadInput, total: number): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const ar = input.lang === "ar";
  const logoSrc = logoFor(input.lang);
  const [logo, font] = await Promise.all([logoDataUrl(logoSrc), loadArabicFontB64()]);

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

  const fontFace = font
    ? `@font-face { font-family: 'Montserrat Arabic'; font-style: normal; font-weight: 400 700; font-display: block; src: url(data:font/ttf;base64,${font}) format('truetype'); }`
    : "";

  return `<!doctype html>
<html lang="${input.lang}" dir="${ar ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<style>
  ${fontFace}
  @page { size: 210mm 297mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: ${ar ? "'Montserrat Arabic', 'Almarai', sans-serif" : "'Montserrat', 'Montserrat Arabic', sans-serif"};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .lh-page { width: 210mm; height: 297mm; overflow: hidden; break-after: page; page-break-after: always; }
  .lh-page:last-child { break-after: auto; page-break-after: auto; }
  /* The Word page shows through everywhere except the header/footer bands. */
  .lh-page > div, .lh-page [data-qr-slot] { background: transparent !important; }
</style>
</head>
<body>${sheets.join("")}</body>
</html>`;
}

async function waitForAssets(doc: Document): Promise<void> {
  const fonts = (doc as unknown as { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts?.ready) await fonts.ready.catch(() => undefined);
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }),
    ),
  );
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * Lay out one letterhead sheet in a hidden iframe and read where the body may
 * start and end — these become the Word file's top/bottom page margins.
 */
export async function measureLetterhead(input: LetterheadInput): Promise<LetterheadBands> {
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
    const body = sheet?.querySelector("[data-doc-body-content]");
    const footer = sheet?.querySelector("[data-doc-footer]");
    if (!sheet || !body || !footer) throw new Error("letterhead_measure_failed");

    const top = sheet.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top - top;
    const footerTop = footer.getBoundingClientRect().top - top;
    return {
      topPx: Math.ceil(bodyTop),
      bottomPx: Math.ceil(A4_HEIGHT_PX - footerTop + BAND_GAP_PX),
    };
  } finally {
    iframe.remove();
  }
}
