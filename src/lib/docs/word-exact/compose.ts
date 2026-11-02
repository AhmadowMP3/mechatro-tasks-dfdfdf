// Lays the letterhead PDF over the content PDF, page by page. The content pages
// are copied as they are (size, margins, selectable text, clickable links); each
// letterhead sheet is drawn on top as a vector form XObject.

import {
  decodePDFRawStream,
  degrees,
  PDFArray,
  PDFDocument,
  PDFRawStream,
  type PDFEmbeddedPage,
  type PDFPage,
} from "pdf-lib";

import { displayedSize } from "../import/pdf-exact";

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPageCount();
}

/** Operators that put ink on the page: text, images/forms, fills, strokes, shadings, inline images. */
const PAINT_OPS = /(?:^|\s)(?:Tj|TJ|'|"|Do|f\*?|F|B\*?|b\*?|S|s|sh|BI)(?=\s|$)/;

/** Decoded content stream of a page, or null when any part can't be read. */
function pageContent(doc: PDFDocument, page: PDFPage): string | null {
  const contents = page.node.Contents();
  if (!contents) return "";
  const parts = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  let out = "";
  for (const part of parts) {
    if (!(part instanceof PDFRawStream)) return null;
    try {
      out += new TextDecoder("latin1").decode(decodePDFRawStream(part).decode()) + "\n";
    } catch {
      return null;
    }
  }
  return out;
}

/** True only when the page provably draws nothing; anything unreadable counts as ink. */
function isBlankPage(doc: PDFDocument, page: PDFPage): boolean {
  const content = pageContent(doc, page);
  return content !== null && !PAINT_OPS.test(content);
}

/**
 * The Word engine sometimes pushes trailing empty paragraphs onto an extra,
 * completely empty page. Drop those from the end (never from the middle — a
 * blank page inside a document may be intentional).
 */
export async function trimTrailingBlankPages(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  let removed = 0;
  while (doc.getPageCount() > 1 && isBlankPage(doc, doc.getPage(doc.getPageCount() - 1))) {
    doc.removePage(doc.getPageCount() - 1);
    removed += 1;
  }
  return removed > 0 ? doc.save() : bytes;
}

/** Where a point of the page as displayed sits in the page's own coordinates (crop box, /Rotate). */
export function displayedToPage(page: PDFPage, x: number, y: number): { x: number; y: number; rotate: number } {
  const box = page.getCropBox();
  const { rotation } = displayedSize(page);
  switch (rotation) {
    case 0: return { x: box.x + x, y: box.y + y, rotate: 0 };
    case 90: return { x: box.x + box.width - y, y: box.y + x, rotate: 90 };
    case 180: return { x: box.x + box.width - x, y: box.y + box.height - y, rotate: 180 };
    case 270: return { x: box.x + y, y: box.y + box.height - x, rotate: 270 };
  }
}

function drawAt(page: PDFPage, sheet: PDFEmbeddedPage, x: number, y: number, scale: number) {
  const at = displayedToPage(page, x, y);
  page.drawPage(sheet, { x: at.x, y: at.y, xScale: scale, yScale: scale, rotate: degrees(at.rotate) });
}

/** A page whose height differs from the scaled sheet by more than this is another shape. */
const SAME_SHAPE_PT = 1;

/**
 * Draw one letterhead sheet on a page as displayed. The sheet is scaled to the
 * page width without distortion; on a page of another shape (US Letter, say)
 * its top half stays on the top edge and its bottom half on the bottom edge.
 */
async function stampSheet(out: PDFDocument, page: PDFPage, sheet: PDFPage) {
  // A sheet with nothing drawn on it has no content stream to embed.
  if (!sheet.node.Contents()) return;
  const shown = displayedSize(page);
  const { width: sheetW, height: sheetH } = sheet.getSize();
  const scale = shown.width / sheetW;
  if (Math.abs(sheetH * scale - shown.height) <= SAME_SHAPE_PT) {
    drawAt(page, await out.embedPage(sheet), 0, 0, scale);
    return;
  }
  const middle = sheetH / 2;
  const top = await out.embedPage(sheet, { left: 0, right: sheetW, bottom: middle, top: sheetH });
  const bottom = await out.embedPage(sheet, { left: 0, right: sheetW, bottom: 0, top: middle });
  drawAt(page, top, 0, shown.height - middle * scale, scale);
  drawAt(page, bottom, 0, 0, scale);
}

/** Landscape pages of a PDF: they keep their content but get no portrait letterhead. */
export async function landscapePageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPages().filter((p) => {
    const { width, height } = displayedSize(p);
    return width > height;
  }).length;
}

/**
 * Content page underneath, letterhead on top (its body area is transparent and
 * its header/footer bands are opaque, so nothing strays over the letterhead).
 * Landscape pages keep their content but get no portrait letterhead.
 */
export async function overlayLetterhead(
  content: Uint8Array,
  letterhead: Uint8Array,
  opts: { title?: string } = {},
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const source = await PDFDocument.load(content, { updateMetadata: false });
  const sheets = await PDFDocument.load(letterhead, { updateMetadata: false });

  const pages = await out.copyPages(source, source.getPageIndices());
  for (const [i, page] of pages.entries()) {
    out.addPage(page);
    const { width, height } = displayedSize(page);
    if (width > height || i >= sheets.getPageCount()) continue;
    await stampSheet(out, page, sheets.getPage(i));
  }

  if (opts.title) out.setTitle(opts.title);
  out.setProducer("Mechatro");
  out.setCreator("Mechatro Business Documents");
  return out.save();
}
