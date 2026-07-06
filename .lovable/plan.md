
# Unified Branded PDF System

Goal: every PDF the app produces (Invoices, Pay slips, Finance reports, Team/activity reports, Notes) uses one consistent brand chrome, has zero Arabic rendering bugs, and shares a single implementation so future PDFs "just work".

## Brand chrome (identical on every page of every PDF)

- **Header band** (~26mm tall): Mechatro logo top-outer edge; thin gold hairline separator below.
- **Footer band** (~14mm tall): thin gold hairline separator, then a single row:
  - Outer side: `Page X / Y` in the doc's language
  - Center: `Mechatro · ميكاترو`
  - Inner side: `Generated: 2026-07-06 14:30 · by Test User`
- Page size **A4 portrait** (215×297mm), margins 18mm side / 32mm top / 22mm bottom (header/footer reserved).
- Palette reused verbatim from the existing finance workbook: navy `#0A2540`, blue `#189FD1`, gold `#C8A24B`, ink `#0F2031`, muted `#5A6B7D`, zebra `#F5F9FD`, border `#D7DEE5`.

## Arabic rendering (the "no more bugs" fix)

- Embed **Montserrat Arabic Regular + Bold** (already in `src/assets/`) into jsPDF once via `addFileToVFS` + `addFont`. Add an English companion (Inter or Roboto) for Latin.
- New helper `getBrandedPdf(lang)` returns a jsPDF instance with the fonts pre-registered and the correct `R2L` flag set when `lang === "ar"`.
- All native text calls go through a `drawText(doc, text, x, y, opts)` helper that:
  - picks the Arabic font when the string contains Arabic characters (mixed lines auto-detected),
  - flips alignment for RTL,
  - shapes Arabic-Indic digits when `lang === "ar"`,
  - never falls back to the default Helvetica (that's the source of tofu boxes / mirrored text).

## Two rendering modes, one chrome

**Native mode** (crisp, selectable text, tiny files) — used for tabular / structured documents:
- Invoices
- Pay slips
- Finance summary reports (monthly / statement PDFs from `finance.reports`)
- Team & activity reports

**HTML mode** (needed only where rich, arbitrary formatting matters):
- Notes (rich text, images, links, headings, lists)
- Kept, but Arabic is fixed by forcing `font-family: "Montserrat Arabic"` + `direction: rtl` on the mirror, and the header/footer chrome is drawn natively by jsPDF on top of each rasterized page — so even Notes get the same crisp logo + page numbers.

## New shared library

Create `src/lib/pdf/` with:

- `brand.ts` — palette, margins, page-size constants, `stampFilename(kind)`.
- `fonts.ts` — one-time font registration; exports `getBrandedPdf(lang)`.
- `chrome.ts` — `drawHeader(doc, page)` (logo only) and `drawFooter(doc, page, total, meta)` (Page X/Y + generated + user). Called after each `addPage()` and once at the end to backfill total pages.
- `text.ts` — `drawText`, `drawParagraph`, Arabic-safe wrap and digit shaping.
- `table.ts` — thin wrapper over `jspdf-autotable` pre-configured with brand colors, zebra rows, RTL support, money/date/percent cell formatters, automatic page-break that redraws chrome.
- `html.ts` — replaces the current `pdf-render.ts` + `pdf-export.ts`: rasterizes an HTML root the way the existing pipeline does but on a doc created by `getBrandedPdf`, and calls `drawHeader/drawFooter` on each emitted page.
- `index.ts` — public entrypoints: `renderNativePdf(spec)`, `renderHtmlPdf(rootEl, spec)`, `downloadPdf(doc, filename)`.

Every generator (invoice, payslip, report, notes) will call one of the two entrypoints and pass only its content — the header/footer/font/chrome logic lives once in `src/lib/pdf/`.

## Migration per surface

- **`src/components/finance/BrandedDocuments.tsx`** — invoice + pay slip: rewritten as native jsPDF builders (`renderInvoice(doc, invoice, items, payments)`, `renderPaySlip(doc, entry, member)`). Uses `table.ts` for line items.
- **`src/routes/_authenticated/finance.invoices.$id.tsx`** — swap `renderAndDownloadPdf(...)` call for `renderNativePdf({ kind: "invoice", ... })`.
- **`src/routes/_authenticated/finance.payroll.tsx`** — swap the pay slip modal call for `renderNativePdf({ kind: "payslip", ... })`.
- **`src/routes/_authenticated/finance.reports.tsx`** — new native builder `renderFinanceReport(doc, spec)` that mirrors the sheet layout from `finance-xlsx.ts` (title block, filter meta, table, totals row).
- **`src/lib/report/generator.ts`, `report-html.ts`, `team-report.ts`** — keep the HTML composition (rich charts / status pills), route through `renderHtmlPdf` so header/footer/logo are drawn natively over each rasterized page. Arabic in the HTML is fixed by forcing the embedded font + `dir="rtl"` on the root.
- **`src/lib/notes-pdf.tsx`** — same HTML path; the "page 2/3" indicator logic in `NoteEditor.tsx` keeps working because break hints from `pdf-render.ts` are preserved (moved to `pdf/html.ts`).
- **Delete** `src/lib/pdf-render.ts` + `src/lib/pdf-export.ts` once all callers move to `src/lib/pdf/`.

## Filenames (consistent scheme)

`mechatro-{kind}-{ref}-{YYYYMMDD}.pdf`, e.g.
- `mechatro-invoice-INV-0007-20260706.pdf`
- `mechatro-payslip-2026-07-testuser-20260706.pdf`
- `mechatro-finance-report-income-202607-20260706.pdf`
- `mechatro-team-report-20260706.pdf`
- `mechatro-note-project-alpha-20260706.pdf`

## Technical section

- Packages already installed: `jspdf`, `html2canvas`, `file-saver`. Add **`jspdf-autotable`** for native tables (small, no native deps, Worker-safe — client only).
- Fonts are loaded via `fetch(fontUrl).arrayBuffer()` → base64 → `addFileToVFS` inside a **module-level lazy promise** so the cost is paid once per session; all callers `await ensureFonts()` before drawing.
- Chrome injection uses jsPDF's page counter: after building the body we iterate `doc.internal.pages` and stamp header/footer with the final total — this fixes the "Page 1 / ?" chicken-and-egg problem the current code has.
- The HTML mode's break-hint computation is preserved verbatim so images no longer get sliced (that fix stays).
- All tokens (colors, margins, fonts) live in `brand.ts` — future edits to the brand touch one file.

## Out of scope

- No changes to Excel/XLSX exports (already branded via `finance-xlsx.ts`).
- No changes to the data being exported — only the rendering pipeline.
- No new PDF surfaces; just polish + unify what exists today.

## Rollout order

1. Add `jspdf-autotable`, build `src/lib/pdf/` skeleton with font embed + chrome + native/html entrypoints.
2. Move Invoices → native. Verify AR + EN.
3. Move Pay slips → native.
4. Move Finance reports → native.
5. Move Team/activity reports → HTML entrypoint (chrome drawn natively).
6. Move Notes → HTML entrypoint. Verify page-break indicators still align.
7. Delete legacy `pdf-render.ts` / `pdf-export.ts`. Smoke-test each surface in AR + EN, portrait A4.
