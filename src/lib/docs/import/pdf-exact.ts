// Exact-layout PDF import: every page of the original PDF is kept as it is
// (vector, selectable text, images), its own letterhead bands are cut away,
// and what remains is fitted between the Mechatro header and footer.
//
// Pure pdf-lib — runs in the browser and in the Node tests. The letterhead
// itself is laid on top afterwards by `overlayLetterhead` (word-exact/compose).

import { degrees, PDFDocument, type PDFEmbeddedPage, type PDFPage } from "pdf-lib";

import type { LetterheadBands } from "../word-exact/prepare-docx";

/** A4 in PDF points. */
export const A4_PT = { width: 595.28, height: 841.89 } as const;
/** CSS px (96 dpi) → PDF points (72 dpi). */
const PT_PER_PX = 0.75;
/** Never cut more than this share of a page from either edge. */
const MAX_CUT_SHARE = 0.4;

export type PdfCrop = { topPt: number; bottomPt: number };

export type ComposedPdf = {
  pdf: Uint8Array;
  pages: number;
  /** Landscape pages: kept full-page, without the portrait letterhead. */
  landscapePages: number;
};

type Box = { left: number; bottom: number; right: number; top: number };

/** Displayed size of a page (after its /Rotate). */
export function displayedSize(page: PDFPage): { width: number; height: number; rotation: 0 | 90 | 180 | 270 } {
  const cb = page.getCropBox();
  const rotation = ((((page.getRotation().angle ?? 0) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const quarter = rotation === 90 || rotation === 270;
  return { width: quarter ? cb.height : cb.width, height: quarter ? cb.width : cb.height, rotation };
}

/**
 * The part of the page to keep, in the page's own (unrotated) coordinates:
 * `top`/`bottom` are measured on the page as displayed, whatever its rotation.
 */
export function keptBox(page: PDFPage, crop: PdfCrop): Box {
  const cb = page.getCropBox();
  const { height, rotation } = displayedSize(page);
  const top = clampCut(crop.topPt, height);
  const bottom = clampCut(crop.bottomPt, height);
  const L = cb.x, B = cb.y, R = cb.x + cb.width, T = cb.y + cb.height;
  switch (rotation) {
    case 0: return { left: L, right: R, bottom: B + bottom, top: T - top };
    case 180: return { left: L, right: R, bottom: B + top, top: T - bottom };
    // Rotated a quarter turn clockwise: the page's left edge is shown on top.
    case 90: return { left: L + top, right: R - bottom, bottom: B, top: T };
    // A quarter turn anticlockwise: the page's right edge is shown on top.
    case 270: return { left: L + bottom, right: R - top, bottom: B, top: T };
  }
}

function clampCut(v: number, height: number): number {
  return Math.max(0, Math.min(Number.isFinite(v) ? v : 0, height * MAX_CUT_SHARE));
}

/** Where the kept part lands on the A4 sheet: scale and lower-left corner of the displayed box. */
export function placement(
  displayed: { width: number; height: number },
  crop: PdfCrop,
  bands: LetterheadBands,
): { scale: number; x: number; y: number; width: number; height: number } {
  const keptH = displayed.height - clampCut(crop.topPt, displayed.height) - clampCut(crop.bottomPt, displayed.height);
  const topBand = bands.topPx * PT_PER_PX;
  const bottomBand = bands.bottomPx * PT_PER_PX;
  const availW = A4_PT.width;
  const availH = Math.max(1, A4_PT.height - topBand - bottomBand);
  // Shrink to fit, never enlarge: a small page stays its real size.
  const scale = Math.min(availW / displayed.width, availH / Math.max(1, keptH), 1);
  const width = displayed.width * scale;
  const height = keptH * scale;
  // Centred across, hanging from the header band like a normal page body.
  return { scale, width, height, x: (A4_PT.width - width) / 2, y: A4_PT.height - topBand - height };
}

/** Draw an embedded (cropped) page upright at the displayed box (x, y, w, h). */
function drawUpright(target: PDFPage, emb: PDFEmbeddedPage, rotation: 0 | 90 | 180 | 270, p: { scale: number; x: number; y: number; width: number; height: number }) {
  const s = p.scale;
  switch (rotation) {
    case 0: target.drawPage(emb, { x: p.x, y: p.y, xScale: s, yScale: s }); break;
    case 90: target.drawPage(emb, { x: p.x, y: p.y + p.height, xScale: s, yScale: s, rotate: degrees(-90) }); break;
    case 180: target.drawPage(emb, { x: p.x + p.width, y: p.y + p.height, xScale: s, yScale: s, rotate: degrees(180) }); break;
    case 270: target.drawPage(emb, { x: p.x + p.width, y: p.y, xScale: s, yScale: s, rotate: degrees(90) }); break;
  }
}

/**
 * Build the content PDF: one portrait A4 page per original page, original
 * letterhead cut away, content fitted between the Mechatro bands. Landscape
 * pages become landscape A4 pages, whole and without letterhead.
 */
export async function composeIntoBands(source: Uint8Array, crop: PdfCrop, bands: LetterheadBands): Promise<ComposedPdf> {
  const src = await PDFDocument.load(source, { updateMetadata: false });
  const out = await PDFDocument.create();
  let landscapePages = 0;

  for (const page of src.getPages()) {
    const shown = displayedSize(page);
    const landscape = shown.width > shown.height * 1.02;
    // A blank page has no content to embed: it stays a blank sheet.
    if (!page.node.Contents()) {
      if (landscape) landscapePages += 1;
      out.addPage(landscape ? [A4_PT.height, A4_PT.width] : [A4_PT.width, A4_PT.height]);
      continue;
    }
    if (landscape) {
      landscapePages += 1;
      const sheet = out.addPage([A4_PT.height, A4_PT.width]);
      const emb = await out.embedPage(page, keptBox(page, { topPt: 0, bottomPt: 0 }));
      const scale = Math.min(A4_PT.height / shown.width, A4_PT.width / shown.height, 1);
      const w = shown.width * scale, h = shown.height * scale;
      drawUpright(sheet, emb, shown.rotation, { scale, width: w, height: h, x: (A4_PT.height - w) / 2, y: (A4_PT.width - h) / 2 });
      continue;
    }
    const sheet = out.addPage([A4_PT.width, A4_PT.height]);
    const emb = await out.embedPage(page, keptBox(page, crop));
    drawUpright(sheet, emb, shown.rotation, placement(shown, crop, bands));
  }

  return { pdf: await out.save(), pages: out.getPageCount(), landscapePages };
}

/** One page rendered to an image: only the kept part, at its displayed size in points. */
export type PageImage = { bytes: Uint8Array; type: "png" | "jpeg"; widthPt: number; heightPt: number; landscape: boolean };

/**
 * Same result as `composeIntoBands`, from page images instead of the PDF's
 * own content — for protected PDFs, whose pages can be shown but not copied.
 * The images already hold only the kept part of each page.
 */
export async function composeImagesIntoBands(pages: PageImage[], bands: LetterheadBands): Promise<ComposedPdf> {
  const out = await PDFDocument.create();
  let landscapePages = 0;
  for (const pg of pages) {
    const img = pg.type === "png" ? await out.embedPng(pg.bytes) : await out.embedJpg(pg.bytes);
    if (pg.landscape) {
      landscapePages += 1;
      const sheet = out.addPage([A4_PT.height, A4_PT.width]);
      const scale = Math.min(A4_PT.height / pg.widthPt, A4_PT.width / pg.heightPt, 1);
      const w = pg.widthPt * scale, h = pg.heightPt * scale;
      sheet.drawImage(img, { x: (A4_PT.height - w) / 2, y: (A4_PT.width - h) / 2, width: w, height: h });
      continue;
    }
    const sheet = out.addPage([A4_PT.width, A4_PT.height]);
    const p = placement({ width: pg.widthPt, height: pg.heightPt }, { topPt: 0, bottomPt: 0 }, bands);
    sheet.drawImage(img, { x: p.x, y: p.y, width: p.width, height: p.height });
  }
  return { pdf: await out.save(), pages: out.getPageCount(), landscapePages };
}
