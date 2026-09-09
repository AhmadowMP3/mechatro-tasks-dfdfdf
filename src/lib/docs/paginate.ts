// The ONLY break decision in the repo. Pure: no DOM, no React, no TipTap,
// no side effects — fully unit-testable.

import type { Measured } from "./measure";

export type PagePart =
  /** A whole block. */
  | { blockIndex: number }
  /** A slice of a table's rows (inclusive). */
  | { blockIndex: number; fromRow: number; toRow: number }
  /** A slice of a text block's lines (inclusive). */
  | { blockIndex: number; fromLine: number; toLine: number };

export type PageModel = {
  pages: Array<{ parts: PagePart[]; usedPx: number }>;
  /** Images that had to be scaled down to fit a page, with their factor. */
  scaledImages: Array<{ blockIndex: number; scale: number }>;
};

type Page = { parts: PagePart[]; usedPx: number };

const isDev = () => {
  try {
    return typeof process !== "undefined" && process.env?.["NODE_ENV"] !== "production";
  } catch {
    return false;
  }
};

/** Split measured blocks into pages that each fit inside `availHeightPx`. */
export function paginate(measured: Measured[], availHeightPx: number): PageModel {
  const avail = Math.max(1, availHeightPx);
  const pages: Page[] = [];
  const scaledImages: PageModel["scaledImages"] = [];
  let page: Page = { parts: [], usedPx: 0 };

  const remaining = () => avail - page.usedPx;
  const flush = (force = false) => {
    if (page.parts.length > 0 || force) pages.push(page);
    page = { parts: [], usedPx: 0 };
  };

  measured.forEach((m, blockIndex) => {
    const { block } = m;

    if (block.type === "pageBreak") {
      flush(true);
      return;
    }

    // Atomic blocks -------------------------------------------------------
    // A table with a vertical merge is never split: a page break inside a
    // rowSpan would tear the merged cell in half.
    const merged = block.type === "table" && block.rows.some((row) => row.some((c) => c.rowSpan > 1));
    if (!m.splittable || merged || (!m.rows?.length && !m.lines?.length)) {
      if (m.heightPx > avail) {
        if (block.type === "image") {
          const scale = avail / m.heightPx;
          scaledImages.push({ blockIndex, scale });
          if (page.parts.length > 0) flush();
          page.parts.push({ blockIndex });
          page.usedPx = avail;
          flush();
          return;
        }
        // Non-image oversize: give it a page of its own, clamped.
        if (page.parts.length > 0) flush();
        page.parts.push({ blockIndex });
        page.usedPx = avail;
        flush();
        return;
      }
      if (m.heightPx > remaining()) flush();
      page.parts.push({ blockIndex });
      page.usedPx += m.heightPx;
      return;
    }

    // Table: split by rows, repeating the header row -----------------------
    if (block.type === "table" && m.rows?.length) {
      const rows = m.rows;
      const hasHeader = block.headerRow && rows.length > 1;
      const headerH = hasHeader ? rows[0]! : 0;
      let from = hasHeader ? 1 : 0;
      let isFirstSlice = true;

      while (from < rows.length) {
        const repeat = !isFirstSlice && hasHeader;
        let budget = remaining() - (isFirstSlice ? headerH : repeat ? headerH : 0);
        if (budget <= 0) {
          if (page.parts.length > 0) {
            flush();
            continue;
          }
          budget = avail - headerH;
        }
        let to = from - 1;
        let used = 0;
        while (to + 1 < rows.length && used + rows[to + 1]! <= budget) {
          to += 1;
          used += rows[to]!;
        }
        if (to < from) {
          // A single row taller than a whole page: place it alone, clamped.
          if (page.parts.length > 0) {
            flush();
            continue;
          }
          to = from;
          used = Math.min(rows[from]!, avail - headerH);
        }
        page.parts.push({ blockIndex, fromRow: from, toRow: to });
        page.usedPx += used + (isFirstSlice || repeat ? headerH : 0);
        from = to + 1;
        isFirstSlice = false;
        if (from < rows.length) flush();
      }
      return;
    }

    // Text / list: split by lines -----------------------------------------
    const lines = m.lines ?? [];
    let from = 0;
    while (from < lines.length) {
      const budget = remaining();
      let to = from - 1;
      let used = 0;
      while (to + 1 < lines.length && used + lines[to + 1]! <= budget) {
        to += 1;
        used += lines[to]!;
      }
      if (to < from) {
        if (page.parts.length > 0) {
          flush();
          continue;
        }
        to = from;
        used = Math.min(lines[from]!, avail);
      }
      page.parts.push({ blockIndex, fromLine: from, toLine: to });
      page.usedPx += used;
      from = to + 1;
      if (from < lines.length) flush();
    }
  });

  if (page.parts.length > 0) flush();
  if (pages.length === 0) pages.push({ parts: [], usedPx: 0 });

  if (isDev()) {
    for (const [i, p] of pages.entries()) {
      if (p.usedPx > avail + 0.5) {
        const last = p.parts.at(-1);
        const bi = last?.blockIndex ?? -1;
        const type = bi >= 0 ? (measured[bi]?.block.type ?? "unknown") : "none";
        const all = p.parts.map((part) => `${part.blockIndex}:${measured[part.blockIndex]?.block.type ?? "?"}`).join(", ");
        throw new Error(
          `paginate: page ${i + 1} overflows (${p.usedPx}px > ${avail}px) — offending block ${bi} (${type}); page holds [${all}]`,
        );
      }
    }
  }


  return { pages, scaledImages };
}
