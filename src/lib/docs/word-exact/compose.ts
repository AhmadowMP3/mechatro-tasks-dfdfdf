// Lays the letterhead PDF over the Word engine's PDF, page by page. The Word
// pages are copied as they are (text stays selectable, links stay clickable);
// each letterhead sheet is drawn on top as a vector form XObject.

import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
  type PDFEmbeddedPage,
  type PDFPage,
} from "pdf-lib";

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

async function embedSheet(out: PDFDocument, sheets: PDFDocument, index: number): Promise<PDFEmbeddedPage | null> {
  if (index >= sheets.getPageCount()) return null;
  const page = sheets.getPage(index);
  // A sheet with nothing drawn on it has no content stream to embed.
  if (!page.node.Contents()) return null;
  return out.embedPage(page);
}

/**
 * Word page underneath, letterhead on top (its body area is transparent and its
 * header/footer bands are opaque, so nothing strays over the letterhead).
 * Landscape Word pages keep their content but get no portrait letterhead.
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
    const { width, height } = page.getSize();
    if (width > height) continue;
    const sheet = await embedSheet(out, sheets, i);
    if (sheet) page.drawPage(sheet, { x: 0, y: 0, width, height });
  }

  if (opts.title) out.setTitle(opts.title);
  out.setProducer("Mechatro");
  out.setCreator("Mechatro Business Documents");
  return out.save();
}
