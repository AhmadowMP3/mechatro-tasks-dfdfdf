// Exact-layout Word import: the original .docx is kept in storage and, every
// time a PDF is needed, rendered by the Word engine with the Mechatro
// letterhead laid on top. The letterhead (number, dates, page X / Y) is always
// current; the Word content is never re-interpreted by the browser.

import { saveAs } from "file-saver";

import { supabase } from "@/integrations/supabase/client";
import { convertDocxToPdf, renderLetterheadPdf } from "@/lib/word-engine.functions";
import type { BusinessDoc } from "@/lib/docs/docs-api";
import type { DocFooter, DocHeader } from "@/lib/docs/types";
import { docTypeLabel } from "@/lib/docs/types";

import { overlayLetterhead, pdfPageCount, trimTrailingBlankPages } from "./compose";
import { letterheadHtml, measureLetterhead, type LetterheadInput } from "./letterhead";
import { assertNoActiveContent, prepareDocxForLetterhead } from "./prepare-docx";

const BUCKET = "doc-assets";
/** The `doc-assets` bucket refuses files above 10 MB. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type ExactPdf = {
  pdf: Uint8Array;
  pages: number;
  /** Sections the letterhead could not be drawn on (landscape pages). */
  landscapeSections: number;
  /** Floating shapes positioned against the page — may sit under the letterhead. */
  pageAnchoredShapes: number;
};

/** Reuses the Word render while the letterhead bands keep the same height. */
export type ExactPdfCache = { key?: string; content?: Uint8Array; info?: Omit<ExactPdf, "pdf" | "pages"> };

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

export async function buildExactPdf(
  source: ArrayBuffer | Uint8Array,
  letterhead: LetterheadInput,
  opts: { title?: string; cache?: ExactPdfCache; onStep?: (step: "layout" | "word" | "letterhead") => void } = {},
): Promise<ExactPdf> {
  opts.onStep?.("layout");
  const bands = await measureLetterhead(letterhead);
  const key = `${bands.topPx}:${bands.bottomPx}`;
  const cache = opts.cache;

  let content = cache?.key === key ? cache.content : undefined;
  let info = cache?.key === key ? cache.info : undefined;
  if (!content || !info) {
    opts.onStep?.("word");
    const prepared = await prepareDocxForLetterhead(source, bands);
    const { pdfBase64 } = await convertDocxToPdf({ data: { docxBase64: bytesToBase64(prepared.docx) } });
    content = await trimTrailingBlankPages(base64ToBytes(pdfBase64));
    info = { landscapeSections: prepared.landscapeSections, pageAnchoredShapes: prepared.pageAnchoredShapes };
    if (cache) Object.assign(cache, { key, content, info });
  }

  opts.onStep?.("letterhead");
  const pages = await pdfPageCount(content);
  const html = await letterheadHtml(letterhead, pages);
  const { pdfBase64: sheets } = await renderLetterheadPdf({ data: { html } });
  const pdf = await overlayLetterhead(content, base64ToBytes(sheets), { title: opts.title });
  return { pdf, pages, ...info };
}

/* ── Source file in storage ─────────────────────────────────────── */

export async function uploadWordSource(file: File | Blob): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("word_source_too_large");
  await assertNoActiveContent(file);
  const path = `word-imports/${crypto.randomUUID()}.docx`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (error) throw error;
  return path;
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
  const path = doc.model.wordImport?.sourcePath;
  if (!path) throw new Error("word_source_missing");
  const source = await downloadWordSource(path);
  const res = await buildExactPdf(source, letterheadFor(doc, header, footer), {
    title: `${docTypeLabel(doc.doc_type, doc.lang)} ${doc.number}`,
  });
  savePdf(res.pdf, exactPdfFilename(doc));
}

/** Human message for the errors this pipeline throws. */
export function exactErrorMessage(e: unknown, ar: boolean): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/word_engine_not_configured/.test(msg))
    return ar ? "محرّك Word غير مُعدّ على السيرفر بعد (GOTENBERG_URL)." : "The Word engine isn't set up on the server yet (GOTENBERG_URL).";
  if (/word_engine_unreachable/.test(msg))
    return ar ? "تعذّر الوصول إلى محرّك Word على السيرفر." : "The Word engine on the server can't be reached.";
  if (/word_engine_failed/.test(msg))
    return ar ? "فشل محرّك Word في تحويل الملف. تأكّد أن الملف يفتح في Word." : "The Word engine couldn't convert this file. Check that it opens in Word.";
  if (/word_source_too_large/.test(msg))
    return ar ? "الملف أكبر من 10 ميغابايت." : "The file is larger than 10 MB.";
  if (/word_source_missing/.test(msg))
    return ar ? "ملف Word الأصلي غير موجود في التخزين." : "The original Word file is missing from storage.";
  if (/bucket not found/i.test(msg))
    return ar
      ? "مساحة التخزين doc-assets غير موجودة على السيرفر. شغّل scripts/sql/2026-10-07-doc-assets-bucket.sql في Supabase."
      : "The doc-assets storage bucket is missing on the server. Run scripts/sql/2026-10-07-doc-assets-bucket.sql in Supabase.";
  if (/word_has_macros/.test(msg))
    return ar
      ? "الملف يحتوي على ماكرو (برمجيات مدمجة) فتم رفضه. احفظه من Word كـ .docx عادي على جهاز سليم ثم أعد المحاولة."
      : "This file contains macros (embedded code), so it was refused. Save it from Word as a plain .docx on a clean computer and try again.";
  if (/not_a_word_document/.test(msg))
    return ar ? "هذا ليس ملف Word صالحاً." : "This isn't a valid Word file.";
  return msg || (ar ? "حدث خطأ غير متوقع" : "Something went wrong");
}
