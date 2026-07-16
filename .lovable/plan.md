# Finance Polish + Exports

Unify the entire Finance section with the app's design system, wire cross-tab links, add filters/search on every tab, and ship branded **PDF + Excel** exports on all finance tabs (with a consolidated report on the Reports tab).

## 1. Shared Finance UI kit
New folder `src/components/finance/ui/`:
- `FinancePageHeader.tsx` — title, subtitle, breadcrumb, right-side actions slot (Export PDF, Export Excel, primary CTA), matching Tasks/Notes headers.
- `KpiCard.tsx` — animated (framer-motion) card with icon, label, value, delta, currency; used on Overview, Reports, and top of each tab.
- `FinanceToolbar.tsx` — unified filter bar: search input, date-range picker, status/category multi-select, currency filter, "clear all" chip.
- `FinanceTable.tsx` — sticky header, zebra rows, hover, right-aligned numeric cols, sticky totals footer, skeleton loader, empty state.
- `ExportMenu.tsx` — dropdown with **Export PDF** / **Export Excel** and a spinner while generating.
- `StatusBadge.tsx` + `CurrencyAmount.tsx` — consistent pills and number formatting (parentheses for negatives, per-currency symbol).

All use existing semantic tokens (`--primary`, `--muted`, `--border`, gradients). No hardcoded colors.

## 2. Per-tab polish

For every tab (Overview, Income, Expenses, Invoices, Subscriptions, Payroll, Customers, Reports, Settings):
- Replace ad-hoc headers with `FinancePageHeader` including breadcrumb `Finance › <Tab>`.
- Top KPI strip using `KpiCard` (e.g. Income tab: Total Income, This Month, Pending, Top Currency).
- `FinanceToolbar` with search + date range + relevant filters, wired to existing query state.
- Replace tables with `FinanceTable`; add sticky totals footer per currency.
- Micro-interactions: framer-motion fade/slide on row mount, hover elevation on KPI cards, toast on actions.
- Skeleton loaders instead of blank states; branded empty state illustration slot.

## 3. Cross-tab navigation
- Invoice row → link customer name to `/finance/customers?focus=<id>` and item project → project detail.
- Expense row → category chip filters `/finance/expenses?category=<id>`; linked subscription opens `/finance/subscriptions`.
- Payroll row → member name links to `/team/$id`, period links to `/finance/payroll?period=<id>`.
- Customer detail card → "View invoices" filters `/finance/invoices?customer=<id>`.
- Overview KPIs are clickable, deep-linking to the filtered tab.
- Add `focus`/`period`/`customer`/`category` search params to route validators so links type-check.

## 4. PDF + Excel exports

### Libraries
`bun add jspdf jspdf-autotable xlsx-js-style html2canvas-pro`

### Shared export util `src/lib/finance/export.ts`
- `buildBrandedHeader(doc, settings)` — reads company name, logo, address from `financial_settings` (BrandedDocuments), draws logo + company block + report title + generated-at.
- `exportPdf({ title, filters, kpis, chartsEls, rows, columns, totals })`:
  1. Branded header
  2. KPI grid (2×N boxes)
  3. Optional charts rendered from DOM refs via html2canvas-pro → embedded as images
  4. `autoTable` for rows with zebra rows, right-aligned numerics
  5. Multi-currency totals footer + converted total using saved FX rates
  6. Page numbers + footer
- `exportExcel({ ... })` with `xlsx-js-style`:
  - Sheet 1 "Summary": branded header rows, KPI block, totals
  - Sheet 2 "Data": frozen header row, styled columns, currency number formats
  - Auto column widths, bold header, colored totals row

### Wiring per tab
Each tab passes its currently filtered rows + visible KPIs + chart refs into `ExportMenu` in the page header. Exports respect the active filters, date range, and search.

### Reports tab (consolidated)
Adds a "Download full report" section: single PDF / single XLSX (multi-sheet: Overview, Income, Expenses, Invoices, Subscriptions, Payroll) for the selected period, all branded.

### Invoices
Upgrade the existing per-invoice print to use the same branded PDF pipeline (single-invoice layout). Adds "Export Excel" for the invoice list.

## 5. i18n
Add EN/AR keys for: export.pdf, export.excel, export.generating, export.ready, filters.*, kpi.*, breadcrumb.*.

## Files touched
- **New**: `src/components/finance/ui/{FinancePageHeader,KpiCard,FinanceToolbar,FinanceTable,ExportMenu,StatusBadge,CurrencyAmount}.tsx`, `src/lib/finance/export.ts`, `src/lib/finance/format.ts`.
- **Edited**: all `src/routes/_authenticated/finance.*.tsx`, `src/components/finance/BrandedDocuments.tsx` (expose settings hook), `src/i18n/dict.ts`, `package.json`.

## Out of scope
- Backend/schema changes, RLS, FX-rate logic changes.
- Broken-link audit (per your choice).
- New reports/analytics logic — visuals + export only.

## Technical notes
- Exports run fully client-side; no server functions needed.
- Chart capture uses `html2canvas-pro` (supports oklch); we attach `data-export="chart"` refs to Recharts wrappers.
- File names: `<Tab>_<YYYY-MM-DD>.pdf` / `.xlsx`.
- Arabic PDFs: register a Unicode TTF (Cairo or Noto Naskh Arabic) with jsPDF at first export; ship font as base64 asset.
