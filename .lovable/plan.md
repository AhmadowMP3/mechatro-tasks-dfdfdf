## Goal
Make every screen usable on phones (≤480px) and tablets (≤900px) without sideways scroll, cramped touch targets, or clipped content. Keep desktop layout unchanged.

## Approach
Introduce a single responsive helper (`useIsMobile` hook already exists as inline in AppShell — promote to `src/lib/useBreakpoint.ts` returning `{ isMobile, isTablet }`). Use it to switch inline styles in every page. Prefer CSS-first fixes (media queries, `clamp()`, `minmax`, `flex-wrap`) over JS.

## Global fixes (`src/styles.css`)
- Add a base `html { -webkit-text-size-adjust: 100%; }` and `body { overflow-x: hidden; }`.
- Add `.brand-card { padding: clamp(14px, 3vw, 24px); }` and reduce section padding on `@media (max-width: 640px)`.
- Force all modals: `.brand-card` used as modal → `max-height: 90dvh; overflow-y: auto` so long forms scroll.
- Tighten default heading sizes with `clamp()` at ≤640px.

## AppShell (`src/components/layout/AppShell.tsx`)
- Lower mobile breakpoint check to 1024px so tablets also get the drawer sidebar.
- Header: allow controls to wrap; hide "English/عربي" text-only, keep compact pill; shrink logo.
- Main padding: `clamp(12px, 3vw, 28px)`.

## Sidebar (`src/components/layout/Sidebar.tsx`)
- Fix drawer width to `min(300px, 88vw)` so it fits small phones.
- Ensure scrolling inside drawer when nav list overflows.

## Dashboard (`src/routes/_authenticated/index.tsx`)
- FilterBar row: `flex-wrap: wrap`; presets scroll horizontally with `overflow-x: auto` on mobile.
- KPI grid: already auto-fit — lower min from 200 → 150.
- Task Flow segments grid: switch to `repeat(auto-fit, minmax(90px,1fr))` and stack labels vertically on mobile.
- "1fr 1fr" comparison grids → `repeat(auto-fit, minmax(220px,1fr))`.
- Momentum bar row: allow horizontal scroll wrapper.
- Team Pulse rows: stack avatar + meta vertically at ≤480px.

## Tasks (`src/routes/_authenticated/tasks.tsx` + views)
- View switcher + filter row: wrap; make ViewSwitcher a full-width segmented control on mobile.
- KanbanView: keep horizontal scroll but set column width to `min(300px, 82vw)` and add snap (`scroll-snap-type: x mandatory`) for phone swiping.
- TableView: already `overflowX:auto`; add sticky first column on mobile for readability.
- CalendarView: shrink day-cell padding + font at ≤640px; day names to 1-letter.

## Projects (`src/routes/_authenticated/projects.tsx` + `projects.$id.tsx`)
- Card grid min 280 → 240.
- Meta row (title + created/due dates): wrap onto new line on mobile using grid two-col → single-col.
- New-project modal already `max-w:520 width:100%`; add `margin: 16px; max-height: 90dvh; overflow-y:auto`.

## Team (`team.tsx`) & League (`league.tsx`)
- Member cards: min 260 → 200; buttons full width on mobile.
- League podium: stack vertically at ≤640px, ranking list rows wrap.

## Notifications / Activity / References / Reports History
- Row layouts: wrap and let action buttons drop to a new line.
- References filter/search: already wraps; ensure category chip cloud stays scrollable-x on mobile.
- Report History filters: `flex-wrap` + full-width search input.

## Access Control (`access-control.tsx`)
- Member row: switch flex → grid two-row (identity | role select + actions) on mobile.
- Invite modal `1fr 1fr` name grid → single column on mobile.

## Settings
- `1fr 1fr` info grid → single column on mobile.
- Tables: wrap in `overflow-x:auto`.

## Task modals (`NewTaskModal`, `TaskDetailModal`, `GenerateReportDialog`, References modal, Category combobox popover)
- Modal shell: `width: min(560px, 100%)`, `margin: 16px`, `max-height: 90dvh`, internal `overflow-y: auto`.
- Two-column form rows collapse to one column below 560px.
- DatePicker popover: constrain width to `min(320px, calc(100vw - 32px))`.

## FilterDrawer / FilterBar
- Ensure drawer panel: `width: min(420px, 100vw)` and body scrolls.
- Chip clusters wrap; long selects scroll.

## Verification
Launch Playwright headless at viewports 375×812 (iPhone), 414×896, 768×1024, and 1280×800. For each authenticated route, screenshot and confirm:
- No horizontal page scroll.
- All primary buttons ≥44px tap target.
- Modals open fully visible and scrollable.
- Sidebar drawer opens/closes.

## Out of scope
No behavior/business-logic changes, no database changes, no new dependencies.