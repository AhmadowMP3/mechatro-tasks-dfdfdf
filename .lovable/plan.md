# Fix Arabic in invoice/receipt PDFs

## Problem
The current export renders the React `InvoiceDocument` offscreen, then uses `html2canvas` to rasterize it and `jsPDF` to place the image. `html2canvas` draws Arabic through the Canvas 2D text API, which does not do complex-script shaping — letters render disconnected and sometimes in the wrong order. Even with the Montserrat Arabic font embedded, ligatures come out broken.

## Approach
Replace the raster pipeline for invoices and payment receipts with a **direct jsPDF text layout**. Text goes into the PDF as real Unicode strings, so Arabic characters are searchable, selectable, and — with proper shaping + BiDi — rendered correctly.

Nothing else changes: the on-screen `InvoiceDocument` preview, Excel/xlsx exports, and note/report PDFs (which use different flows) are untouched.

## Changes

### 1. New Arabic text engine
- Add `src/lib/pdf/arabic-text.ts` exporting `shapeArabic(text)` and `drawRtlText(pdf, text, x, y, opts)`.
- Internally use `arabic-persian-reshaper` (presentation-form ligatures) + `bidi-js` (logical→visual reordering for mixed AR/EN/numbers).
- Register the existing Montserrat Arabic TTF (already bundled at `src/lib/pdf/assets`) into every jsPDF instance via `pdf.addFileToVFS` + `pdf.addFont`.

### 2. New invoice PDF builder
- Add `src/lib/pdf/invoice-pdf.ts` with `buildInvoicePdf({ invoice, items, customer, settings, lang })` returning a `jsPDF` instance.
- Reproduce the current `InvoiceDocument` visual layout using jsPDF primitives:
  - Header band with brand logo (loaded as image), colored rule
  - Invoice title + number, status pill
  - Issue/due dates block
  - "Bill to" card with customer name/company/email/phone
  - Items table (description, qty, price, discount, total) — RTL column order in Arabic
  - Totals block (subtotal, total emphasis box, paid, balance due)
  - Notes block
- Text drawing goes through `drawRtlText` when `lang === "ar"`, plain `text()` otherwise.
- Stamp the unified header/footer chrome using the existing `stampChrome()` (already jsPDF-native).

### 3. New payment receipt PDF builder
- Add `src/lib/pdf/receipt-pdf.ts` with `buildReceiptPdf({ payment, invoice, customer, settings, lang })` mirroring `PaymentReceiptDocument`.

### 4. Wire buttons
- In `src/routes/_authenticated/finance.invoices.$id.tsx`, replace the two `renderAndDownloadPdf(<InvoiceDocument .../>, ...)` and `renderAndDownloadPdf(<PaymentReceiptDocument .../>, ...)` call sites with `buildInvoicePdf(...).save(filename)` and `buildReceiptPdf(...).save(filename)`.
- Keep `stampFilename` and the current filename/chrome behavior.

### 5. Dependencies
- `bun add arabic-persian-reshaper bidi-js`.

## Out of scope
- Notes PDF export, reports PDF, and any other `renderAndDownloadPdf` callers keep the raster flow.
- No visual change to the on-screen invoice preview.
- No data or database changes.

## Technical notes
- jsPDF requires the font to be added per instance (or per document) before `setFont("MontserratArabic")`. The Arabic TTF asset is fetched once and cached as a base64 string module-level to avoid re-fetch per export.
- `bidi-js` operates on paragraph-level strings; each drawn line is shaped independently, which matches how the layout emits text.
- Numbers and currency stay in Latin digits (`$30,000.00`) so no digit-shaping toggle is needed.
- Table rows measured with `pdf.getTextWidth()` after shaping to ensure the RTL right-anchored columns line up under Arabic headers.
