# Full anti-overlap pass on the business documents system

Goal: no clipped, cut or overlapping content anywhere in the new documents feature — the A4 preview, the exported PDF/Word, and the Arabic (RTL) screens themselves.

## 1. The A4 paper itself (header / body / footer)

- Header row: the company block and the title/meta box currently sit in a plain flex row where the meta box reserves a fixed 220px. With a long Arabic company name plus a long paper title they can collide. Make it a two-column layout with a shrinking left column, wrapped text, and a meta box that cannot be squeezed below its content.
- Long single words / URLs / emails in the contact line, client card, and headings get word-breaking so they never run under the neighbouring column.
- Footer row: `contact line · note · page number` currently share one row with a flexible middle. Give the note its own centred line when the three parts don't fit, so nothing overprints the page number.
- Body: guarantee a real gap between the last body unit and the footer band so the final row of a table can never touch or overlap the footer rule.

## 2. Pagination safety (no clipped content)

- The paginator measures the header/footer chrome once; add a small safety reserve so rounding (fonts loading a fraction later, Arabic line height) can't push the last row past the page edge.
- Tables split row-wise: repeat the table head on every continuation slice and keep the totals block glued to at least one item row, so a page never ends with a headless table or starts with only totals.
- A block taller than a whole page (a very long terms paragraph) is currently allowed to overflow and gets clipped. Split long text blocks across pages instead of clipping them.
- Never emit an empty trailing page.

## 3. PDF export

- Keep the browser print engine (correct Arabic shaping).
- Print CSS: enforce exact A4 sheet size per `.doc-page`, no scaling drift, `break-after: page` only between pages, and colours preserved.
- Verify the printed page count equals the previewed page count on a long document.

## 4. Word export

Apply the same page split and the same header/footer layout fixes so the .doc file matches the preview page for page.

## 5. RTL screens (documents list + template editor)

From the screenshots:
- Documents list: the row actions (تحرير / تكرار / PDF / Word / delete) overlap each other and the card text. Rebuild that row as a wrapping action group with proper gaps and hit areas, and give each button a label that can't collide with its icon.
- The type chips row (عرض سعر QT, طلب عرض سعر RFQ …) has the Latin code overlapping the Arabic label — separate them into label + code with real spacing.
- Template editor: the A4 preview is clipped on the side because the scaler doesn't account for RTL origin; make the scaler direction-aware so the whole sheet is visible, and let it grow to the full paginated height.
- Apply the standard responsive rules to both screens' header rows (grid + min-w-0 + shrink-0 + truncate) so nothing collapses on mobile.

## 6. Verification (mandatory, not optional)

- Build a stress document (long Arabic company name, 60 items, a very long terms block, a long client address) and render it headlessly.
- Screenshot every page of the preview and inspect each one for: overlap, clipping, text touching the footer, missing table heads, blank pages.
- Export the PDF pages to images and inspect the same list. Iterate until a full pass shows no issues, then report what was found and fixed.
- Screenshot the documents list and template editor at desktop, tablet and mobile widths and confirm no overlapping controls.

## Technical notes

Files in scope: `src/components/documents/DocPaper.tsx`, `DocBody.tsx`, `PaginatedDoc.tsx`, `src/lib/docs/paginate.ts`, `export-doc.tsx`, `export-html.ts`, `src/lib/pdf/print-document.ts`, `src/routes/_authenticated/documents.index.tsx`, `documents.$id.tsx`, `doc-templates.tsx`. Design language, colours, fonts and content stay exactly as they are — this is layout and pagination only. The temporary `src/routes/pagination-check.tsx` route is reused for the stress test and deleted at the end.
