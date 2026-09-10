// The ONLY break decision in the repo. Pure: no DOM, no React, no TipTap,
// no side effects — fully unit-testable.

import { BLOCK_GAP_PX } from "./geometry";
import type { Measured } from "./measure";

export type PagePart =
  /** A whole block. */
  | { blockIndex: number }
  /** A slice of a table's rows (inclusive). */
  | { blockIndex: number; fromRow: number; toRow: number }
  /** A slice of a text block's lines (inclusive). */
  | { blockIndex: number; fromLine: number; toLine: number };

export type PageModel = {
  pages: Array<{
    parts: PagePart[];
    usedPx: number;
    /** True when a single indivisible part is taller than the page itself. */
    overflows?: boolean;
  }>;
  /** Images that had to be scaled down to fit a page, with their factor. */
  scaledImages: Array<{ blockIndex: number; scale: number }>;
};

type Page = { parts: PagePart[]; usedPx: number; overflows?: boolean };

const isDev = () => {
  try {
    return typeof process !== "undefined" && process.env?.["NODE_ENV"] !== "production";
  } catch {
    return false;
  }
};

/**
 * Rows after which a page break is allowed. A vertically merged cell spanning
 * rows r…r+n locks those rows together; everything else may break freely.
 */
function breakableAfter(rowSpans: Array<Array<{ rowSpan: number }>>, rowCount: number): boolean[] {
  const locked = new Array(Math.max(0, rowCount)).fill(false) as boolean[];
  rowSpans.forEach((row, ri) => {
    for (const cell of row) {
      for (let k = 0; k < cell.rowSpan - 1; k++) {
        const at = ri + k;
        if (at < locked.length) locked[at] = true; // break after `at` forbidden
      }
    }
  });
  return locked.map((l) => !l);
}

/**
 * Split measured blocks into pages that each fit inside `availHeightPx`.
 * `blockGapPx` mirrors the CSS gap between two siblings in the body and is
 * charged between every two parts placed on the same page.
 */
export function paginate(measured: Measured[], availHeightPx: number, blockGapPx: number = BLOCK_GAP_PX): PageModel {
  const avail = Math.max(1, availHeightPx);
  const gap = Math.max(0, blockGapPx);
  const pages: Page[] = [];
  const scaledImages: PageModel["scaledImages"] = [];
  let page: Page = { parts: [], usedPx: 0 };

  /** Gap charged before the next part on the current page. */
  const lead = () => (page.parts.length > 0 ? gap : 0);
  const remaining = () => avail - page.usedPx - lead();
  const flush = (force = false) => {
    if (page.parts.length > 0 || force) pages.push(page);
    page = { parts: [], usedPx: 0 };
  };
  const place = (part: PagePart, heightPx: number) => {
    page.usedPx += lead() + heightPx;
    page.parts.push(part);
  };

  measured.forEach((m, blockIndex) => {
    const { block } = m;

    if (block.type === "pageBreak") {
      flush(true);
      return;
    }

    const rowSpans = block.type === "table" ? block.rows : null;
    const canSplitRows = !!(rowSpans && m.rows && m.rows.length > 1 && m.splittable);

    // Atomic blocks -------------------------------------------------------
    if (!canSplitRows && (!m.splittable || (!m.rows?.length && !m.lines?.length))) {
      if (m.heightPx > avail) {
        if (block.type === "image") {
          const scale = avail / m.heightPx;
          scaledImages.push({ blockIndex, scale });
          if (page.parts.length > 0) flush();
          place({ blockIndex }, avail);
          flush();
          return;
        }
        // Non-image oversize: a page of its own, kept at its true height.
        if (page.parts.length > 0) flush();
        place({ blockIndex }, m.heightPx);
        page.overflows = true;
        flush();
        return;
      }
      if (m.heightPx > remaining()) flush();
      place({ blockIndex }, m.heightPx);
      return;
    }

    // Table: split at row-group boundaries, repeating the header row -------
    if (block.type === "table" && m.rows?.length) {
      const rows = m.rows;
      const hasHeader = block.headerRow && rows.length > 1;
      const headerH = hasHeader ? rows[0]! : 0;
      // The repeated header costs its own gap under it on continuation pages.
      const headerCost = hasHeader ? headerH : 0;
      const breakOk = breakableAfter(rowSpans ?? [], rows.length);
      let from = hasHeader ? 1 : 0;
      let isFirstSlice = true;

      while (from < rows.length) {
        let budget = remaining() - headerCost;
        if (budget <= 0) {
          if (page.parts.length > 0) {
            flush();
            continue;
          }
          budget = avail - headerCost;
        }
        let to = from - 1;
        let used = 0;
        while (to + 1 < rows.length && used + rows[to + 1]! <= budget) {
          to += 1;
          used += rows[to]!;
        }
        // Retreat to the last row a merged cell allows breaking after.
        while (to >= from && !breakOk[to] && to + 1 < rows.length) {
          used -= rows[to]!;
          to -= 1;
        }
        let overflow = false;
        if (to < from) {
          if (page.parts.length > 0) {
            flush();
            continue;
          }
          // One indivisible row group taller than a page: keep it whole.
          to = from;
          while (to + 1 < rows.length && !breakOk[to]) to += 1;
          used = rows.slice(from, to + 1).reduce((s, h) => s + h, 0);
          overflow = used + headerCost > avail;
        }
        place({ blockIndex, fromRow: from, toRow: to }, used + headerCost);
        if (overflow) page.overflows = true;
        from = to + 1;
        isFirstSlice = false;
        void isFirstSlice;
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
      let overflow = false;
      if (to < from) {
        if (page.parts.length > 0) {
          flush();
          continue;
        }
        to = from;
        used = lines[from]!;
        overflow = used > avail;
      }
      place({ blockIndex, fromLine: from, toLine: to }, used);
      if (overflow) page.overflows = true;
      from = to + 1;
      if (from < lines.length) flush();
    }
  });

  if (page.parts.length > 0) flush();
  if (pages.length === 0) pages.push({ parts: [], usedPx: 0 });

  if (isDev()) {
    for (const [i, p] of pages.entries()) {
      if (p.overflows) continue; // a single part that cannot be divided
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
