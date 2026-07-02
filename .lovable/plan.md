## Activity Log (Admin Only)

Build a dedicated **Activity Log** page that shows every action performed in the app, admin-only, with rich filters. Also fix the current silent-fail: `logActivity()` inserts are blocked by RLS because there's no INSERT policy — so nothing has been logging since the security lockdown.

### 1. Database migration

- Replace `activity_log` policies:
  - **SELECT**: admins only (`has_role(auth.uid(), 'admin')` or `is_master_admin`).
  - **INSERT**: any authenticated user, with `actor_id = auth.uid()` (or null) — so client-side `logActivity()` calls succeed.
  - No UPDATE/DELETE (immutable log; service_role bypasses for pruning if ever needed).
- Add indexes: `(actor_id)`, `(entity_type, entity_id)` for filter performance.

### 2. Standardize logging

- Audit existing `logActivity` call sites (dashboard, projects, NewTaskModal, TaskDetailModal, KanbanView) and normalize `action` values to a small vocabulary: `created`, `updated`, `status_changed`, `deleted`, `archived`, `commented`, `file_added`, `assigned`, `signed_in`.
- Add logging to sites currently missing it: task edits, task delete, project edit/archive, comment add, file add, user invite/role change (via admin edge functions — service_role writes).
- Add `signed_in` log on successful auth in `app-context`.

### 3. Activity Log page — `/activity` (admin only)

Route file `src/routes/_authenticated/activity.tsx`, gated with a `beforeLoad` that redirects non-admins to `/`.

**Layout:**
```text
┌ Filters bar ─────────────────────────────────────────┐
│ [Search]  [User ▾] [Action ▾] [Entity ▾] [Date range]│
│                                       [Reset] [Export]│
├──────────────────────────────────────────────────────┤
│ Timeline grouped by day                              │
│  ── Today ──                                         │
│   ● 14:32  Ahmed  created task  "Fix pump"           │
│   ● 14:20  Sara   status → done  "Weld frame"        │
│  ── Yesterday ──                                     │
│   ...                                                │
│                              [Load more]             │
└──────────────────────────────────────────────────────┘
```

**Filters** (all combinable, URL-synced via search params so filtered views are shareable):
- Free-text search over action + entity_id + meta.
- User (multi-select of profiles).
- Action type (multi-select from vocabulary).
- Entity type (task / project / profile / role / comment / file / session / auth).
- Date range (last 24h / 7d / 30d / custom).

**Row rendering:**
- Avatar + name of actor, colored action pill, human sentence ("changed status of *Fix pump* from *todo* to *in_progress*"), relative time + absolute tooltip.
- Click a row → deep link to the related entity (task modal, project page, user in Access Control).
- Icon per action (created=plus, updated=pencil, deleted=trash, status_changed=arrow, commented=bubble, file_added=paperclip, assigned=user, signed_in=login).

**Extras:**
- Sticky day headers.
- Infinite scroll (page size 50) using keyset pagination on `created_at`.
- **Export CSV** button — downloads currently filtered rows.
- Empty state illustration + "No activity matches these filters".
- Fully bilingual (AR/EN) with RTL mirroring; add i18n keys.

### 4. Navigation & discoverability

- Add sidebar entry **Activity Log** (scroll-text icon), visible only when `is_master_admin || has_role('admin')`.
- On the dashboard's "Recent activity" card, add a "View all →" link to `/activity` for admins.

### 5. Verification

- Typecheck.
- Playwright: sign in as master admin, open `/activity`, apply a filter, verify rows.
- Confirm a fresh action (create a task) appears in the log within seconds.

### Technical notes

- Query shape: single `.select("*, actor:profiles!actor_id(full_name, avatar_url)")` with `.order("created_at", { ascending: false }).range(...)`.
- Entity name resolution: batch-fetch task/project titles for the currently displayed page (Map keyed by `entity_id`) — avoids N+1.
- Search params validated with zod + `fallback()`.
- Non-admin hitting `/activity` directly → `redirect({ to: "/" })` in `beforeLoad`.
