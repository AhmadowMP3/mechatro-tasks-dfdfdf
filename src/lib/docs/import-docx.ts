// Browser-side .docx importer. Converts a Word file into the Word-style rich
// HTML our editor already understands (paragraphs, headings, marks, lists,
// tables, images) and returns the plain text so the AI can extract fields.
//
// Everything runs in the browser: mammoth is pure JS, so no server binaries
// and no upload of the raw file anywhere.

import { sanitizeHtml } from "@/lib/security/sanitize";

export type DocxImport = {
  /** Sanitized rich HTML ready for the editor / model.html. */
  html: string;
  /** Plain text of the document (for AI extraction). */
  text: string;
  /** Non-fatal conversion notes from Word. */
  warnings: string[];
  images: number;
  tables: number;
};

/** Images wider than this are downscaled before they enter the document. */
const MAX_IMAGE_WIDTH = 1400;
/** Rendered width cap inside the A4 sheet (matches the editor's own cap). */
const RENDER_MAX_WIDTH = 700;

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "r[style-name='Strong'] => strong",
  "u => u",
  "strike => s",
];

export function isDocxFile(file: File): boolean {
  return /\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function isLegacyDoc(file: File): boolean {
  return /\.doc$/i.test(file.name) || file.type === "application/msword";
}

/** Shrink an embedded image so a heavy Word file doesn't bloat the document. */
async function shrink(dataUrl: string, contentType: string): Promise<string> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= MAX_IMAGE_WIDTH) {
      bitmap.close?.();
      return dataUrl;
    }
    const ratio = MAX_IMAGE_WIDTH / bitmap.width;
    const canvas = document.createElement("canvas");
    canvas.width = MAX_IMAGE_WIDTH;
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const png = /png/i.test(contentType);
    return canvas.toDataURL(png ? "image/png" : "image/jpeg", png ? undefined : 0.86);
  } catch {
    return dataUrl;
  }
}

/** Remove Word chrome and normalise the markup for our editor. */
function cleanup(rawHtml: string): { html: string; images: number; tables: number } {
  if (typeof document === "undefined") return { html: rawHtml, images: 0, tables: 0 };
  const host = document.createElement("div");
  host.innerHTML = rawHtml;

  // Bookmarks / anchors Word leaves behind.
  host.querySelectorAll("a:not([href])").forEach((a) => a.replaceWith(...Array.from(a.childNodes)));

  // Page numbers, running headers and other single-token noise paragraphs.
  host.querySelectorAll("p").forEach((p) => {
    const text = (p.textContent ?? "").replace(/\u00a0/g, " ").trim();
    const hasMedia = p.querySelector("img, table");
    if (hasMedia) return;
    if (!text) { p.remove(); return; }
    if (/^(page\s*)?\d+\s*(\/|of|من)?\s*\d*$/i.test(text) && text.length <= 12) p.remove();
  });

  // Tables: drop Word's fixed pixel widths so they fit the A4 body.
  const tables = host.querySelectorAll("table");
  tables.forEach((t) => {
    t.removeAttribute("width");
    t.removeAttribute("style");
    t.setAttribute("style", "width:100%;border-collapse:collapse");
    t.querySelectorAll("td, th").forEach((cell) => {
      cell.removeAttribute("width");
      const style = (cell.getAttribute("style") ?? "").replace(/width\s*:[^;]+;?/gi, "");
      cell.setAttribute("style", `${style};border:1px solid rgba(128,128,128,.45);padding:6px 8px`.replace(/^;/, ""));
    });
  });

  // Images: cap the rendered width, keep them selectable by the editor.
  const images = host.querySelectorAll("img");
  images.forEach((img) => {
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.setAttribute("style", `max-width:${RENDER_MAX_WIDTH}px;height:auto`);
  });

  // Word sometimes emits deeply nested empty spans/divs.
  host.querySelectorAll("span, div").forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector("img, table")) el.remove();
  });

  return { html: host.innerHTML.trim(), images: images.length, tables: tables.length };
}

export async function convertDocx(file: File): Promise<DocxImport> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const arrayBuffer = await file.arrayBuffer();

  const convertImage = mammoth.images.imgElement(async (image: {
    contentType: string;
    read: (enc: string) => Promise<string>;
  }) => {
    const base64 = await image.read("base64");
    const url = await shrink(`data:${image.contentType};base64,${base64}`, image.contentType);
    return { src: url };
  });

  const result = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: STYLE_MAP, convertImage });
  const textResult = await mammoth.extractRawText({ arrayBuffer });

  const cleaned = cleanup(String(result.value ?? ""));
  const html = sanitizeHtml(cleaned.html);
  const text = String(textResult.value ?? "").replace(/\n{3,}/g, "\n\n").trim();

  return {
    html,
    text,
    warnings: (result.messages ?? []).map((m: { message?: string }) => String(m.message ?? "")).filter(Boolean).slice(0, 8),
    images: cleaned.images,
    tables: cleaned.tables,
  };
}

/** Rough language guess used to pre-set the document language. */
export function guessLang(text: string): "ar" | "en" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin * 0.5 ? "ar" : "en";
}
