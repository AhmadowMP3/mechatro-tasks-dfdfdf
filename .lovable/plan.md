# Phase 4 — Live A4 pages in the editor

Put real pages back in the editor, computed only from the Phase 3 modules. The
editor becomes the single place the page model is calculated; nothing else guesses
where a page ends.

## What changes for you

- While writing, the document shows as stacked A4 sheets with the letterhead and
  footer on each one.
- Typing at the bottom of a page pushes the text onto the next sheet; deleting
  pulls it back and removes the empty sheet.
- Text can never appear on top of the header or footer — the letterhead always
  covers it.
- The space under the header rule is the same on every page, including pages that
  start with a table.

## Technical plan

**New `src/components/documents/editor/useDocPages.ts`**

- Subscribes to TipTap updates, debounced ~120ms.
- Converts the document with `fromTipTapJSON` (Phase 1) to canonical blocks,
  measures them with `measureBlocks` (3b), and paginates with `paginate` (3c)
  against `bodyBox({ headerPx, footerPx, qrPx })` from `geometry.ts`.
- Header/footer/QR chrome heights are read once from the rendered `DocPaper`.
- Returns `{ pageModel, clampedImages }` and re-runs on `onFontsReady`.

**`DocEditor.tsx`**

- Renders `pageModel.pages.length` stacked `DocPaper` sheets as the background,
  with one continuous editable layer above them (same structure as today, page
  count now driven by the model).
- Spacing between sheets comes only from a positive-height spacer decoration
  inserted before the first block of each page: height = page top offset − the
  block's natural offset, always clamped at `>= 0`. A negative computed value is a
  pagination bug: logged in development, clamped to 0, never compensated with a
  negative margin.
- The first block of a page gets no special margin handling; no page-start
  normalisation module is reintroduced. Vertical rhythm stays
  `.doc-rich > * + * { margin-top: 8px }`.

**Layering**

- Editable layer at `z-index: 2`; header band, QR row and footer band in
  `DocPaper` stay at `z-index: 3` with an opaque paper background (already the
  case) so any pagination miss slides under the letterhead.

**Images**

- `clampedImages` from the paginator is surfaced as a quiet notice in the editor
  when an image had to be scaled to fit a page.

## Notes

- No database or backend change.
- No negative margin is introduced anywhere; existing `.doc-editor-*` CSS keeps
  `overflow: visible` and the app shell stays the only scroll container.
