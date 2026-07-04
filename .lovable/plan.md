## Polish Excel + PDF exports (bilingual, admin-branded)

Rebuild the export system so admins can pick a style, preview the result, then download. Excel becomes a multi-sheet workbook; PDFs come in 3 themes for both team-wide and per-member reports. Full Arabic + English support.

### 1. New "Reports" hub for admins
Add `src/routes/_authenticated/reports.tsx` — admin-only dashboard with two big cards:

- **Excel export** — one-click multi-sheet workbook.
- **PDF report** — wizard: scope → language → period → style → preview → download.

Existing per-member/per-project export buttons keep working but route through the new pipeline for consistent styling.

### 2. Excel export upgrade (`src/lib/export/xlsx.ts`)

Replace the single-sheet exporter with `exportBrandedWorkbook({ lang, period, generatedBy })` that builds one workbook with:

- **Sheet 1 — Summary**: KPI block (total tasks, done, in-progress, overdue, total points awarded, active members), top 5 leaderboard, and 2 embedded charts (tasks-by-status donut, points-by-member bar) rendered as PNG via ExcelJS `addImage`.
- **Sheet 2 — All Tasks**: current styled table with status/priority pills, project + assignee columns, autofilter, frozen header.
- **Sheet 3 — Projects**: one row per project (task count, done %, points, members involved).
- **Sheets 4…N — one per member**: sheet name = member's name (Arabic name for AR export, English for EN). Header banner shows member photo (if available), points, streak, badges. Table below lists that member's tasks.

Two buttons on the Reports page: **Download Excel (EN)** and **Download Excel (AR)** — AR workbook sets `rightToLeft: true` on every sheet, Arabic column headers, Arabic numerals via `ar-EG-u-nu-latn` (or Hindi digits if you prefer — will ask if needed).

### 3. PDF report upgrade

Admin PDF wizard steps:

1. **Scope**: Whole team OR pick one/multiple members (multi-select).
2. **Language**: English / Arabic / Bilingual (side-by-side pages).
3. **Period**: Date range picker (from/to) OR quick presets (this week / this month / this season / all-time).
4. **Style**: pick one of 3 themes (thumbnails shown):
   - **Aurora Dark** — Deep navy `#0F1B2D` backgrounds, cyan-gold gradients, glowing KPI cards. Matches app dark theme.
   - **Executive Light** — White paper, navy `#0A2540` accents, gold `#C8A24B` dividers. Print-friendly, corporate.
   - **Bold Minimal** — Lots of whitespace, huge numbers, one accent color (cyan or gold), thin dividers. Editorial feel.
5. **Preview** — Live iframe render of page 1 + a "flip through pages" pager.
6. **Download** — Generates PDF, saves to Cloud storage, logs to `member_reports` history.

Each PDF contains:
- **Cover page**: Big Mechatro logo, report title, member/team name, period, generated-by, date. Style-specific background.
- **KPI page**: 4-6 KPI cards (points, tasks done, on-time %, streak, badges earned, avg completion time) + mini bar chart of daily/weekly activity + points progression sparkline.
- **Task list pages**: Grouped by status (Done → In Progress → In Review → Overdue), colored priority/status pills, project chip, due date, points earned. One card per task, not a raw table.
- **Badges & achievements page** (per-member only): earned badges with descriptions, current streak, longest streak.
- **Footer on every page**: `Page X of Y  ·  Mechatro Tasks  ·  <period>` with a subtle brand divider line.

Bilingual mode renders every page twice (AR then EN) with the same data.

### 4. Files to add/change

- `src/lib/export/xlsx.ts` — refactor to multi-sheet builder; keep old export as thin adapter.
- `src/lib/export/xlsx-charts.ts` — new helper that renders donut/bar charts to PNG using an offscreen canvas.
- `src/lib/report/themes.ts` — new: 3 theme definitions (colors, fonts, chart palettes, cover background SVG).
- `src/lib/report/report-html.ts` — extend `buildReportHtml(data, lang, theme)` to accept theme; refactor into sections (cover, kpis, tasks, badges, footer).
- `src/lib/report/team-report.ts` — new: team-wide report HTML builder.
- `src/lib/report/generator.ts` — add `buildTeamReportPdf`, thread `theme` through everywhere.
- `src/routes/_authenticated/reports.tsx` — new admin hub route.
- `src/components/reports/PdfWizard.tsx` — new: 5-step wizard with preview.
- `src/components/reports/ThemePicker.tsx` — new: 3 thumbnail cards for style selection.
- `src/i18n/dict.ts` — add strings: "chooseStyle", "aurora", "executive", "minimal", "wholeTeam", "selectMembers", "previewReport", "downloadPdf", "downloadExcel", period presets, etc. (AR + EN).
- Sidebar: add "Reports" link for admins, replacing/augmenting current "Reports History" entry (history stays as sub-tab).

### 5. Backend

No schema changes needed — `member_reports` already stores kind/language/pdf_path/kpi_snapshot. Just extend `kind` values with `team` and store `theme` in `kpi_snapshot`. RLS untouched.

### 6. Out of scope
- Email/scheduled delivery of reports.
- Editing tasks from the wizard.
- Custom color-picker themes (only the 3 presets).
- Charts inside the PDF beyond the two agreed (activity bar + points sparkline).
