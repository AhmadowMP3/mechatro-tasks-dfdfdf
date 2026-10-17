// OCR for scanned PDFs: Arabic + English, in the browser, with the engine and
// language models served by the app itself (public/ocr) — no public CDN, so
// a blocked CDN can never break an import. Loaded only when a scan is imported.

import type { PageText, TextBox } from "./layout";

const ASSETS = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr/core",
  langPath: "/ocr/lang",
} as const;

/** Rendering resolution for OCR: ~250 dpi reads Arabic diacritics and small print. */
export const OCR_SCALE = 250 / 72;
/** Words recognised with less confidence than this are dropped as noise. */
const MIN_CONFIDENCE = 35;

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;

/** One shared worker for the session (loading the models takes a few seconds). */
async function worker(onProgress?: (p: number) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      return createWorker(["ara", "eng"], OEM.LSTM_ONLY, {
        ...ASSETS,
        // The models are served uncompressed: web servers send ".gz" files
        // with Content-Encoding: gzip, the browser unpacks them, and the
        // engine would then fail to unpack them a second time.
        gzip: false,
        cacheMethod: "write",
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status?.startsWith("loading") && typeof m.progress === "number") onProgress?.(m.progress);
        },
        errorHandler: () => undefined,
      });
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/**
 * Recognise one rendered page. Returns the words as positioned boxes in PDF
 * points, so they go through the same layout code as a PDF's own text layer.
 */
export async function ocrPage(
  canvas: HTMLCanvasElement,
  scale: number,
  onLoadProgress?: (p: number) => void,
): Promise<PageText> {
  const w = await worker(onLoadProgress);
  const { data } = await w.recognize(canvas, {}, { blocks: true, text: false });
  const boxes: TextBox[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text || word.confidence < MIN_CONFIDENCE) continue;
          const b = word.bbox;
          // Use the line's height for every word: word boxes shrink to the
          // glyphs, which would scatter one line over several.
          const lb = line.bbox;
          boxes.push({ text, x: b.x0 / scale, y: lb.y0 / scale, w: (b.x1 - b.x0) / scale, h: Math.max(4, (lb.y1 - lb.y0) / scale), word: true });
        }
      }
    }
  }
  return { width: canvas.width / scale, height: canvas.height / scale, boxes };
}

/** Free the OCR engine (several hundred MB of memory) once an import is done. */
export async function releaseOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await pending.then((w) => w.terminate()).catch(() => undefined);
}
