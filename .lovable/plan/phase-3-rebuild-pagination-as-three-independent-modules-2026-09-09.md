# Phase 3 — Rebuild pagination as three independent modules

Rebuild page splitting for business documents as three small modules with one
responsibility each: page dimensions, height measurement, and the break decision.
Nothing outside these three decides where a page ends.

## What changes for you

- Long imported Word documents split into real A4 pages again, in the editor,
  the preview and the exported PDF, with the same result in all three.
- A table that runs past the bottom of a page continues on the next page with its
  header row repeated.
- A paragraph or list that does not fit is cut between lines, never mid-line.
- An image taller than the usable area is scaled down instead of overflowing.
- Content never spills over the letterhead or the footer band.

## Modules

**1. `src/lib/docs/geometry.ts` — the only source of page dimensions**

- `PAGE`: width 794px, height 1122.5px, side/top/bottom margins from the template
  (reusing the existing `resolveMargins` result).
- `HEADER_GAP_PX = 16`, `FOOTER_GAP_PX = 16` — the visible breathing room, and the
  only safety margin; no mystery fudge constant.
- `bodyBox({ headerPx, footerPx, qrPx })` returns the usable width and height.
- Existing `A4_SIZE` and the `DocPage` type move here; `src/lib/docs/paginate.ts`
  stops exporting them and its importers are updated.

**2. `src/lib/docs/measure.ts` — the only place heights are measured**

- One reusable offscreen host: `position: fixed; left: -10000px; top: 0;
  visibility: hidden;`, width = `bodyBox().widthPx`, class `doc-rich` so it matches
  the printed body exactly. Never mounted inside the editor or the preview.
- `measureBlocks(blocks): Promise<Measured[]>` where
  `Measured = { block, heightPx, splittable, rows?, lines? }`.
- Waits for `document.fonts.ready` and the existing `waitForPaperAssets()`
  (which moves here from `paginate.ts`) before the first pass, and re-measures when
  fonts resolve again.
- Tables report per-row heights; paragraphs, headings and lists report per-line
  heights; images and page breaks are atomic (`splittable: false`).

**3. `src/lib/docs/paginate.ts` — the only break decision**

- Rewritten as a pure function: `paginate(measured, availHeightPx): PageModel`,
  with no React, no TipTap, no DOM import.
- `PageModel.pages[].parts` are whole blocks, table row slices, or text line slices,
  plus `usedPx` per page.
- Rules: a fitting block stays on the page; a splittable block is cut at the last
  row/line that fits; a table continuation repeats its header row and charges that
  height to the new page; an oversized image is scaled down (aspect ratio kept,
  flagged in the result); a page break always ends the page; a final assertion
  throws in development if any page exceeds the available height.

## Tests

Unit tests for `paginate()`: exact fit, one-pixel overflow, a table spanning more
than three pages, an image taller than a page, and a page break as first and last
block. This requires adding `vitest` as a development dependency (it is not
currently installed).

## Notes

- Rendering (`DocPaper`, `PaginatedDoc`, the print path) is not rewired in this
  phase beyond the moved imports; consuming `PageModel` in the renderers is the
  next phase.
- No database or backend change is needed.
- The acceptance grep is read as pagination vocabulary: unrelated uses of
  JavaScript's `String.split` elsewhere in the app stay as they are.
