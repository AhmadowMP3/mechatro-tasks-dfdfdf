// Browser-side PDF importer. Every page of the file is rendered as one image
// and inserted as-is, so the imported document looks exactly like the source
// PDF. The source file's own running header / footer band (logo, contact
// strip, page number) is cropped away, because our editor prints the official
// header, footer, logo and QR itself.

import { sanitizeHtml } from "@/lib/security/sanitize";
import { buildDigest, type DocxImport } from "./import-docx";

/** Raster cap for rendered pages. */
const MAX_IMAGE_WIDTH = 1400;
/** Band (fraction of page height) scanned for the source header / footer. */
const CHROME_BAND = 0.09;
/** Never crop away more than this fraction of a page on either edge. */
const MAX_CROP = 0.2;
/** Breathing room kept below the header / above the footer, in page points. */
const CROP_PAD = 4;

export function isPdfFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === "application/pdf";
}

/* ── helpers ─────────────────────────────────────────────── */

const norm = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** Arabic in PDFs arrives as presentation forms plus invisible bidi controls;
 * NFKC folds every shape back to the plain letter. */
function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, "");
}

function fitCanvas(w: number, h: number): HTMLCanvasElement {
  const scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  return canvas;
}

/* ── crop detection ──────────────────────────────────────── */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Vertical extents (PDF coordinates, origin bottom-left) of every painted
 * image / logo on the page — letterheads are usually artwork, not text. */
async function imageBands(page: any): Promise<Array<{ top: number; bottom: number }>> {
  try {
    const pdfjs = await loadPdfjs();
    const OPS = pdfjs.OPS;
    const ops = await page.getOperatorList();
    const paint = new Set<number>(
      [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject]
        .filter((v: number | undefined) => typeof v === "number"),
    );
    let ctm: Matrix = IDENTITY;
    const stack: Matrix[] = [];
    const bands: Array<{ top: number; bottom: number }> = [];
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
      else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i] as Matrix);
      else if (paint.has(fn)) {
        const h = Math.abs(ctm[3]);
        if (h < 4) continue;
        const bottom = Math.min(ctm[5], ctm[5] + ctm[3]);
        bands.push({ bottom, top: bottom + h });
        if (bands.length >= 24) break;
      }
    }
    return bands;
  } catch {
    return [];
  }
}

/**
 * How much of the page (as a fraction of its height) belongs to the source
 * file's own header and footer. Anything painted inside the top / bottom band
 * — text or artwork — is treated as chrome and cropped away.
 */
async function chromeCrop(page: any, height: number): Promise<{ top: number; bottom: number }> {
  const topBand = height * (1 - CHROME_BAND);
  const bottomBand = height * CHROME_BAND;
  let headerFloor = height; // lowest y still part of the header
  let footerCeil = 0; // highest y still part of the footer

  try {
    const content = await page.getTextContent();
    for (const it of content.items ?? []) {
      if (typeof it?.str !== "string") continue;
      if (!norm(normalizeText(it.str))) continue;
      const t = it.transform as number[];
      const y = t?.[5] ?? 0;
      const h = Math.abs(it.height || t?.[3] || 10);
      if (y >= topBand) headerFloor = Math.min(headerFloor, y);
      else if (y + h <= bottomBand) footerCeil = Math.max(footerCeil, y + h);
    }
  } catch {
    /* ignore — artwork detection still applies */
  }

  for (const b of await imageBands(page)) {
    if (b.bottom >= topBand * 0.94) headerFloor = Math.min(headerFloor, b.bottom);
    else if (b.top <= bottomBand * 1.15) footerCeil = Math.max(footerCeil, b.top);
  }

  const topCrop = headerFloor < height ? Math.max(0, height - headerFloor + CROP_PAD) : 0;
  const bottomCrop = footerCeil > 0 ? Math.max(0, footerCeil + CROP_PAD) : 0;
  return {
    top: Math.min(MAX_CROP, topCrop / height),
    bottom: Math.min(MAX_CROP, bottomCrop / height),
  };
}

/* ── page rendering ──────────────────────────────────────── */

/** Render one page and return it as a JPEG data URL, minus the source
 * header / footer bands. */
async function renderPage(page: any, crop: { top: number; bottom: number }): Promise<string | null> {
  try {
    const viewport = page.getViewport({ scale: 2 });
    const full = document.createElement("canvas");
    full.width = Math.round(viewport.width);
    full.height = Math.round(viewport.height);
    const fctx = full.getContext("2d");
    if (!fctx) return null;
    fctx.fillStyle = "#ffffff";
    fctx.fillRect(0, 0, full.width, full.height);
    await page.render({ canvasContext: fctx, viewport, canvas: full }).promise;

    const sy = Math.round(full.height * crop.top);
    const sh = Math.max(1, Math.round(full.height * (1 - crop.top - crop.bottom)));
    const out = fitCanvas(full.width, sh);
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(full, 0, sy, full.width, sh, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  }
}

/** Plain text of a page — used for the digest the AI reads, never rendered. */
async function pageText(page: any): Promise<string> {
  try {
    const content = await page.getTextContent();
    const lines = new Map<number, string[]>();
    for (const it of content.items ?? []) {
      if (typeof it?.str !== "string") continue;
      const str = normalizeText(it.str);
      if (!str.trim()) continue;
      const y = Math.round((it.transform?.[5] ?? 0) / 4);
      const bucket = lines.get(y) ?? [];
      bucket.push(str);
      lines.set(y, bucket);
    }
    return [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => norm(parts.join(" ")))
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

/* ── pdf.js loader ───────────────────────────────────────── */

/** pdf.js 6 relies on the very new Map.getOrInsert* helpers; older browsers
 * (and current Chromium builds) still lack them. */
function installMapPolyfills(): void {
  const proto: any = Map.prototype;
  if (typeof proto.getOrInsert !== "function") {
    proto.getOrInsert = function (key: any, value: any) {
      if (!this.has(key)) this.set(key, value);
      return this.get(key);
    };
  }
  if (typeof proto.getOrInsertComputed !== "function") {
    proto.getOrInsertComputed = function (key: any, fn: (k: any) => any) {
      if (!this.has(key)) this.set(key, fn(key));
      return this.get(key);
    };
  }
  const wproto: any = WeakMap.prototype;
  if (typeof wproto.getOrInsertComputed !== "function") {
    wproto.getOrInsertComputed = function (key: any, fn: (k: any) => any) {
      if (!this.has(key)) this.set(key, fn(key));
      return this.get(key);
    };
  }
}

let pdfjsPromise: Promise<any> | null = null;
async function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      installMapPolyfills();
      const lib: any = await import("pdfjs-dist/build/pdf.mjs");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

/* ── main conversion ─────────────────────────────────────── */

export async function convertPdf(file: File, _opts?: { keepFormatting?: boolean }): Promise<DocxImport> {
  const warnings: string[] = [];
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;

  const parts: string[] = [];
  const texts: string[] = [];
  let rendered = 0;

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const crop = await chromeCrop(page, viewport.height);
    const src = await renderPage(page, crop);
    const txt = await pageText(page);
    if (txt) texts.push(txt);
    if (src) {
      if (rendered > 0) parts.push('<div data-page-break="true"></div>');
      parts.push(
        `<p style="text-align:center"><img src="${src}" style="width:100%;height:auto" /></p>`,
      );
      rendered += 1;
    }
    page.cleanup?.();
  }

  const html = sanitizeHtml(parts.join("\n"));
  const text = texts.join("\n\n").trim();

  if (!rendered) warnings.push("No page could be rendered from this PDF.");
  else warnings.push(`${rendered} page(s) imported as page images (not editable text).`);

  try {
    await doc.destroy();
  } catch {
    /* ignore */
  }

  return {
    html,
    text,
    digest: buildDigest(html) || text,
    warnings: warnings.slice(0, 8),
    images: rendered,
    tables: 0,
  };
}
