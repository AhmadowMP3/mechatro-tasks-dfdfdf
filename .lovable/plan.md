## Cause

The share viewer at `src/routes/share.$token.$page.tsx` is a **parallel rebuild** of every page (Dashboard, Tasks, Projects, Team, League, References, Activity) using its own JSX, its own layout, and its own reduced datasets from the `share-access` edge function. It will always drift from the real app because none of the real page components are actually rendered — only lookalikes are.

The real pages under `src/routes/_authenticated/*.tsx` (`index.tsx`, `tasks.tsx`, `projects.tsx`, `team.tsx`, `league.tsx`, `references.tsx`, `activity.tsx`) all call `supabase.from(...)` directly and rely on the logged-in RLS session, so they can't just be dropped into an unauthenticated `/share/$token` context.

## Solution — one shared page, two data sources

Replace the clone with the **actual page components**, rendered in a read-only shell that provides them with data via a public token instead of an authenticated Supabase session.

### 1. Introduce a `DataSource` abstraction

New file `src/lib/data-source.tsx`:
- `type DataSource = { mode: "auth" | "share"; token?: string; dashboard(): Promise<...>; tasks(): Promise<...>; projects(): Promise<...>; team(): Promise<...>; league(): Promise<...>; references(): Promise<...>; activity(): Promise<...>; }`.
- `authDataSource` implements each method by moving the current `supabase.from(...)` queries out of the page files (unchanged shape).
- `shareDataSource(token)` implements each method by calling `shareApi.data(token, resource)` (already implemented in the edge function).
- `<DataSourceProvider>` + `useDataSource()` hook.

### 2. Extend the `share-access` edge function to full parity

Update `supabase/functions/share-access/index.ts` so each `resource` returns **exactly** the shape the real page needs (raw rows, not a summarised clone):
- `tasks` → `{ tasks, projects, members, comments_count_by_task, files_count_by_task }`
- `projects` → same fields as `loadProjects` plus per-project counts and full member map
- `dashboard` → raw tasks + projects + profiles + activity + sessions (same tables the real dashboard queries)
- `team`, `league`, `references`, `activity` → same raw tables

The auth data source returns the same shapes from Supabase directly.

### 3. Refactor each real page to consume `useDataSource()`

For `index.tsx`, `tasks.tsx`, `projects.tsx`, `team.tsx`, `league.tsx`, `references.tsx`, `activity.tsx`:
- Move data-fetching effect from `supabase.from(...)` to `useDataSource().<resource>()`.
- Keep JSX, layout, filters, view switcher, kanban, table, charts, timelines, cards — untouched.
- Wrap all mutation triggers (New Task, Edit, Archive, Add Reference, Suspend, etc.) and realtime subscriptions in `if (!readOnly)` using a new `useReadOnly()` hook (defaults to `false`).

### 4. New `ReadOnlyContext`

New file `src/lib/read-only.tsx` exporting `<ReadOnlyProvider value>` + `useReadOnly()`. Components hide action buttons/modals when true; `AppShell`'s outer chrome is not used in share mode.

### 5. Replace the share viewer shell

Rewrite `src/routes/share.$token.$page.tsx` so it:
- Resolves the link + password (kept as today).
- Renders the current **share sidebar + top header** (logo, lang toggle, theme toggle, refresh, "Read-only preview" badge, whitelist-driven nav — unchanged visually).
- In the main slot, dynamically renders the real page component from `_authenticated/*` based on `page`, wrapped by:
  ```
  <DataSourceProvider value={shareDataSource(token)}>
    <ReadOnlyProvider value>
      <RealPage />
    </ReadOnlyProvider>
  </DataSourceProvider>
  ```
- Enforces the whitelist by keeping the existing `notAllowed` guard before rendering.
- Deletes the ~800 lines of clone JSX (`DashboardView`, `TasksView`, `ProjectsView`, `TeamView`, `LeagueView`, `ReferencesView`, `ActivityView`) inside this file.

### 6. Auth pages keep working unchanged

`src/routes/_authenticated/route.tsx` wraps its `<Outlet />` in `<DataSourceProvider value={authDataSource}>` + `<ReadOnlyProvider value={false}>`. No visual change; same data.

### 7. Cleanup

- Remove the 60s sessionStorage clone cache in the share viewer; keep only the "Refresh" button (invalidates the data source).
- Keep the `PROJECT_COLORS` / `STATUS_COLORS` / helpers only where they are still used by non-page primitives.

## Technical notes

- No schema changes and no auth changes.
- `useReadOnly` gates: `NewTaskModal`, `TaskDetailModal` write actions, drag-and-drop, archive/unarchive, category creation, sign-out button (kept in share sidebar only for admins? — no, share shell has no sign-out today, keep as-is).
- Realtime `supabase.channel` subscriptions are skipped when `mode === "share"` (share viewer uses the Refresh button).
- The edge function stays public for `resolve` and `data`, still enforces revocation, expiry, password, and whitelist per resource.
- Router still uses the existing `share.$token.tsx` layout + `share.$token.index.tsx` password gate; only the `$page` file changes.

## Files touched

- New: `src/lib/data-source.tsx`, `src/lib/read-only.tsx`.
- Modified: `src/routes/_authenticated/route.tsx`, `index.tsx`, `tasks.tsx`, `projects.tsx`, `team.tsx`, `league.tsx`, `references.tsx`, `activity.tsx` (swap fetch source, gate mutations).
- Rewritten: `src/routes/share.$token.$page.tsx` (shell only, no clones).
- Extended: `supabase/functions/share-access/index.ts` (return raw shapes matching real page needs).
