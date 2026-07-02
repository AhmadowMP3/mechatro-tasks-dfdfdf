## Goal
Upgrade filtering on Tasks, Projects, Team, and Activity Log to a collapsible **filter drawer** with rich controls, and add a **branded Mechatro XLSX export** on each page.

## 1. Shared building blocks (new)

**`src/components/filters/FilterDrawer.tsx`**
- Slide-in panel (uses shadcn `Sheet`, right side in LTR / left in RTL).
- Sticky header with title + "Reset all", body with grouped filter sections, footer with "Apply" + active-count badge.
- Trigger button lives in each page header showing active filter count.
- Bilingual labels via `dict.ts`.

**`src/components/filters/controls/`** — reusable inputs:
- `MultiSelectChips` (assignee, project, status, role, category…)
- `DateRangePicker` with presets (Today, 7d, 30d, This month, Custom)
- `SearchInput` with debounce
- `SortControl` (field + direction)

**`src/lib/export/xlsx.ts`** — branded Excel export using `exceljs`:
- Row 1: Mechatro logo (embedded PNG from `src/assets`) + "Mechatro Tasks / مهام ميكاترو" title in Brand Blue.
- Row 2: Report name (e.g. "Tasks export"), generated-at timestamp, generated-by, active filters summary.
- Row 4: styled header row (Brand Blue fill, gold bottom border, white bold text, frozen).
- Data rows: zebra striping, status/priority cells colored by pill palette, dates formatted, RTL sheet direction when language = AR.
- Auto column widths, autofilter on header, sheet name = page + date.
- Helper: `exportToBrandedXlsx({ sheetName, title, filtersSummary, columns, rows, lang })`.

**Dependency:** `bun add exceljs file-saver` (+ `@types/file-saver`).

## 2. Per-page changes

### Tasks (`_authenticated/tasks.tsx`)
Filters: search, project (multi), assignee (multi, admin only), status (multi, incl. `in_review`), priority (multi), date range (created / due — toggle), overdue-only, has-attachments, sort.
Export columns: Task, Project, Assignee, Status, Priority, Start, Due, Elapsed, Comments count.

### Projects (`_authenticated/projects.tsx`)
Filters: search, status, owner (admin), date range (created / due), progress bucket (0–25/26–50/51–75/76–100 %), sort.
Export: Project, Owner, Status, Start, Due, Tasks total, Done, Progress %.

### Team (`_authenticated/team.tsx`)
Filters: search, role, status (active/invited/disabled), sort (name, tasks, completion rate).
Export: Name, Email, Role, Status, Joined, Tasks assigned, Done, In progress, Completion %.

### Activity Log (`_authenticated/activity.tsx`)
Keep existing filters but move into the same drawer for consistency; add action-type multi-select, actor multi-select, entity-type filter, date range presets.
Replace current plain CSV button with the branded XLSX export. Columns: When, Actor, Action, Entity type, Entity, Details.

## 3. State + URL sync
- All four pages persist filter state in URL search params via TanStack Router `validateSearch` + `zodValidator` + `fallback` (matches existing dashboard pattern), so filters survive reload and are shareable.
- Drawer reads/writes through the same hook (`useTaskFilters`, `useProjectFilters`, …).

## 4. UX details
- Active-filter chips row above the list (removable) even when drawer is closed.
- Export button placed next to the drawer trigger; shows spinner while building XLSX.
- Members on Tasks page: assignee filter hidden (they only see own tasks); Team + Activity pages remain admin-only.
- All filters and export respect current language (labels, date locale, RTL sheet direction).

## Technical section
- `exceljs` runs fully in the browser; `file-saver` triggers download. No server function needed.
- Logo embedded via base64 from `src/assets/mechatro-logo.png` at module init.
- Colors reused from `src/styles.css` tokens mirrored in a `BRAND` constant in `xlsx.ts` (Brand Blue `#0A2540`, Gold `#C8A24B`, etc. — I'll read the exact values from styles.css during build).
- No DB migrations. No RLS changes. No backend edits.
