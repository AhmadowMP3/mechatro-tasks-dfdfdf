## Goal

One PDF template across the whole app — dark like the website (deep navy background), the colorful Mechatro logo in the header, brand blue/orange/green as accents. Same chrome (header, footer, cover) everywhere; only the content per report changes. No overlapping, no cut text, no broken images.

## Locked design tokens

Pulled directly from `src/styles.css` so PDFs match the site.

- Page background: `#081320` (site `--background`)
- Card surface: `#0F2031` (`--card`) with hairline `#1E3A57`
- Elevated surface: `#13283D` (`--surface-3`)
- Text primary: `#E6EEF7`, secondary: `#9FB3C8`, muted: `#6B7F94`
- Accents (from the logo + brand):
  - Blue `#189FD1` / light `#42C2EE`
  - Orange `#E8732E` / light `#FF9255`
  - Green `#4E9A33` / light `#73C94E`
- Gold thin rule kept `#D4A017` only as a 2px section divider

Typography stays Montserrat + Montserrat Arabic (already wired). No new fonts.

## Shared chrome (one file, one style)

Rewrite `src/lib/report/pdf-chrome.ts` into a fully-dark palette + primitives, and route every PDF through it.

- `page()` — dark navy A4 page wrapper with 24mm top / 16mm bottom safe zones.
- `header()` — colorful logo (left) + report title (center, EN/AR small stack) + date (right) + 1px blue hairline. Drawn natively on every page except cover via `stampChrome`.
- `footer()` — "Mechatro · Innovative Energy Solutions" left, "Page X / Y" right, cyan hairline above.
- `cover()` — big centered logo, title, subtitle, date, blue+orange+green triple accent bar. One template, different text per report.
- `card()` — dark surface `#0F2031`, 1px `#1E3A57` border, 16px radius, subtle inner glow (`inset 0 1px 0 rgba(255,255,255,.03)`), no drop shadow (renders badly on dark).
- `kpiTile()`, `miniKpi()` — dark card variant, accent top-border, big number in `#E6EEF7`.
- `bilingualBody()` — EN left / hairline `#1E3A57` / AR right, both on dark.

All existing helpers (`cardHeader`, `block`, `esc`, formatters) keep the same signatures so call sites don't need to change shape — only colors.

## Native chrome (jsPDF layer)

`src/lib/pdf/chrome.ts` currently paints a light header/footer over each page after rasterization. Update it to:

- Fill each page with `#081320` before stamping (so the rasterized card canvas blends into the dark page).
- Draw the colorful logo (from `src/assets/mechatro-logo.png.asset.json`) at ~14mm height in the header.
- Draw title + date in `#E6EEF7`, hairlines in `#189FD1`.
- Skip header on page 1 if the flow supplies its own cover.

`src/lib/pdf-export.ts` — change the default page fill from white to `#081320` and drop the "safe break by scanning for near-white rows" heuristic (which won't work on dark), replacing it with the existing `breakHintsPx` block-boundary path only. Prevents mid-paragraph and mid-image cuts.

`src/lib/pdf-render.ts` — offscreen host background switches from `#ffffff` to `#081320`.

## Per-generator updates

Each generator keeps its content logic; only the wrapper + palette change.

1. **Reports** (`report-html.ts`, `team-report.ts`, `comparison-html.ts`)
   - Drop any leftover light-mode colors (all `#FFFFFF`, `#F5F6F8`, `#0B1220` refs) and reference the dark tokens from `pdf-chrome.ts`.
   - Team cover: dark KPI tiles + per-member dark cards (already the layout, just re-skinned).
   - Comparison: side-by-side A vs B, dark cards, A tinted blue-left-border, B tinted orange-left-border for instant read.

2. **Notes** (`src/lib/notes-pdf.tsx`)
   - Repaint the note document on dark: title in `#E6EEF7`, muted meta in `#9FB3C8`, blue underline accent, gold 40px rule kept.
   - Note body CSS (`.note-pdf-content`): headings `#E6EEF7`, paragraphs `#CBD5E1`, blockquote left-border blue, `code` chip `#13283D` with light text, `pre` block stays dark (it already is).
   - Images stay on the dark card via a `#0F2031` frame with 8px radius so screenshots don't look like they're floating.

3. **Finance** (`src/components/finance/BrandedDocuments.tsx`, `src/lib/pdf/print-document.ts`, `finance.invoices.$id.tsx`, `finance.payroll.tsx`)
   - Re-skin invoice + payslip templates to the same dark cards.
   - Tables: header row `#13283D`, zebra rows `#0F2031` / `#0B1A2A`, borders `#1E3A57`, totals row accent-orange rule.
   - Amounts and totals in `#E6EEF7`; currency and labels in `#9FB3C8`. Signature/stamp block on a dark card.
   - Keep the same field layout (client, items, VAT, totals) — only the skin changes.

## Cleanup

- Remove any remaining light-mode constants (`P.page = "#F5F6F8"`, white card refs) — one palette, one file.
- Drop unused theme leftovers if any survived (`themes.ts` is already gone).
- i18n keys unchanged.

## QA (mandatory, in the same turn)

For each of the 5 generator entry points (member, team, comparison, note, invoice, payslip):

1. Trigger the generator through Playwright against the running preview using seeded data.
2. Save the PDF, run `pdftoppm -jpeg -r 150` and open every page image with `code--view`.
3. Verify: no cut text at page edges, no image chopped across a page, header logo present on all body pages, footer page numbers correct, dark background continuous (no white bands), Arabic RTL columns not clipped.
4. Fix any issue and re-render before finishing.

## Files touched

- Rewrite: `src/lib/report/pdf-chrome.ts`, `src/lib/pdf/chrome.ts`, `src/lib/pdf-export.ts`, `src/lib/pdf-render.ts`, `src/lib/notes-pdf.tsx`, `src/components/finance/BrandedDocuments.tsx`, `src/lib/pdf/print-document.ts`.
- Palette-only edits: `src/lib/report/report-html.ts`, `src/lib/report/team-report.ts`, `src/lib/report/comparison-html.ts`.
- No changes to data, routes, auth, or backend.

## Out of scope

- In-app UI (site already dark).
- New fonts / new report content.
- Print-friendly light fallback (user explicitly wants full dark).
