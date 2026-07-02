## Member PDF Report — "Branded Dashboard"

Add a **Generate Report** button on every team member card (visible only to admins / master admin). Clicking opens a small dialog to pick:

- **Language**: Arabic (RTL) · English (LTR) · Bilingual (both in one PDF)
- **Range**: All time · Last 7 days · Last 30 days · Last 90 days · Custom (from/to)

Then it renders and downloads `Mechatro-Report-{Member}-{Date}.pdf`.

### What the PDF contains

Everything we have about the member, organized into sections:

1. **Cover page** — dark Mechatro gradient hero, logo, member avatar (circle), full name (large), role pill, status, email, join date, report range, generated-at timestamp.
2. **Profile & role** — role, permissions inherited from their role, active/suspended, master-admin flag, last sign-in.
3. **Performance KPIs** — big-number cards: Total tasks, Completed, In progress, Paused, Overdue, On-time %, Completion %, Avg. task duration, League points, Rank.
4. **Charts** — Status donut (todo/in_progress/paused/done), Priority bars, Tasks-per-project bars, 12-week completion sparkline. Drawn as vector shapes in the PDF (no external chart images).
5. **Projects** — table of projects the member is on: project name, color chip, their task count, completion %, last activity.
6. **Tasks breakdown** — grouped by status: title, project, priority, start date, due date, overdue flag, completion date. Paginated cleanly across pages.
7. **Work sessions** — total tracked time, sessions count, avg session length, last 20 sessions table.
8. **Comments & files** — counts + last 10 comments (truncated) and last 10 Drive links added.
9. **Activity timeline** — last 50 activity_log entries for the member with icons and relative dates.
10. **Footer on every page** — Mechatro logo mark, page X/Y, member name, report range.

### Visual style — "Branded Dashboard"

- Dark cover + section dividers using the existing brand gradient (blue → green → orange).
- Light content pages (white/near-white) for readability + printing.
- KPI cards with rounded corners, thin brand-color top border, huge number, small label.
- Charts use the Mechatro palette (`#189FD1`, `#22C55E`, `#FF8A3D`, `#F0676A`, muted grid).
- Section headers: brand blue with a small colored square accent, no cheesy divider lines.
- Consistent 40pt page margins, 8pt grid.

### Bilingual handling

- **English** PDF: Montserrat, LTR.
- **Arabic** PDF: uses the Arabic Montserrat font already in the project, RTL layout (labels right-aligned, tables mirrored, page numbering flipped).
- **Bilingual** PDF: each section renders Arabic block first (RTL) then English block (LTR), separated by a thin rule; cover page shows both titles stacked.

### Technical details

- **Library**: `pdfmake` — supports embedded TTF fonts (needed for Arabic), vector shapes for charts, tables, page headers/footers, and works fully client-side (no server round-trip, no Node-only deps). Register Montserrat + Montserrat Arabic from the fonts already bundled in `src/assets/fonts/` as base64 VFS entries at first use.
- **New files**:
  - `src/lib/report/fonts.ts` — lazy-load font TTFs, base64 encode, register with pdfmake.
  - `src/lib/report/data.ts` — one function `loadMemberReportData(memberId, range)` batching supabase reads (profile, role+permissions, projects via tasks, tasks, work_sessions, task_comments, task_files, activity_log, league rank calc).
  - `src/lib/report/charts.ts` — pure functions that return pdfmake `canvas` node arrays (donut, bar, sparkline).
  - `src/lib/report/build-pdf.ts` — `buildMemberReport({ member, data, lang, range })` returning a pdfmake docDefinition; handles LTR/RTL/bilingual.
  - `src/components/team/GenerateReportDialog.tsx` — the language + range picker modal.
- **Team page** (`src/routes/_authenticated/team.tsx`): add a `FileText` icon button per member card, gated by `isMasterAdmin || user.role === 'admin'`. Opens the dialog. On confirm, calls `buildMemberReport(...)` → `pdfMake.createPdf(doc).download(filename)`.
- **i18n**: add keys (`generateReport`, `reportLanguage`, `reportRange`, `bilingual`, `custom`, `from`, `to`, all KPI labels, section titles) to `src/i18n/dict.ts`.
- **No DB migration needed** — `activity_log` already permits admins to select, and all other tables are readable by admins under existing RLS.
- **No new dependency for charts** — pdfmake's `canvas` primitive draws lines/rects/ellipses natively, keeping the bundle lean.
- **Bundle impact**: pdfmake + fonts are dynamically imported inside the click handler so the /team route stays light.

### Deliverable

After approval I'll implement in one pass: dialog + data loader + font registration + PDF builder (all three language modes) + Team page button, then verify by generating a sample report for an existing member.