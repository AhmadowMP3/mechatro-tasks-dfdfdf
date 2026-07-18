## Access Matrix — final

| Area | Member | Admin | Master |
|---|---|---|---|
| Dashboard `/` | ✓ (own stats) | ✓ | ✓ |
| Tasks `/tasks` | ✓ only tasks where they are assignee/co-assignee | ✓ | ✓ |
| Projects `/projects`, `/projects/:id` | ✓ only projects containing a task assigned to them | ✓ | ✓ |
| References | ✓ | ✓ | ✓ |
| League | ✓ | ✓ | ✓ |
| Notes | ✓ full (own + shared) | ✓ | ✓ |
| Notifications | ✓ | ✓ | ✓ |
| Settings | ✓ | ✓ | ✓ |
| Team `/team`, `/team/:id` | ✗ hidden + route blocked | ✓ | ✓ |
| Activity log, Reports, Report history | ✗ | ✓ | ✓ |
| Access Control (People & Invites) | ✗ | ✓ | ✓ |
| Share Links | ✗ | ✗ | ✓ (master only) |
| Finance (all tabs) | ✗ | ✗ | ✓ (master only) |

## Changes

### 1. Sidebar (`src/components/layout/Sidebar.tsx`)
- Move **Notes** out of `adminSection` into a new `workSection` (or `personalSection`) so members see it.
- Remove **Team** and **League** from the shared `teamSection` split: keep **League** for everyone, gate **Team** to admins only. Simplest: split `teamSection` — League stays public, Team goes into `adminSection`.
- Change `financeSection` gate from `financeOnly` (isFinanceAdmin) to `masterOnly` (isMasterAdmin).

### 2. Role helper (`src/lib/app-context.tsx`)
- Redefine `isFinanceAdmin` = `isMasterAdmin` only (drops the `is_finance_admin` grant path and the "admins get finance" path). This makes every existing `if (isFinanceAdmin)` guard automatically strict-master.

### 3. Route guards (client-side redirect for anyone typing the URL)
Add a `beforeLoad` check that redirects to `/` when the user lacks access:
- `team.index.tsx`, `team.$id.tsx` → admin only
- `activity.tsx`, `reports.tsx`, `reports-history.tsx`, `reports-history_.compare.tsx` → admin only
- `access-control.tsx` → admin only
- `share-links.tsx` → master only
- `finance.tsx` (parent layout) → master only — one guard covers all finance sub-routes

### 4. Projects list scoping (`src/routes/_authenticated/projects.index.tsx`)
Currently members see every project. Filter enriched list for non-admins to only projects where `memberIds.includes(user.id)` OR they have a task in `task_assignees`. Fetch member's task project_ids (primary + co-assignee) like `tasks.tsx` already does, then filter projects.

### 5. Project detail (`projects.$id.tsx`)
If member and no task assigned to them in that project → redirect to `/projects`. Prevents URL-guessing into unrelated projects.

### 6. Verify — no DB changes
Server-side RLS already restricts writes/reads appropriately (checked: tasks use assignee scoping, projects have policies). This pass is UI + client route gating only — matches the "UI change stays in frontend" rule. If a spot-check reveals a policy gap, I'll flag it separately rather than expanding scope.

### 7. Sanity pass
- Grep every `isFinanceAdmin` call site to confirm the tightened definition doesn't break a legitimate admin-only-not-master flow.
- Typecheck.

## Out of scope
- No password/user changes.
- No DB migrations (RLS already enforces server-side).
- No removal of `is_finance_admin` column — just stop honoring it in the UI (safe rollback path).
