# One page engine for editor, preview and PDF

Today the editor computes real A4 pages (Phase 3/4), while the preview and the
PDF export throw that away and render the whole document as one long elastic
sheet. That is why the breaks you see while editing are not the breaks you get
in the exported file.

This change makes the preview and the PDF render **the page model the editor
already computed**. Nothing is paginated twice.

## What changes for you

- The preview shows the same sheets, in the same order, with the same content
  on each sheet as the editor.
- The exported PDF matches the preview exactly, with no blank pages.
- Exporting the same document twice gives identical page breaks.
- A table longer than one page gets its own page and is not split (your choice).
- Opening a document straight into preview or export, without editing it first,
  still works: the pages are computed once with the same code and reused.

## Technical plan

### 1. Shared page-model cache

New `src/lib/docs/page-model-cache.ts`:

- `buildPageModel(input)` — the single entry point. Converts the document to
  canonical blocks (Phase 1), measures them with `measure.ts`, paginates with
  `paginate.ts`. All blocks atomic, tables never split.
- `getPageModel(key, input)` — returns a cached model or builds and caches one.
- `putPageModel(key, model)` — used by the editor to publish what it computed.
- Cache key = document id plus a stable signature of `model.blocks`, section
  geometry, lang, theme, currency and meta, so stale models are never reused.

`useDocPages.ts` calls `putPageModel` on every recompute; it keeps using
`buildPageModel` internally so there is only one implementation.

### 2. PaginatedDoc renders from a page model

- `PaginatedDoc` and `DocPages` take `pageModel` as a prop.
- They no longer call `paginate()`, `measureBlocks()` or compute a body height.
  `paginateDocument()`'s continuous-sheet path is removed.
- One `DocPaper` per entry in `pageModel.pages`, filled with that page's parts
  serialised to HTML via the canonical model serialiser (`toHtml` on the block
  subset for that page), so the parts on screen are exactly the parts the
  paginator assigned.
- When no `pageModel` prop is given (import preview, share view), the component
  awaits `getPageModel(...)` once and renders that. Same function, same inputs.
- `documents.$id.tsx` passes the editor's live `pageModel` straight to
  `PaginatedDoc`.

### 3. PDF export from the same model

- `exportDocPdf` in `src/lib/docs/export-doc.tsx` accepts `pageModel` and passes
  it to `<DocPages>`; when absent it resolves it through `getPageModel`.
- `documents.$id.tsx` hands the editor's cached model to the export call.
- `printReactDocument` keeps the hidden-iframe + native print approach exactly
  as it is — no html2canvas, no jsPDF, no server rendering.

### 4. Print CSS in `src/lib/pdf/print-document.ts`

- `.doc-page` height becomes `1122.5px` (from `1123px`).
- Existing `break-after: page` / `page-break-after: always` rules stay, with
  `break-after: auto` on `:last-child`.
- Add the Phase 4 stacking rule: body layer at `z-index: 2`, header band, QR
  slot row and footer band at `z-index: 3` with an opaque paper background, so
  a pagination miss slides text under the letterhead, never over it.

### 5. Checks

- `bunx tsgo --noEmit` and a production build.
- Import the Hattin quotation, compare editor sheet boundaries with the
  preview, and export twice to confirm identical breaks and no blank pages.

No database or backend change is needed.
