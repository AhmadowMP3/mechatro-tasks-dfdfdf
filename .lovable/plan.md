## Problem

The jsPDF text-based approach we just tried still breaks Arabic (letters detached, words reversed — see your screenshot). jsPDF has no real complex-script shaping and `arabic-persian-reshaper` + `bidi-js` don't cover every case (diacritics, mixed lines, ligature clusters). The previous `html2canvas` approach also failed because Canvas 2D doesn't shape Arabic either.

The only reliable way to get correct Arabic in a downloadable PDF from the browser is to let the **browser itself** render the HTML to PDF — the same engine that renders the on-screen preview perfectly.

## Approach

Replace the invoice and payment-receipt PDF export with a **browser-native print-to-PDF** flow:

1. Render the existing `InvoiceDocument` / `PaymentReceiptDocument` React component into a hidden iframe sized to A4.
2. Inject the same Montserrat Arabic `@font-face` + print CSS (`@page A4`, margins, header/footer via `position: fixed`).
3. Call `iframe.contentWindow.print()`.
4. The browser's print dialog opens with **"Save as PDF"** already usable — Arabic ligatures, RTL, mixed EN/AR, numbers, everything shapes correctly because it's the real browser text engine.

This is the standard, robust way to get pixel-perfect PDFs with complex scripts from a web app. Google Docs, Notion, Linear, and most SaaS invoicing tools do exactly this for RTL languages.

## Trade-off (honest)

- User has to click "Save" in the browser print dialog (one extra click vs. a direct download).
- Filename defaults to the iframe/page title — we set `document.title` right before printing so the suggested filename is `mechatro-invoice-INV-2026-0001-20260714.pdf`.
- No silent one-click download is possible for a correctly-shaped Arabic PDF from a pure browser context. Everything that promises "one-click Arabic PDF" either uses a server (Puppeteer/Chromium headless) or breaks shaping. If you want true one-click later, we'd need a server-side render — separate task.

## Changes

### 1. New print helper — `src/lib/pdf/print-document.ts`
- Export `printReactDocument(node, { title, lang })`.
- Creates a hidden `<iframe>` with `srcdoc` scaffold: `<!doctype html>`, `<html lang dir>`, `<head>` with Tailwind base + Montserrat Arabic `@font-face` + `@page { size: A4; margin: 12mm; }` + print CSS to hide the browser's default header/footer via `@page { margin: 0 }` variant if needed.
- Renders the React node into the iframe body with `createRoot`.
- Waits for fonts (`iframe.contentDocument.fonts.ready`) and images to load.
- Sets `iframe.contentDocument.title` to the desired filename.
- Calls `iframe.contentWindow.print()`, then removes the iframe on `afterprint`.

### 2. Wire the buttons — `src/routes/_authenticated/finance.invoices.$id.tsx`
- Replace `buildInvoicePdf(...).save(...)` with `printReactDocument(<InvoiceDocument .../>, { title: stampFilename("invoice", invoice.number), lang })`.
- Same for `PaymentReceiptDocument`.
- Keep `stampFilename` so the suggested filename in the print dialog is consistent.

### 3. Remove the dead jsPDF text path
- Delete `src/lib/pdf/invoice-pdf.ts`, `src/lib/pdf/receipt-pdf.ts`, `src/lib/pdf/arabic-text.ts`.
- Uninstall `arabic-persian-reshaper` and `bidi-js`.
- Leave the shared brand/chrome/assets helpers in place — notes/reports PDFs still use them via the raster flow (untouched).

### 4. Print CSS on the invoice/receipt components
- Add a small `@media print` block scoped inside the print iframe's `<style>` (not the app) to:
  - Force `body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` so navy/gold backgrounds print.
  - Set `.avoid-break { break-inside: avoid; }` on the totals card and each table row.
  - Set page footer/header via `@page` if the user wants the "Mechatro • Page 1/1" chrome; otherwise rely on browser's default page numbering.

## Out of scope

- Notes PDF and reports PDF stay on the current `renderAndDownloadPdf` (raster) flow — they're English-only and work fine.
- No visual change to the on-screen invoice preview.
- No data / DB / server changes.

## What you'll see after this ships

- Click "Download PDF" on an Arabic invoice → the browser's print dialog opens showing the invoice **with correct Arabic** ("الإجمالي", "مدفوعة جزئياً", proper RTL columns).
- Pick **"Save as PDF"** as destination → click **Save**.
- File saves with the pre-filled Mechatro filename.
