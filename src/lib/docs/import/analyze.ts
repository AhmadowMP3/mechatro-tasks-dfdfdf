// One entry point for importing a file into Business Documents: detects what
// the file really is, reads it (Word, text PDF or scanned PDF), proposes the
// original letterhead bands to cut, and extracts the document fields.
// The review dialog renders whatever this returns.

import type { DocBlock } from "../doc-model";
import type { ImportKind } from "../model";
import { assertNoActiveContent } from "../word-exact/prepare-docx";

import { hasSwappedLamAlef, repairLamAlef } from "./arabic-repair";
import { detectCropBands, type CropSuggestion } from "./crop-detect";
import { extractFields, type ImportFields } from "./fields";
import { mapLayoutText, pagesToLayout, type CropBands, type PageLayout, type PageText } from "./layout";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;
/** Scanned pages beyond this are kept in the exact layout but not OCR'd. */
export const MAX_OCR_PAGES = 12;

export type ImportProgress =
  | { step: "read" }
  | { step: "pages"; current: number; total: number }
  | { step: "ocr-load"; progress: number }
  | { step: "ocr"; current: number; total: number }
  | { step: "letterhead" }
  | { step: "fields" };

type Common = {
  kind: ImportKind;
  fileName: string;
  bytes: Uint8Array;
  fields: ImportFields;
  warnings: ImportWarning[];
};

export type ImportWarning =
  | "docx_images_skipped"
  | "pdf_scanned"
  | "pdf_ocr_partial"
  | "pdf_ocr_failed"
  | "pdf_arabic_repaired"
  | "pdf_no_text";

export type DocxAnalysis = Common & {
  kind: "docx";
  /** Editable copy produced from the Word file. */
  blocks: DocBlock[];
  html: string;
  counts: Record<"paragraph" | "heading" | "list" | "table" | "image" | "pageBreak", number>;
};

export type PdfAnalysis = Common & {
  kind: "pdf";
  pageCount: number;
  scanned: boolean;
  /** Text of every page (OCR'd for scans) — the editable copy is rebuilt from it per crop. */
  pages: PageText[];
  /** The text layer showed the reversed Arabic ligature and is repaired. */
  swapped: boolean;
  crop: CropSuggestion;
};

export type ImportAnalysis = DocxAnalysis | PdfAnalysis;

/* ── file type ─────────────────────────────────────────────────── */

export async function sniffKind(file: File): Promise<ImportKind> {
  if (file.size === 0) throw new Error("empty_file");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("word_source_too_large");
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  if (ascii.includes("%PDF-")) return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b) return "docx"; // zip — verified when opened
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) throw new Error("legacy_doc");
  if (/\.doc$/i.test(file.name)) throw new Error("legacy_doc");
  throw new Error("unsupported_file");
}

/* ── text helpers ──────────────────────────────────────────────── */

/** Plain lines and table grids of canonical blocks (Word path). */
export function blocksToText(blocks: DocBlock[]): { lines: string[]; tables: string[][][] } {
  const lines: string[] = [];
  const tables: string[][][] = [];
  const runsText = (runs: { text: string }[]) => runs.map((r) => r.text).join("").trim();
  for (const b of blocks) {
    if (b.type === "paragraph" || b.type === "heading") {
      const t = runsText(b.runs);
      if (t) lines.push(t);
    } else if (b.type === "list") {
      b.items.forEach((item) => { const t = runsText(item); if (t) lines.push(t); });
    } else if (b.type === "table") {
      const grid = b.rows.map((row) => row.map((cell) => cell.paragraphs.map(runsText).filter(Boolean).join(" ")));
      tables.push(grid);
      grid.forEach((r) => { const t = r.filter(Boolean).join(" | "); if (t) lines.push(t); });
    }
  }
  return { lines, tables };
}

/** Editable copy of a PDF for a given crop (cheap: re-runs layout only). */
export function pdfLayout(a: Pick<PdfAnalysis, "pages" | "swapped">, crop: CropBands | null): PageLayout {
  return mapLayoutText(pagesToLayout(a.pages, crop), (s) => repairLamAlef(s, a.swapped));
}

/* ── analysis ──────────────────────────────────────────────────── */

export async function analyzeFile(file: File, onProgress?: (p: ImportProgress) => void): Promise<ImportAnalysis> {
  const kind = await sniffKind(file);
  onProgress?.({ step: "read" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  return kind === "pdf" ? analyzePdf(file, bytes, onProgress) : analyzeDocx(file, bytes, onProgress);
}

async function analyzeDocx(file: File, bytes: Uint8Array, onProgress?: (p: ImportProgress) => void): Promise<DocxAnalysis> {
  const { convertDocx } = await import("../import-docx");
  await assertNoActiveContent(bytes);
  const res = await convertDocx(file);
  onProgress?.({ step: "fields" });
  const { lines, tables } = blocksToText(res.model.blocks);
  const fields = extractFields({ lines, tables, fileName: file.name });
  const warnings: ImportWarning[] = res.warnings.some((w) => /EMF|WMF/.test(w)) ? ["docx_images_skipped"] : [];
  return {
    kind: "docx",
    fileName: file.name,
    bytes,
    fields,
    warnings,
    blocks: res.model.blocks,
    html: res.html,
    counts: res.summary.counts,
  };
}

async function analyzePdf(file: File, bytes: Uint8Array, onProgress?: (p: ImportProgress) => void): Promise<PdfAnalysis> {
  const { openPdf, closePdf, readPdfText, isScanned, cropInputs, renderPage, SCANNED_PAGE_CHARS } = await import("./pdf-read");
  const doc = await openPdf(bytes);
  try {
    if (doc.numPages === 0) throw new Error("pdf_no_pages");
    if (doc.numPages > MAX_PDF_PAGES) throw new Error("pdf_too_many_pages");

    const infos = await readPdfText(doc, (current, total) => onProgress?.({ step: "pages", current, total }));
    const scanned = isScanned(infos);
    const warnings: ImportWarning[] = [];
    const pages = infos.map((i) => i.text);

    // Scanned pages: recognise their text (Arabic + English) in the browser.
    if (scanned) {
      warnings.push("pdf_scanned");
      const { ocrPage, releaseOcr, OCR_SCALE } = await import("./ocr");
      const todo = infos.map((info, i) => ({ info, i })).filter((x) => x.info.chars < SCANNED_PAGE_CHARS).slice(0, MAX_OCR_PAGES);
      if (infos.filter((i) => i.chars < SCANNED_PAGE_CHARS).length > MAX_OCR_PAGES) warnings.push("pdf_ocr_partial");
      try {
        for (const [k, { i }] of todo.entries()) {
          onProgress?.({ step: "ocr", current: k + 1, total: todo.length });
          const canvas = await renderPage(doc, i + 1, OCR_SCALE);
          pages[i] = await ocrPage(canvas, OCR_SCALE, (progress) => onProgress?.({ step: "ocr-load", progress }));
          canvas.width = canvas.height = 0;
        }
      } catch (e) {
        console.error("[import] OCR failed", e);
        warnings.push("pdf_ocr_failed");
      } finally {
        await releaseOcr();
      }
    }

    onProgress?.({ step: "letterhead" });
    const crop = detectCropBands(await cropInputs(doc, pages));

    onProgress?.({ step: "fields" });
    const raw = pagesToLayout(pages, null);
    const swapped = hasSwappedLamAlef(raw.lines.join("\n"));
    if (swapped) warnings.push("pdf_arabic_repaired");
    const full = mapLayoutText(raw, (s) => repairLamAlef(s, swapped));
    if (full.lines.length === 0 && !warnings.includes("pdf_ocr_failed")) warnings.push("pdf_no_text");
    // Number/date may sit in the original letterhead; the client's details never do.
    const body = pdfLayout({ pages, swapped }, crop);
    const fields = extractFields({ lines: full.lines, tables: full.tables, bodyLines: body.lines, fileName: file.name });

    // Keep a private copy: pdf.js may detach buffers it was handed.
    return { kind: "pdf", fileName: file.name, bytes, fields, warnings, pageCount: doc.numPages, scanned, pages, swapped, crop };
  } finally {
    await closePdf(doc);
  }
}
