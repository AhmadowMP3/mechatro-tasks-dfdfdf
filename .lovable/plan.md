
## Problem

The public share link (`/share/{token}/{page}`) renders a hand-coded, simplified UI (4 KPI cards + a flat "task distribution" list) that looks nothing like the real Dashboard, Tasks, Projects, Team, League, References, or Activity pages inside the app. Same for the other views — each is a minimal placeholder, not a read-only mirror of the real page.

Root cause: `src/routes/share.$token.$page.tsx` defines its own tiny `DashboardView`, `TasksView`, etc., and the `share-access` Edge Function only returns the bare minimum data these placeholders need. None of the real dashboard visuals (Task Flow infographic, live clock, trend chart, Team Pulse, filters), the real Kanban columns (with assignees, elapsed timeline, priority pills, tag chips), or the real Projects/Team/League/References/Activity layouts are reused.

## Fix — bring the shared view to parity with the real app

### 1. Expand `share-access` Edge Function payloads

Enrich each `page` payload with everything the corresponding real page renders (all read-only, PII-safe — no emails/phones):

- **dashboard** — KPIs, distribution, 14-day trend series, per-project progress, team pulse (member → open/done counts), recent activity feed
- **projects** — projects + task counts per project + progress + members preview
- **tasks** — tasks with joined assignee names/avatars, project name+color, tags, start_date, due_date, elapsed timeline data
- **team** — members with role, avatar, task load, completion rate, league points
- **league** — full leaderboard with points breakdown and rank movement
- **references** — categories + items with icons/branding
- **activity** — logs with resolved actor names and entity labels

### 2. Rebuild the share page views to match the real pages 1:1

Rewrite the views inside `src/routes/share.$token.$page.tsx` (or split into `src/components/share/*`) so each mirrors its real counterpart visually:

- **DashboardView** — same KPI card style, Task Flow infographic, live clock, 14-day trend line/area chart, per-project progress bars, Team Pulse cards, Recent Activity list, filter bar (read-only)
- **TasksView** — real Kanban board with 5 columns (todo / in_progress / paused / in_review / done), branded task cards (priority pill, assignee avatar, project chip, tag chips, elapsed timeline bar, due date). Include the ViewSwitcher chip (Kanban / Table) — both read-only, no drag, no edit
- **ProjectsView** — same card grid used on `/projects`, with progress ring, member avatars, status pill, creation date, "Active / Archived" toggle
- **TeamView** — same member cards with avatar, role pill, task load bar, completion %, league points, "no PDF button" (admin-only)
- **LeagueView** — podium (1st/2nd/3rd) + full leaderboard table matching the real page
- **ReferencesView** — Bento grid with branded icons and category chips
- **ActivityView** — same timeline layout with actor avatar + entity chip + timestamp

### 3. Reuse tokens, fonts, gradients, and RTL/theme behavior

Keep the existing shell (branded sidebar, read-only chip, AR/EN + Dark/Light toggles). All views must respect the current `theme` and `lang` state and use the same CSS variables (`--grad-blue`, `--grad-gold`, `--surface-2`, `--border`, etc.) so the shared preview looks identical to the app.

### 4. Add a "Refresh" control on the shared header

Small refresh button that re-fetches the current page payload (the user asked earlier for a way to pull the latest state on shared pages).

## Technical notes

- Data still flows through the `share-access` Edge Function with the token in the header (no Supabase session on the client). RLS is untouched.
- Keep the sanitizer strict: never return `email`, `phone`, invite tokens, or password hashes.
- Cache each page's payload in `sessionStorage` keyed by `share:{token}:{page}` for 60s to keep navigation snappy.
- All interactive affordances (add/edit/drag/delete) stay disabled — read-only enforcement remains via the existing `ShareContext` shell.

## Deliverable

Opening `/share/{token}/dashboard` (and every other allowed page) looks like the real internal page, not a stripped-down placeholder. All whitelisted pages render at parity with what an authenticated user sees, minus any edit controls.
