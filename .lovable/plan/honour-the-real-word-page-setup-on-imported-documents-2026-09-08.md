# Honour the real Word page setup on imported documents

Imported Word files currently lose their page setup, so the app falls back to the
template margins. That is what produces the wrong margins, the white band under the
header and the odd gaps before tables. The fix is to read the page setup from the
Word file and use it everywhere: editor, preview and printed PDF.

The printing method stays exactly as it is (hidden frame + the browser's own print).

## Phase 1 — Import the real Word page geometry

- `src/lib/docs/docx-ooxml.ts`: additionally read the final `<w:sectPr>` of the body
  (`w:pgSz` -> w/h, `w:pgMar` -> top/right/bottom/left/header/footer), converting
  twips to px with `twips / 1440 * 96`, using the existing namespace-safe
  `kid` / `kids` / `attr` helpers only.
- Extend `OoxmlResult` with an optional `section` (page width/height and the six
  margin/offset values in px). Return `undefined` when no `sectPr` exists — no guessed
  defaults. Surface it through `convertDocx` in `src/lib/docs/import-docx.ts`.
- `src/components/documents/ImportDocxDialog.tsx`: store it on the document model as
  `model.section`, so it is saved in `business_docs` next to `model.html`.
- Single resolver: add `resolveMargins(header, section)` next to `pageMarginsPx` in
  `src/lib/docs/types.ts`. It returns the section values when present, otherwise
  exactly today's `pageMarginsPx(header)` result. Replace every current call site:
  `DocPaper.tsx` (`const mg`), `page-metrics.ts` (`bodyWidthPx`),
  `PaginatedDoc.tsx` (`sidePadding`), `DocEditor.tsx` (`fallbackWidth`).
  `DocPaper` gets an optional `section` prop; `PaginatedDoc` and `DocEditor` pass
  `model.section` down. `chromeSide = Math.min(mg.side, 40)` stays unchanged.
- When a section exists, the header band's top padding uses `section.headerOffsetPx`
  instead of `mg.top`.

Out of scope here: extracting `header1.xml` / `footer1.xml` images, new logo variants.

## Phase 2 — Make overlap structurally impossible

In `DocPaper.tsx`, give the header band, the `[data-qr-slot]` row and the
`[data-doc-footer]` band `position: relative`, `zIndex: 3` and an opaque background
equal to the paper background (`c.bg`). Give `.doc-editor-flow` `z-index: 2` in
`src/styles.css`, and add the same rule to the print CSS in `buildIframeHtml()` in
`src/lib/pdf/print-document.ts`. A pagination miss then slides text under the chrome,
never over it.

## Phase 3 — Sheet height in print

In `print-document.ts`, change `.doc-page` height from `1123px` to `1122.5px`
(A4 = 297mm = 1122.52px) so a sheet can no longer emit a trailing blank page.
`A4` in `DocPaper.tsx` and `A4_SIZE` in `paginate.ts` stay at 1123 — the editor and
paginator measure in those units. Existing break rules stay untouched.

## Phase 4 — Images taller than one page

In `src/components/documents/editor/usePageLayout.ts`, when a single unsplittable
image block measures taller than the available body height H, clamp its rendered
height to H preserving aspect ratio, and show a small non-blocking notice in the
editor. No unsplittable block may exceed the body box.

## Phase 5 — Development-only guard

In `usePageLayout.ts`, in development only, after the measurement pass assert that no
block's bottom exceeds `k * PITCH + H` and `console.warn` the offending node.
No production behaviour change.

## Explicitly not doing

- No removal/rename of `BODY_SAFETY` in `page-metrics.ts`.
- No merging of `paginate-html.ts` and `usePageLayout.ts`.
- No changes to the gap math in `editor/pagination.ts`.
- No `html2canvas`, `jsPDF` or server-side rendering.
- No change to the QR chrome measurement.
- Note: `ItemsTable` does still exist in this project, but this work does not touch it.

## Acceptance

1. A .docx with 994-twip margins and a 706-twip header offset renders with those exact
   margins in editor, preview and PDF.
2. Editor and preview break the document between the same two blocks.
3. Nothing ever paints over the header or footer band.
4. No blank pages in the exported PDF.
5. No blank gap larger than one line height before a table.
6. Documents with no imported section behave exactly as today.

No database change is needed: `model` is already a JSON column, so `model.section`
persists without a migration.
