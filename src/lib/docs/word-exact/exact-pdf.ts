// Exact-layout import: the original file (Word or PDF) is kept in storage and,
// every time a PDF is needed, rendered with the Mechatro letterhead laid on
// top. The letterhead (number, dates, page X / Y) is always current; the
// content itself is never re-interpreted.
//
//   Word: the Word engine (LibreOffice) lays the file out with page margins
//         widened to the letterhead bands.
//   PDF:  each original page, its own letterhead cut away, is fitted between
//         the bands (in the browser); only the letterhead goes to the engine.

import { saveAs } from "file-saver";

import { supabase } from "@/integrations/supabase/client";
import { convertDocxToPdf, renderLetterheadPdf } from "@/lib/word-engine.functions";
import type { BusinessDoc } from "@/lib/docs/docs-api";
import { importKind, type ImportCrop, type ImportKind, type WordImport } from "@/lib/docs/model";
import type { DocFooter, DocHeader } from "@/lib/docs/types";
import { docTypeLabel } from "@/lib/docs/types";

import { overlayLetterhead, pdfPageCount, trimTrailingBlankPages } from "./compose";
import { prepareShare, saveSharePayload } from "@/lib/share/public-share";

import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  letterheadHtml,
  measureLetterhead,
  type LetterheadInput,
  type MeasuredLetterhead,
} from "./letterhead";
import { assertNoActiveContent, prepareDocxForLetterhead } from "./prepare-docx";

const BUCKET = "doc-assets";
/** The `doc-assets` bucket refuses files above 10 MB. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type ExactStep = "layout" | "word" | "pages" | "letterhead";

export type ExactPdf = {
  pdf: Uint8Array;
  pages: number;
  /** Pages the letterhead could not be drawn on (landscape pages). */
  landscapeSections: number;
  /** Word only: floating shapes positioned against the page — may sit under the letterhead. */
  pageAnchoredShapes: number;
  /** PDF only: the source is protected, so its pages were placed as images. */
  rasterised?: boolean;
};

/** Reuses the content render while the letterhead bands (and crop) stay the same. */
export type ExactPdfCache = { key?: string; content?: Uint8Array; info?: Omit<ExactPdf, "pdf" | "pages"> };

type BuildOpts = {
  title?: string;
  cache?: ExactPdfCache;
  onStep?: (step: ExactStep) => void;
  /** QR of the read-only copy, printed in the strip above the footer of the last page. */
  qrDataUrl?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const toBytes = (source: ArrayBuffer | Uint8Array) => (source instanceof Uint8Array ? source : new Uint8Array(source));

/** Shared tail: one letterhead sheet per content page, laid on top. */
async function withLetterhead(content: Uint8Array, letterhead: LetterheadInput, bands: MeasuredLetterhead, opts: BuildOpts) {
  opts.onStep?.("letterhead");
  const pages = await pdfPageCount(content);
  const html = await letterheadHtml(letterhead, pages, bands.lock, opts.qrDataUrl);
  const { pdfBase64: sheets } = await renderLetterheadPdf({ data: { html } });
  const pdf = await overlayLetterhead(content, base64ToBytes(sheets), { title: opts.title });
  return { pdf, pages };
}

/** Word file → exact PDF. */
export async function buildExactPdf(source: ArrayBuffer | Uint8Array, letterhead: LetterheadInput, opts: BuildOpts = {}): Promise<ExactPdf> {
  opts.onStep?.("layout");
  const bands = await measureLetterhead(letterhead);
  const key = `docx:${bands.topPx}:${bands.bottomPx}`;
  const cache = opts.cache;

  let content = cache?.key === key ? cache.content : undefined;
  let info = cache?.key === key ? cache.info : undefined;
  if (!content || !info) {
    opts.onStep?.("word");
    const prepared = await prepareDocxForLetterhead(toBytes(source), bands);
    const { pdfBase64 } = await convertDocxToPdf({ data: { docxBase64: bytesToBase64(prepared.docx) } });
    content = await trimTrailingBlankPages(base64ToBytes(pdfBase64));
    info = { landscapeSections: prepared.landscapeSections, pageAnchoredShapes: prepared.pageAnchoredShapes };
    if (cache) Object.assign(cache, { key, content, info });
  }

  const { pdf, pages } = await withLetterhead(content, letterhead, bands, opts);
  return { pdf, pages, ...info };
}

/** PDF file → exact PDF: its pages, own letterhead cut away, between the Mechatro bands. */
export async function buildExactPdfFromPdf(
  source: ArrayBuffer | Uint8Array,
  crop: ImportCrop,
  letterhead: LetterheadInput,
  opts: BuildOpts = {},
): Promise<ExactPdf> {
  opts.onStep?.("layout");
  const bands = await measureLetterhead(letterhead);
  const key = `pdf:${bands.topPx}:${bands.bottomPx}:${crop.topPt}:${crop.bottomPt}`;
  const cache = opts.cache;

  let content = cache?.key === key ? cache.content : undefined;
  let info = cache?.key === key ? cache.info : undefined;
  if (!content || !info) {
    opts.onStep?.("pages");
    const { composeIntoBands } = await import("@/lib/docs/import/pdf-exact");
    const bytes = toBytes(source);
    try {
      const res = await composeIntoBands(bytes, crop, bands);
      content = res.pdf;
      info = { landscapeSections: res.landscapePages, pageAnchoredShapes: 0 };
    } catch (e) {
      // Protected PDFs can be shown but not copied: place page images instead.
      if (!/encrypt/i.test(String((e as Error)?.message ?? e))) throw e;
      const { composeRasterIntoBands } = await import("@/lib/docs/import/pdf-raster");
      const res = await composeRasterIntoBands(bytes, crop, bands);
      content = res.pdf;
      info = { landscapeSections: res.landscapePages, pageAnchoredShapes: 0, rasterised: true };
    }
    if (cache) Object.assign(cache, { key, content, info });
  }

  const { pdf, pages } = await withLetterhead(content, letterhead, bands, opts);
  return { pdf, pages, ...info };
}

/** Exact PDF of an imported file, whichever kind it is. */
export function buildExactForImport(
  source: ArrayBuffer | Uint8Array,
  wordImport: Pick<WordImport, "kind" | "crop">,
  letterhead: LetterheadInput,
  opts: BuildOpts = {},
): Promise<ExactPdf> {
  return importKind(wordImport) === "pdf"
    ? buildExactPdfFromPdf(source, wordImport.crop ?? { topPt: 0, bottomPt: 0 }, letterhead, opts)
    : buildExactPdf(source, letterhead, opts);
}

/* ── Source file in storage ─────────────────────────────────────── */

const CONTENT_TYPE: Record<ImportKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/**
 * Store the original file. Kept under `word-imports/` for both kinds: the
 * bucket's policy limits that folder to the master admin.
 */
export async function uploadImportSource(file: File | Blob, kind: ImportKind): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("word_source_too_large");
  if (kind === "docx") await assertNoActiveContent(file);
  const path = `word-imports/${crypto.randomUUID()}.${kind}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: CONTENT_TYPE[kind], upsert: false });
  if (error) throw error;
  return path;
}

/** Word-only name kept for older callers. */
export function uploadWordSource(file: File | Blob): Promise<string> {
  return uploadImportSource(file, "docx");
}

const sourceCache = new Map<string, Promise<ArrayBuffer>>();

export function downloadWordSource(path: string): Promise<ArrayBuffer> {
  let hit = sourceCache.get(path);
  if (!hit) {
    hit = supabase.storage.from(BUCKET).download(path).then(({ data, error }) => {
      if (error || !data) throw error ?? new Error("word_source_missing");
      return data.arrayBuffer();
    });
    hit.catch(() => sourceCache.delete(path));
    sourceCache.set(path, hit);
  }
  return hit;
}

/* ── Business documents ─────────────────────────────────────────── */

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);

/** Letterhead fields of a saved document, as the editor shows them. */
export function letterheadFor(doc: BusinessDoc, header: DocHeader, footer: DocFooter): LetterheadInput {
  const client = doc.lang === "ar" ? doc.client.nameAr || doc.client.nameEn : doc.client.nameEn || doc.client.nameAr;
  return {
    header,
    footer,
    lang: doc.lang,
    logoVariant: doc.model.logoVariant,
    meta: { number: doc.number, date: fmtDate(doc.issue_date) ?? "—", validUntil: fmtDate(doc.valid_until), client: client || undefined },
  };
}

export function exactPdfFilename(doc: BusinessDoc): string {
  const label = docTypeLabel(doc.doc_type, "en").replace(/[^A-Za-z0-9]+/g, "-");
  const num = (doc.number || "doc").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${label}-${num}.pdf`;
}

export function savePdf(pdf: Uint8Array, filename: string): void {
  saveAs(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
}

/** Render and download the exact PDF of an imported document. */
export async function downloadExactPdf(doc: BusinessDoc, header: DocHeader, footer: DocFooter): Promise<void> {
  const imported = doc.model.wordImport;
  if (!imported?.sourcePath) throw new Error("word_source_missing");
  const title = `${docTypeLabel(doc.doc_type, doc.lang)} ${doc.number}`;
  // Same link as the editor's own export of this document; never blocks the download.
  const [source, share] = await Promise.all([
    downloadWordSource(imported.sourcePath),
    prepareShare({ kind: "business_doc", refId: doc.id, title, lang: doc.lang }),
  ]);
  const res = await buildExactForImport(source, imported, letterheadFor(doc, header, footer), {
    title,
    qrDataUrl: share?.qrDataUrl,
  });
  savePdf(res.pdf, exactPdfFilename(doc));
  if (share) void publishReadOnlyCopy(share.token, res.pdf, title);
}

/** Page images of the read-only copy: sharp on phones, light enough for many pages. */
const COPY_RENDER_SCALE = 1.6;
const COPY_JPEG_QUALITY = 0.8;

/**
 * Store the finished PDF as page images for /v/{token}: the web copy is the
 * exact same pages, with nothing selectable or downloadable as a file.
 */
async function publishReadOnlyCopy(token: string, pdf: Uint8Array, title: string): Promise<void> {
  try {
    const { openPdf, closePdf, renderPage } = await import("@/lib/docs/import/pdf-read");
    const doc = await openPdf(pdf);
    const width = Math.round(A4_WIDTH_PX);
    const height = Math.round(A4_HEIGHT_PX);
    const pages: string[] = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const canvas = await renderPage(doc, i, COPY_RENDER_SCALE);
        const src = canvas.toDataURL("image/jpeg", COPY_JPEG_QUALITY);
        pages.push(
          `<div class="doc-page" style="width:${width}px;height:${height}px;background:#fff;overflow:hidden">` +
            `<img src="${src}" alt="" draggable="false" style="width:100%;height:100%;display:block"/></div>`,
        );
      }
    } finally {
      await closePdf(doc);
    }
    await saveSharePayload(token, { html: pages.join(""), width, pageHeight: height, background: "#081320", title });
  } catch (e) {
    console.warn("read-only copy not stored:", e);
  }
}

/** Human message for every error the import and exact pipelines throw. */
export function exactErrorMessage(e: unknown, ar: boolean): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const pick = (a: string, en: string) => (ar ? a : en);
  if (/word_engine_not_configured/.test(msg))
    return pick("محرّك المستندات غير مُعدّ على السيرفر بعد (GOTENBERG_URL).", "The document engine isn't set up on the server yet (GOTENBERG_URL).");
  const unreachable = /word_engine_unreachable(?:\s*@(\S+))?/.exec(msg);
  if (unreachable) {
    const at = unreachable[1] ? ` (${unreachable[1]})` : "";
    return pick(
      `تعذّر الوصول إلى محرّك المستندات على السيرفر${at}. تأكّد أن خدمة gotenberg تعمل.`,
      `The document engine on the server can't be reached${at}. Check that the gotenberg service is running.`,
    );
  }
  const engineFailure = /word_engine_failed_(\d+)(?:\s*\[(\w+)\])?\s*(.*)/.exec(msg);
  if (engineFailure) {
    const [, status, step, rest] = engineFailure;
    const at = /\s*@(\S+)$/.exec(rest);
    const detail = (at ? `${rest.slice(0, at.index).slice(0, 120)} · ${at[1]}` : rest).trim();
    if (status === "401")
      return pick(
        "محرّك المستندات رفض الاتصال (HTTP 401): اسم المستخدم/كلمة المرور على التطبيق (GOTENBERG_USERNAME / GOTENBERG_PASSWORD) لا تطابق المحرّك.",
        "The document engine refused the app (HTTP 401): the app's GOTENBERG_USERNAME / GOTENBERG_PASSWORD don't match the engine's.",
      );
    const code = `HTTP ${status}${step ? ` · ${step}` : ""}${detail ? ` · ${detail}` : ""}`;
    return pick(
      `فشل محرّك المستندات في تحويل الملف (${code}).`,
      `The document engine couldn't convert this file (${code}).`,
    );
  }
  if (/word_source_too_large/.test(msg)) return pick("الملف أكبر من 10 ميغابايت.", "The file is larger than 10 MB.");
  if (/word_source_missing/.test(msg)) return pick("الملف الأصلي غير موجود في التخزين.", "The original file is missing from storage.");
  if (/bucket not found/i.test(msg))
    return pick(
      "مساحة التخزين doc-assets غير موجودة على السيرفر. شغّل scripts/sql/2026-10-07-doc-assets-bucket.sql في Supabase.",
      "The doc-assets storage bucket is missing on the server. Run scripts/sql/2026-10-07-doc-assets-bucket.sql in Supabase.",
    );
  if (/word_has_macros/.test(msg))
    return pick(
      "الملف يحتوي على ماكرو (برمجيات مدمجة) فتم رفضه. احفظه من Word كـ .docx عادي ثم أعد المحاولة.",
      "This file contains macros (embedded code), so it was refused. Save it from Word as a plain .docx and try again.",
    );
  if (/not_a_word_document/.test(msg)) return pick("هذا ليس ملف Word صالحاً.", "This isn't a valid Word file.");
  if (/legacy_doc/.test(msg)) return pick("صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx.", "The old .doc format isn't supported — save the file as .docx.");
  if (/unsupported_file/.test(msg)) return pick("نوع الملف غير مدعوم. اختر ملف Word (.docx) أو PDF.", "Unsupported file type. Choose a Word (.docx) or PDF file.");
  if (/empty_file/.test(msg)) return pick("الملف فارغ.", "The file is empty.");
  if (/pdf_password/.test(msg))
    return pick(
      "ملف PDF محمي بكلمة مرور. افتحه واحفظه كنسخة بدون كلمة مرور (أو اطبعه إلى PDF) ثم استورده.",
      "This PDF is password-protected. Open it, save a copy without the password (or print it to PDF), then import that.",
    );
  if (/pdf_invalid/.test(msg)) return pick("ملف PDF تالف أو غير صالح.", "This PDF is damaged or not a valid PDF.");
  if (/pdf_no_pages/.test(msg)) return pick("ملف PDF لا يحتوي على صفحات.", "This PDF has no pages.");
  if (/pdf_too_many_pages/.test(msg)) return pick("ملف PDF طويل جداً (أكثر من 40 صفحة).", "This PDF is too long (over 40 pages).");
  if (/ocr_failed/.test(msg))
    return pick("تعذّرت قراءة النص من الصفحات الممسوحة. يمكنك متابعة التنسيق الدقيق.", "The text of the scanned pages couldn't be read. You can still use the exact layout.");
  if (/canvas_unavailable/.test(msg)) return pick("المتصفح لم يسمح برسم الصفحات. جرّب متصفحاً آخر.", "The browser couldn't draw the pages. Try another browser.");
  if (/letterhead_measure_failed/.test(msg)) return pick("تعذّر تجهيز هيدر ميكاترو. أعد المحاولة.", "The Mechatro letterhead couldn't be prepared. Try again.");
  if (/master admin only/.test(msg)) return pick("هذه الميزة للمدير الرئيسي فقط.", "This feature is for the master admin only.");
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg))
    return pick("انقطع الاتصال بالسيرفر. تحقّق من الإنترنت وأعد المحاولة.", "The connection to the server was lost. Check your internet and try again.");
  return msg || pick("حدث خطأ غير متوقع", "Something went wrong");
}
