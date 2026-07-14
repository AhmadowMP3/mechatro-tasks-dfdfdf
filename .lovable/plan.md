# Unified PDF Polish — All Reports

Bring the Team report and Comparison report up to the same Dashboard Card standard as the Member report, wire in the new colorful Mechatro logo everywhere, and use one shared header/footer/cover system.

## What changes

### 1. Shared design layer (new `src/lib/report/pdf-chrome.ts`)
One place that owns:
- **Logo** — the new colorful Mechatro logo (blue M / orange ATRO / green tagline / lightbulb), uploaded as a Lovable asset, embedded as base64 into every PDF so it renders offline.
- **Header** — every page (except cover): colorful logo left (28px tall), report type + generated date right, thin gold underline.
- **Footer** — every page: "Mechatro · Innovative Energy Solutions" left, page X of Y right, cyan hairline.
- **Cover template** — big colorful logo centered, report title, subtitle, date, decorative cyan/gold accent bars.
- **Card primitive** — white rounded card, soft shadow, section title (EN left / AR right), body slot.
- **Palette** — one exported const: bg `#F5F6F8`, card `#FFFFFF`, ink `#0F172A`, cyan `#42C2EE`, gold `#D4A017`, mint `#10B981`, coral `#EF4444`.

### 2. Delete legacy pieces
- `src/lib/report/themes.ts` — no more themes, one style only.
- Any `theme` param threaded through `generator.ts`, `report-html.ts`, `team-report.ts`, `comparison-html.ts`, and the two route call sites.

### 3. Member report (`report-html.ts`)
Already dashboard-card style — retrofit to use the shared chrome/palette so it stays in sync. Swap its inline SVG header for `pdfChrome.header()`.

### 4. Team report (`team-report.ts`)
Rewrite to the new style:
- **Cover:** colorful logo, "Team Report — Mechatro", date range, and 4 KPI tiles (Total tasks · Done % · On-time % · Total hours) computed across all members.
- **Body:** one bilingual dashboard card per member with mini KPIs (tasks, done %, hours, points) + a compact activity strip (last 10 items per member to keep team PDF tight).
- Same header/footer on every page.

### 5. Comparison report (`comparison-html.ts`)
Rewrite to side-by-side A vs B:
- **Cover:** colorful logo, "Comparison Report", A vs B names, date range.
- **Body:** two-column layout, Member A left / Member B right. Matching rows: KPI tiles, task-status donut, hours bar, top tags, activity summary. Rows aligned so differences read at a glance.
- Bilingual labels ("Hours / ساعات") inline; long descriptive text stays English to keep columns narrow.

### 6. Generator (`generator.ts`)
- Remove theme branching.
- Use `pdfChrome.header()` / `pdfChrome.footer()` as the single header/footer renderer for all 3 report types.
- Keep the existing html→canvas→jsPDF block-packer; just feed it blocks from the new builders.

### 7. Dialogs
- `GenerateReportDialog.tsx` — already theme-less, leave as is.
- Any comparison / team dialogs: remove leftover theme props.

## Logo handling

Upload the user-provided logo (`user-uploads://magnific_IaMyjyRtvE-3.png`) via `lovable-assets`, then in `pdf-chrome.ts` fetch it once at generation time and inline as a data URL so PDFs stay self-contained.

## QA (mandatory before finishing)

For each of the 3 report types:
1. Generate the PDF via Playwright.
2. `pdftoppm -jpeg -r 150` every page.
3. Inspect each page for: logo present + not stretched, no overlapping text, no truncated Arabic, footer never crosses content, page numbers correct, chart labels legible.
4. Iterate on the HTML until all pages pass. Report what was checked and fixed.

## Out of scope

- In-app UI for Team / Reports pages.
- Any data model or query changes.
- New fonts (keep current Cairo + Inter stack).

## Files touched

- New: `src/lib/report/pdf-chrome.ts`, `src/assets/mechatro-logo.png.asset.json`
- Rewritten: `src/lib/report/team-report.ts`, `src/lib/report/comparison-html.ts`, `src/lib/report/report-html.ts` (chrome retrofit), `src/lib/report/generator.ts`
- Deleted: `src/lib/report/themes.ts`
- Minor: 2 route files to drop theme props
