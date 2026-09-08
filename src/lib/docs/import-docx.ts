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
/** Usable A4 body width (Word Narrow margins) — used to turn Word's column
 *  percentages into the pixel widths the editor's table schema stores. */
const BODY_WIDTH_PX = 698;

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

/** Word ships empty spacer paragraphs and page-sized top margins at the start
 * of every section. Under our own header they read as a huge blank band, so we
 * strip them and clamp any oversized vertical spacing. */
const MAX_SPACE_PT = 24;
/** Top spacing is what stacks under our own header — keep it much tighter. */
const MAX_TOP_SPACE_PT = 10;

/** Word uses bidi/zero-width control characters in otherwise empty Arabic
 * paragraphs. They have no visible ink, but textContent.trim() treats several
 * of them as content and leaves a full blank line on every imported page. */
const INVISIBLE_WORD_CHARS = /[\s\u00a0\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;

function hasVisibleText(el: Element): boolean {
  return (el.textContent ?? "").replace(INVISIBLE_WORD_CHARS, "").length > 0;
}

function isBlankBlock(el: Element): boolean {
  if (el.querySelector("img, table")) return false;
  const tag = el.tagName;
  if (tag === "IMG" || tag === "TABLE" || tag === "HR") return false;
  if ((el as HTMLElement).hasAttribute?.("data-page-break")) return false;
  return !hasVisibleText(el);
}

function zeroTopSpace(el: Element): void {
  const style = (el.getAttribute("style") ?? "")
    .replace(/(^|;)\s*(margin-top|padding-top|margin-block-start|padding-block-start)\s*:[^;]*;?/gi, "$1");
  el.setAttribute("style", `${style};margin-top:0;padding-top:0`.replace(/^;/, ""));
}

function trimVerticalSpace(host: HTMLElement): void {
  // 1. Empty spacer blocks with fixed heights lose their height.
  host.querySelectorAll<HTMLElement>("p, div").forEach((el) => {
    if (!isBlankBlock(el)) return;
    const style = (el.getAttribute("style") ?? "")
      .replace(/(^|;)\s*(min-)?height\s*:[^;]*;?/gi, "$1");
    el.setAttribute("style", style.replace(/^;/, ""));
  });

  // 2. Clamp any oversized top/bottom spacing anywhere in the document.
  host.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const style = (el.getAttribute("style") ?? "").replace(
      /(margin-top|margin-bottom|padding-top|padding-bottom|margin-block-start|margin-block-end)\s*:\s*(\d+(?:\.\d+)?)(pt|px)/gi,
      (_m, prop: string, val: string, unit: string) => {
        const isTop = /top|start/i.test(prop);
        const base = isTop ? MAX_TOP_SPACE_PT : MAX_SPACE_PT;
        const max = unit.toLowerCase() === "px" ? base * 1.333 : base;
        const num = parseFloat(val);
        return `${prop}:${Math.min(num, max)}${unit}`;
      },
    );
    el.setAttribute("style", style);
  });

  // 3. Drop blank blocks at the very start, at the very end, and around every
  //    page break, then flatten the top spacing of whatever begins a page.
  //    Word often wraps the leading spacers in a section/div, so we descend
  //    into the first container instead of stopping at it.
  const CONTAINER = /^(DIV|SECTION|ARTICLE|MAIN|BODY)$/;

  const dropBlanksFrom = (start: Element | null, dir: "next" | "prev"): Element | null => {
    let node = start;
    while (node) {
      if (isBlankBlock(node)) {
        const following = dir === "next" ? node.nextElementSibling : node.previousElementSibling;
        node.remove();
        node = following;
        continue;
      }
      // Real content, but it may be a wrapper whose own first children are blank.
      if (CONTAINER.test(node.tagName) && node.firstElementChild) {
        const inner = dropBlanksFrom(dir === "next" ? node.firstElementChild : node.lastElementChild, dir);
        return inner ?? node;
      }
      return node;
    }
    return null;
  };

  /** Zero the top spacing of an element and every wrapper it starts. */
  const zeroTopChain = (el: Element | null): void => {
    let node = el;
    while (node && node !== host) {
      zeroTopSpace(node);
      const parent = node.parentElement;
      if (!parent || parent === host || parent.firstElementChild !== node) break;
      node = parent;
    }
  };

  const first = dropBlanksFrom(host.firstElementChild, "next");
  if (first) zeroTopChain(first);
  dropBlanksFrom(host.lastElementChild, "prev");

  Array.from(host.querySelectorAll<HTMLElement>("[data-page-break]")).forEach((brk) => {
    dropBlanksFrom(brk.previousElementSibling, "prev");
    const after = dropBlanksFrom(brk.nextElementSibling, "next");
    if (after) zeroTopChain(after);
  });

  // 4. Collapse runs of blank lines anywhere in the document to a single one.
  const collapse = (parent: Element) => {
    let run = 0;
    Array.from(parent.children).forEach((el) => {
      if (isBlankBlock(el)) {
        run += 1;
        if (run > 1) el.remove();
        return;
      }
      run = 0;
      if (el.children.length) collapse(el);
    });
  };
  collapse(host);
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
    if ((el as HTMLElement).hasAttribute?.("data-page-break")) return;
    if (!el.textContent?.trim() && !el.querySelector("img, table")) el.remove();
  });

  trimVerticalSpace(host);


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
    const ratios: number[] = [];
    if (total > 0 && px.every((v) => v > 0)) {
      cols.forEach((c, i) => {
        const pct = Math.round((px[i] / total) * 1000) / 10;
        ratios.push(pct);
        c.setAttribute("style", `width:${pct}%`);
      });
    }

    // The editor keeps column widths on the first row's cells (data-colwidth),
    // which is how its table schema stores them — otherwise every imported
    // table collapsed to equal columns the moment it opened for editing.
    if (ratios.length) {
      const firstRow = t.querySelector("tr");
      if (firstRow) {
        let col = 0;
        Array.from(firstRow.children).forEach((cell) => {
          const span = Math.max(1, Number(cell.getAttribute("colspan") ?? 1));
          const pct = ratios.slice(col, col + span).reduce((a, b) => a + b, 0);
          col += span;
          if (pct > 0) {
            const w = String(Math.round((pct / 100) * BODY_WIDTH_PX));
            cell.setAttribute("data-colwidth", w);
            cell.setAttribute("colwidth", w);
          }
        });
      }
    }

    t.querySelectorAll("td, th").forEach((cell) => {
      cell.removeAttribute("width");
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
  trimVerticalSpace(host);


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
      if (styled.skippedImages > 0) {
        warnings.push(`تم تخطي ${styled.skippedImages} صورة بصيغة قديمة (EMF/WMF) لا يدعمها المتصفح.`);
      }
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
