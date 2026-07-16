## Problem

Opening `/reports-history/compare?a=…&b=…` shows the Report History list, not the comparison. The comparison content never appears.

**Root cause:** File-based routing treats `reports-history.tsx` as the parent of `reports-history.compare.tsx` (dot = nested). The parent's component (`ReportsHistoryPage`) does not render `<Outlet />`, so when the child route matches, TanStack still renders the parent's list UI and the child is silently swallowed. Data in the DB is fine (`kpi_snapshot` is populated on both selected rows).

## Fix

Make the compare route a sibling instead of a nested child so it renders on its own, without touching the history list page.

1. Rename `src/routes/_authenticated/reports-history.compare.tsx` → `src/routes/_authenticated/reports-history_.compare.tsx`. The trailing `_` on `reports-history_` opts the child out of the parent layout while keeping the same URL `/reports-history/compare`. No other imports need to change.
2. Inside the renamed file, update `createFileRoute("/_authenticated/reports-history/compare")` → `createFileRoute("/_authenticated/reports-history_/compare")` to match the new file path (URL stays `/reports-history/compare`).
3. Let the router regenerate `src/routeTree.gen.ts` on next build.

## Polish (small, no logic change)

While in the file, tighten the comparison view so it looks premium and never shows an empty state:

- Add a proper empty/loading skeleton (branded spinner + text) instead of the plain "Loading…" / "Missing reports" strings, using existing tokens (`--surface`, `--brand-blue`, `--brand-gold`).
- Guard against missing `kpi_snapshot` fields (older rows) by defaulting `totals`, `status_dist`, and `projects_touched` to safe empties so a partial row still renders the header and KPI grid instead of crashing.
- Add subtle entrance transitions on the KPI rows (staggered fade/slide via CSS, no new deps) to match the existing "cool" motion elsewhere.

## Verification

- Navigate to `/reports-history`, select two reports, click Compare → comparison page renders (hero, KPI deltas, status bars, projects venn) instead of the list.
- Direct-load `/reports-history/compare?a=…&b=…` also renders the comparison.
- No TypeScript build errors; `routeTree.gen.ts` regenerates cleanly.

## Out of scope

- Report generator, PDF export logic, backup system, other tabs.
- Any change to the history list page itself.
