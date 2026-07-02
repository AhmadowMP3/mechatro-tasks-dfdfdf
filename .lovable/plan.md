## Dashboard Filters

Add a filter bar at the top of the Dashboard that instantly re-scopes every KPI, chart, and list on the page.

### Filters
- **Date range** — presets (Today, 7d, 30d, 90d, All-time) + custom start/end picker. Applies to: momentum chart window, "completed this week" KPI (becomes "completed in range"), activity feed, work-session hours, sparklines.
- **Project** — multi-select of active/archived projects (defaults to All). Scopes tasks + derived stats + Team Pulse workloads.
- **Status** — multi-select chips (Todo, In Progress, Paused, Done). Scopes task distribution, Task Flow pipeline, overdue list, project stats.

### Behavior
- Filter bar sits directly under the hero header, sticky on scroll, RTL-aware.
- State stored in URL search params (`from`, `to`, `projects`, `statuses`) via `validateSearch` + `zodValidator` so filtered views are shareable and survive refresh.
- Query key includes the filters → TanStack Query refetches only when needed; UI updates instantly from cached data on toggle.
- "Clear filters" button appears when any non-default filter is active; shows count badge.
- Overdue KPI stays global (overdue is overdue regardless of range) but respects project/status filters.

### Technical
- New `src/components/dashboard/FilterBar.tsx` (presets, date pickers, multi-select popovers using existing shadcn primitives).
- Extend `Route` in `src/routes/_authenticated/index.tsx` with `validateSearch` (zod schema, `fallback` defaults).
- Refactor Dashboard to derive `filteredTasks`, `filteredProjects`, `filteredSessions`, `filteredActivity` from search params before computing KPIs.
- Momentum chart's day count derives from the selected range (cap at 90 bars; switch to weekly buckets beyond 90d).
- All existing sections keep their current visuals — only the input data changes.

No schema or backend changes.