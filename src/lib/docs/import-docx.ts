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
  /** Structured digest (headings, paragraphs, tables as rows) for the AI. */
  digest: string;
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
    if (p.closest("table")) return;
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

  // Images: cap the rendered width, drop unrenderable ones.
  host.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!/^(data:image\/|https?:)/i.test(src)) { img.remove(); return; }
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.setAttribute("style", `max-width:100%;height:auto`);
  });

  normalizeWidths(host);

  // Word sometimes emits deeply nested empty spans/divs.
  host.querySelectorAll("span, div").forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector("img, table")) el.remove();
  });

  return { html: host.innerHTML.trim(), images: host.querySelectorAll("img").length, tables: tables.length };

}

/* ── Structured digest for the AI ─────────────────────────────────
 * Plain text loses table columns, which is exactly where item rows,
 * quantities and prices live. The digest keeps the document order but
 * renders every table as `| cell | cell |` rows under its own header,
 * so the model reads real columns instead of guessing. */
function cellText(el: Element): string {
  return (el.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function buildDigest(html: string, limit = 40000): string {
  if (typeof document === "undefined") return "";
  const host = document.createElement("div");
  host.innerHTML = html;

  const out: string[] = [];
  let tableNo = 0;

  const walk = (node: Element) => {
    for (const el of Array.from(node.children)) {
      const tag = el.tagName.toLowerCase();
      if (tag === "table") {
        tableNo += 1;
        const rows = Array.from(el.querySelectorAll("tr"));
        out.push(`[TABLE ${tableNo} — ${rows.length} row(s)]`);
        rows.forEach((tr, i) => {
          const cells = Array.from(tr.children).map(cellText);
          if (cells.every((c) => !c)) return;
          const prefix = i === 0 ? "HEADER" : `ROW ${i}`;
          out.push(`${prefix} | ${cells.join(" | ")}`);
        });
        out.push(`[END TABLE ${tableNo}]`);
        continue;
      }
      if (/^h[1-6]$/.test(tag)) {
        const t = cellText(el);
        if (t) out.push(`# ${t}`);
        continue;
      }
      if (tag === "ul" || tag === "ol") {
        Array.from(el.querySelectorAll("li")).forEach((li) => {
          const t = cellText(li);
          if (t) out.push(`- ${t}`);
        });
        continue;
      }
      if (tag === "img") {
        out.push("[IMAGE]");
        continue;
      }
      if (el.children.length && !["p", "li"].includes(tag)) {
        walk(el);
        continue;
      }
      const t = cellText(el);
      if (t) out.push(t);
    }
  };

  walk(host);
  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return joined.length > limit ? `${joined.slice(0, limit)}\n[TRUNCATED]` : joined;
}


/** Word carries page-sized pixel widths and big pt indents. Rescale them so
 * imported content always fits inside our A4 body, whatever the margins are. */
function normalizeWidths(host: HTMLElement): void {
  const MAX_INDENT_PT = 48;

  host.querySelectorAll("table").forEach((t) => {
    t.removeAttribute("width");
    const style = (t.getAttribute("style") ?? "").replace(/(min-|max-)?width\s*:[^;]+;?/gi, "");
    t.setAttribute("style", `${style};width:100%;max-width:100%;table-layout:fixed`.replace(/^;/, ""));

    // Fixed pixel column widths -> percentages of the table.
    const cols = Array.from(t.querySelectorAll("col"));
    const px = cols.map((c) => {
      const m = /width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(c.getAttribute("style") ?? "");
      return m ? parseFloat(m[1]) : 0;
    });
    const total = px.reduce((a, b) => a + b, 0);
    if (total > 0 && px.every((v) => v > 0)) {
      cols.forEach((c, i) => c.setAttribute("style", `width:${Math.round((px[i] / total) * 1000) / 10}%`));
    }

    t.querySelectorAll("td, th").forEach((cell) => {
      cell.removeAttribute("width");
      cell.removeAttribute("data-colwidth");
      const cs = (cell.getAttribute("style") ?? "").replace(/(min-|max-)?width\s*:\s*\d+(\.\d+)?px\s*;?/gi, "");
      cell.setAttribute("style", `${cs};overflow-wrap:anywhere`.replace(/^;/, ""));
    });
  });

  // Clamp Word's page-relative indents and strip hard pixel widths.
  host.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    let style = el.getAttribute("style") ?? "";
    if (el.tagName !== "TABLE" && el.tagName !== "IMG") {
      style = style.replace(/(^|;)\s*width\s*:\s*\d+(\.\d+)?px\s*;?/gi, "$1");
    }
    style = style.replace(/(padding-inline-(?:start|end)|margin-(?:left|right)|padding-(?:left|right))\s*:\s*(\d+(?:\.\d+)?)pt/gi,
      (_m, prop: string, val: string) => `${prop}:${Math.min(parseFloat(val), MAX_INDENT_PT)}pt`);
    el.setAttribute("style", style.replace(/^;/, ""));
  });

  host.querySelectorAll("pre").forEach((el) => {
    const cs = (el.getAttribute("style") ?? "");
    el.setAttribute("style", `${cs};max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere`.replace(/^;/, ""));
  });
}

/** Light cleanup for the high-fidelity path: keep every inline style. */
function cleanupStyled(rawHtml: string): { html: string; images: number; tables: number } {
  if (typeof document === "undefined") return { html: rawHtml, images: 0, tables: 0 };
  const host = document.createElement("div");
  host.innerHTML = rawHtml;

  // Word page numbers / running header leftovers.
  host.querySelectorAll("p").forEach((p) => {
    const text = (p.textContent ?? "").replace(/\u00a0/g, " ").trim();
    if (!text || p.querySelector("img, table")) return;
    // Never touch numbers living inside a table — those are real data.
    if (p.closest("table")) return;
    if (/^(page\s*)?\d+\s*(\/|of|من)?\s*\d*$/i.test(text) && text.length <= 12) p.remove();
  });

  // Drop anything that would render as a broken image, keep Word's own size.
  host.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!/^(data:image\/|https?:)/i.test(src)) { img.remove(); return; }
    const attrW = Number(img.getAttribute("width") ?? 0);
    img.removeAttribute("width");
    img.removeAttribute("height");
    const style = (img.getAttribute("style") ?? "").replace(/max-width\s*:[^;]+;?/gi, "");
    const hasWidth = /(^|;)\s*width\s*:/i.test(style);
    const extra = !hasWidth && attrW > 0 ? `width:${Math.min(attrW, RENDER_MAX_WIDTH)}px;` : "";
    img.setAttribute("style", `${style};${extra}max-width:100%;height:auto`.replace(/^;/, ""));
  });

  normalizeWidths(host);

  return { html: host.innerHTML.trim(), images: host.querySelectorAll("img").length, tables: host.querySelectorAll("table").length };

}

export async function convertDocx(file: File, opts?: { keepFormatting?: boolean }): Promise<DocxImport> {
  const arrayBuffer = await file.arrayBuffer();
  const keep = opts?.keepFormatting !== false;
  const warnings: string[] = [];

  // ── High-fidelity path: read the OOXML directly so colours, fonts,
  // alignment, spacing, table borders and shading survive the import.
  if (keep) {
    try {
      const { docxToStyledHtml } = await import("./docx-ooxml");
      const styled = await docxToStyledHtml(arrayBuffer, { shrink, maxImageWidth: RENDER_MAX_WIDTH });
      const cleaned = cleanupStyled(styled.html);
      const html = sanitizeHtml(cleaned.html);
      const text = htmlToText(html);
      if (text.trim().length > 0 || cleaned.images > 0) {
        return {
          html,
          text,
          digest: buildDigest(html) || text,
          warnings,
          images: cleaned.images,
          tables: cleaned.tables,
        };
      }
      warnings.push("Styled import produced no content — fell back to plain import.");
    } catch (e) {
      warnings.push(`Styled import unavailable: ${(e as Error).message}`);
    }
  }

  // ── Fallback: mammoth's clean semantic conversion.
  const mammoth = await import("mammoth/mammoth.browser.js");

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
    digest: buildDigest(html) || text,
    warnings: [
      ...warnings,
      ...(result.messages ?? []).map((m: { message?: string }) => String(m.message ?? "")).filter(Boolean),
    ].slice(0, 8),
    images: cleaned.images,
    tables: cleaned.tables,
  };
}

/** Plain text of the converted HTML (used for AI extraction + language guess). */
function htmlToText(html: string): string {
  if (typeof document === "undefined") return "";
  const host = document.createElement("div");
  host.innerHTML = html;
  host.querySelectorAll("p, div, li, tr, h1, h2, h3, br").forEach((el) => el.append("\n"));
  return (host.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}


/** Rough language guess used to pre-set the document language. */
export function guessLang(text: string): "ar" | "en" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin * 0.5 ? "ar" : "en";
}
