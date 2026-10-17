// Browser side of PDF import: opens a PDF with pdf.js, reads the text layer
// of every page, renders pages to canvases (previews, letterhead detection,
// OCR, protected files). pdf.js is loaded on demand — only when a PDF is
// actually imported.

import type { PDFDocumentProxy } from "pdfjs-dist";

import { inkProfile, type CropPageInput } from "./crop-detect";
import type { PageText } from "./layout";
import { pageTextFromItems, textCharCount } from "./pdf-text";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function pdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [lib, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

/** Open a PDF. Throws "pdf_password" / "pdf_invalid" for the cases the user can act on. */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  try {
    // pdf.js transfers the buffer to its worker: hand it a copy.
    return await lib.getDocument({ data: bytes.slice(), enableXfa: false }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new Error("pdf_password");
    if (name === "InvalidPDFException") throw new Error("pdf_invalid");
    throw e;
  }
}

/** Release a document and its worker-side resources. */
export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  await doc.loadingTask.destroy().catch(() => undefined);
}

export type PdfPageInfo = {
  text: PageText;
  /** Characters in the text layer — near zero means a scanned page. */
  chars: number;
};

/** Text layer of every page, in points with y from the top. */
export async function readPdfText(doc: PDFDocumentProxy, onPage?: (i: number, n: number) => void): Promise<PdfPageInfo[]> {
  const out: PdfPageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const text = pageTextFromItems(content.items, viewport);
    out.push({ text, chars: textCharCount(text) });
    page.cleanup();
  }
  return out;
}

/** A page with less text than this is treated as scanned (OCR needed). */
export const SCANNED_PAGE_CHARS = 25;

export function isScanned(pages: PdfPageInfo[]): boolean {
  if (pages.length === 0) return false;
  const scanned = pages.filter((p) => p.chars < SCANNED_PAGE_CHARS).length;
  return scanned >= Math.ceil(pages.length / 2);
}

/** Render one page (1-based) to a canvas at `scale` (1 = 72 dpi). */
export async function renderPage(doc: PDFDocumentProxy, index: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(index);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** Ink profiles for letterhead detection (half resolution is plenty). */
export async function cropInputs(doc: PDFDocumentProxy, texts: PageText[], maxPages = 6): Promise<CropPageInput[]> {
  const scale = 0.5;
  const out: CropPageInput[] = [];
  const n = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const canvas = await renderPage(doc, i, scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    out.push({
      height: canvas.height / scale,
      rowPt: 1 / scale,
      ink: inkProfile(data, canvas.width, canvas.height),
      boxes: texts[i - 1]?.boxes ?? [],
    });
    canvas.width = canvas.height = 0;
  }
  return out;
}

/** Canvas → PNG/JPEG bytes. */
export async function canvasBytes(canvas: HTMLCanvasElement, type: "png" | "jpeg", quality = 0.9): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${type}`, quality));
  if (!blob) throw new Error("canvas_unavailable");
  return new Uint8Array(await blob.arrayBuffer());
}
