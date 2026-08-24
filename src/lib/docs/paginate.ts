// Splits a document model into real A4 pages so the exported PDF has the
// exact same page count as the preview (no clipped content, no blank last
// page, correct "Page x / y").
//
// Measurement happens in a hidden off-screen container with the same width,
// font stack and font size as the paper body, using the browser's own layout
// engine. Browser-only (uses document / react-dom).

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";
import type { DocBlock, DocModel } from "./model";
import type { DocLang, DocTheme } from "./types";

export type DocPage = {
  showClientBox: boolean;
  blocks: DocBlock[];
};

/** Full A4 at 96dpi, matching DocPaper. */
export const A4_SIZE = { width: 794, height: 1123 } as const;
/** Horizontal padding of the paper body (40px each side). */
const BODY_WIDTH = 794 - 80;
/** Gap between body units in DocBody. */
const UNIT_GAP = 14;

type Measurer = {
  measure: (node: ReactNode) => number;
  destroy: () => void;
};

function createMeasurer(lang: DocLang): Measurer {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "top:0",
    "left:-10000px",
    `width:${BODY_WIDTH}px`,
    "visibility:hidden",
    "pointer-events:none",
    // NOTE: never use `contain: size` here — it makes the host height 0 and
    // every measurement comes back empty.
    "contain:layout style",
    "height:auto",
    "font-size:12.5px",
    "line-height:1.7",
    `direction:${lang === "ar" ? "rtl" : "ltr"}`,
    `text-align:${lang === "ar" ? "right" : "left"}`,
    "font-family:'Montserrat Arabic','Almarai','Montserrat',system-ui,sans-serif",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);

  return {
    measure(node) {
      flushSync(() => root.render(node as React.ReactElement));
      const rect = host.getBoundingClientRect().height;
      return Math.ceil(Math.max(rect, host.scrollHeight));
    },
    destroy() {
      // Unmount asynchronously — React forbids unmounting while rendering.
      setTimeout(() => {
        try { root.unmount(); } catch { /* ignore */ }
        host.remove();
      }, 0);
    },
  };
}

/** Break a long text body into splittable chunks (paragraphs, then ~180-char
 *  word-safe pieces) so a huge paragraph can flow onto the next page instead
 *  of being clipped. */
function textChunks(text: string): string[] {
  const out: string[] = [];
  for (const para of (text ?? "").split(/\n/)) {
    if (para.length <= 180) { out.push(para); continue; }
    const words = para.split(/(\s+)/);
    let buf = "";
    for (const w of words) {
      if (buf.length + w.length > 180 && buf.trim()) { out.push(buf); buf = w.trimStart(); }
      else buf += w;
    }
    if (buf.trim()) out.push(buf);
  }
  return out.length > 0 ? out : [""];
}

function langText(block: DocBlock, lang: DocLang): string {
  if (block.kind === "text" || block.kind === "terms") return (lang === "ar" ? block.ar : block.en) ?? "";
  return "";
}

function rowsOf(block: DocBlock, lang: DocLang): number {
  if (block.kind === "items" || block.kind === "table") return block.rows.length;
  if (block.kind === "text" || block.kind === "terms") return textChunks(langText(block, lang)).length;
  return 0;
}

/** A row-slice of a table/items/text block; keeps the title only on the first
 *  slice and the totals only on the last one. */
function sliceBlock(block: DocBlock, from: number, to: number, isLast: boolean, lang: DocLang): DocBlock {
  if (block.kind === "items") {
    return {
      ...block,
      rows: block.rows.slice(from, to),
      startIndex: from,
      titleAr: from === 0 ? block.titleAr : "",
      titleEn: from === 0 ? block.titleEn : "",
      showTotals: isLast ? block.showTotals : false,
    };
  }
  if (block.kind === "table") {
    return {
      ...block,
      rows: block.rows.slice(from, to),
      titleAr: from === 0 ? block.titleAr : "",
      titleEn: from === 0 ? block.titleEn : "",
    };
  }
  if (block.kind === "text" || block.kind === "terms") {
    const part = textChunks(langText(block, lang)).slice(from, to).join("\n");
    const base = lang === "ar" ? { ar: part, en: "" } : { ar: "", en: part };
    if (block.kind === "terms") {
      return { ...block, ...base, titleAr: from === 0 ? block.titleAr : "", titleEn: from === 0 ? block.titleEn : "" };
    }
    return { ...block, ...base };
  }
  return block;
}


export type PaginateInput = {
  model: DocModel;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  /** Renders one body unit (block) for measuring. */
  renderBlock: (block: DocBlock) => ReactNode;
  /** Renders the client card for measuring. */
  renderClientBox: () => ReactNode;
  /** Usable body height on one page (A4 minus header + footer + padding). */
  bodyHeight: number;
};

/**
 * Distribute the body units over pages. Long tables are split row-wise with
 * their header repeated (the slice keeps `head`), and explicit page-break
 * blocks always start a new page.
 */
export function paginateModel(input: PaginateInput): DocPage[] {
  const { model, lang, currency, renderBlock, renderClientBox, bodyHeight } = input;
  void currency;
  const avail = Math.max(200, bodyHeight);
  const m = createMeasurer(lang);

  const pages: DocPage[] = [];
  let cur: DocPage = { showClientBox: false, blocks: [] };
  let curH = 0;
  let first = true;

  const pushPage = () => {
    pages.push(cur);
    cur = { showClientBox: false, blocks: [] };
    curH = 0;
  };
  const gap = () => (curH > 0 ? UNIT_GAP : 0);

  try {
    if (model.showClientBox) {
      const h = m.measure(renderClientBox());
      if (h > 0) {
        cur.showClientBox = true;
        curH = h;
      }
    }
    void first;

    for (const block of model.blocks) {
      if (block.kind === "pagebreak") {
        if (curH > 0 || cur.showClientBox) pushPage();
        continue;
      }

      const full = m.measure(renderBlock(block));
      if (full === 0) continue;

      if (curH + gap() + full <= avail) {
        curH += gap() + full;
        cur.blocks.push(block);
        continue;
      }

      const total = rowsOf(block);
      if (total <= 1) {
        // Cannot split — move to a fresh page (and let it overflow only if
        // a single unit is taller than a whole page).
        if (curH > 0 || cur.showClientBox) pushPage();
        cur.blocks.push(block);
        curH += full;
        continue;
      }

      // Split row-wise across pages.
      let from = 0;
      while (from < total) {
        const room = avail - curH - gap();
        let fit = 0;
        if (room > 60) {
          // Binary search for the largest slice that fits in `room`.
          let lo = 1;
          let hi = total - from;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const isLast = from + mid >= total;
            const h = m.measure(renderBlock(sliceBlock(block, from, from + mid, isLast)));
            if (h <= room) { fit = mid; lo = mid + 1; } else { hi = mid - 1; }
          }
        }

        if (fit === 0) {
          if (curH > 0 || cur.showClientBox) { pushPage(); continue; }
          fit = 1; // single row taller than a page — keep it anyway
        }

        const isLast = from + fit >= total;
        const slice = sliceBlock(block, from, from + fit, isLast);
        const h = m.measure(renderBlock(slice));
        cur.blocks.push(slice);
        curH += gap() + h;
        from += fit;
        if (from < total) pushPage();
      }
    }
  } finally {
    m.destroy();
  }

  if (curH > 0 || cur.showClientBox || pages.length === 0) pages.push(cur);
  return pages;
}

/** Wait for fonts and images so measurements match what gets printed. */
export async function waitForPaperAssets(): Promise<void> {
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* ignore */ }
  const imgs = Array.from(document.images).filter((i) => !i.complete);
  await Promise.all(
    imgs.map((img) => new Promise<void>((res) => {
      img.addEventListener("load", () => res(), { once: true });
      img.addEventListener("error", () => res(), { once: true });
      setTimeout(res, 1500);
    })),
  );
}
