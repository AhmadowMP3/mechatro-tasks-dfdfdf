
# Mechatro Tasks — Build Plan

Internal tool for one company. Arabic (RTL) default + English (LTR), dark (default) + light, Supabase backend, strict Mechatro brand.

Auth will be added later (per your note). For now the app runs with a **local "current user" switcher** driven by seeded profiles so all role gating, task assignment, and RLS can be developed and demoed. When you're ready, we bolt on Supabase Auth and flip the switch — no page rewrites.

---

## Phase 1 — Foundation

1. **Enable Lovable Cloud** (Supabase-backed).
2. **Design tokens** in `src/styles.css`:
   - Dark tokens: bg `#081320`, card `#0F2031`, surface-2 `#0B1A2A`, surface-3 `#13283D`, border `#1E364D`, border-2 `#274560`, ink `#EAF2F9`, muted `#86A1B7`, red `#F0676A`.
   - Light tokens: bg `#F0F4F8`, card `#FFF`, surface-2 `#F5F7FA`, surface-3 `#ECF1F6`, border `#D7DEE5`, ink `#1A2332`, muted `#5A6B7D`, red `#D9484B`.
   - Brand: `--blue #189FD1` / `--blue-l #42C2EE`, `--orange #E8732E` / `--orange-l #FF9255`, `--green #4E9A33` / `--green-l #73C94E`. Gradients as CSS vars.
   - Body has two fixed radial glows (blue TR, orange BL).
   - Global rules: buttons min-h 52px, radius 13px; icon buttons ≥48×48; cards radius 16px + brand shadow.
3. **Fonts**: Google Fonts `Montserrat` (400–900) + `Almarai` (400/700/800) via `<link>` in `__root.tsx`. Extract your uploaded Montserrat Arabic woff2 into `public/fonts/` with `@font-face` (weights 400/700/800).
4. **i18n**: light custom dictionary (`src/i18n/{ar,en}.ts`) + `useI18n()` hook. `<html dir>` and `lang` toggled at runtime. Zero hardcoded strings. Uses logical CSS properties.
5. **Theme**: `dark`/`light` class on `<html>`, persisted to profile + localStorage.
6. **Layout shell**: sidebar (right in RTL, left in LTR) with logo (extracted from mockup as base64 → saved as PNG asset), current-user card + role badge, nav (Dashboard/Projects/Tasks/Team/League/Notifications/Settings), logout at bottom. Mobile: hamburger drawer + bottom nav. Top bar has AR/EN pill + 🌙/☀️ pill.
7. **Routing** (TanStack file-based): `/`, `/projects`, `/projects/$id`, `/tasks`, `/team`, `/league`, `/notifications`, `/settings`.

## Phase 2 — Database (Supabase, RLS on every table)

Tables exactly per spec: `profiles`, `projects`, `tasks`, `task_files`, `task_comments`, `work_sessions`, `activity_log`, `notifications`. Indexes on `tasks(project_id, assignee_id, status, due_date)`. GRANTs to `authenticated` and `service_role`.

Role enum: `admin | manager | member | viewer` stored in `profiles.role` (single-role internal tool — a separate `user_roles` table is overkill here; we still enforce via a SECURITY DEFINER `has_role(uid, role)` helper to keep RLS non-recursive).

RLS policy shape:
- Read: any authenticated user (viewer+).
- Write projects/tasks: `has_role('admin')` OR `has_role('manager')`.
- Task self-edit (status/progress/timer/comments/files): assignee-only fields, enforced via policies + a `tasks_self_update` policy scoped by column set.
- Admin-only: `profiles` role changes, backups.

Seed data: one admin ("Admin ميكاترو"), one manager, one member, one viewer, 2 sample projects, ~6 tasks.

## Phase 3 — Pages

**Dashboard** — greeting, 4 stat cards (active / done this week / overdue in red / active projects), donut (task status distribution) via Recharts using brand colors, overdue-tasks red alert list, recent activity feed (relative timestamps, bilingual).

**Projects** — grid of cards: name, color bar, computed progress % (done ÷ total), status counts, due date, member avatars. "New Project" (manager+). Archive toggle + "show archived". Detail page: header + tasks list + "Add task here".

**Tasks** — filter bar (project / assignee / status / priority / overdue) + search. Cards with title, project chip, avatar, priority pill, status pill, progress bar, due date (red if overdue). **Task detail modal** (role-aware): editable fields, status buttons, progress slider, Start Work ▶ / Pause Work ⏸ writing `work_sessions` (live counter + total logged), comments thread, Google Drive links section (validate URL, render card with type icon + Open), WhatsApp + Telegram share buttons opening `https://wa.me/?text=...` and `https://t.me/share/url?...` with prefilled bilingual message.

Pill tints exactly per spec (`rgba(24,159,209,.18)` etc., light-mode equivalents).

**Team** — member cards (avatar, name, role badge — admin=orange, manager=blue, member=green, viewer=gray, job title, open/done counts, total hours). Admin: add/edit/deactivate + role change. Per-member "Record" view: completed history, hours logged, on-time %.

**League** — monthly leaderboard, scoring: on-time=10, late=4, high-prio bonus +5, hour=1. Podium for top 3 (gold/silver/bronze accents on brand style), month selector, current user's row highlighted. Computed via SQL view.

**Notifications** — bell w/ unread badge; page list. Triggers implemented via DB triggers + a scheduled edge fn for overdue: task assigned to you, status change on your task, new comment, became overdue (daily), project completed. Mark read / mark all read.

**Settings (admin)** — company info, user management, defaults (language/theme), Backups panel.

## Phase 4 — Backups

Supabase Edge Function `backup-snapshot`:
- Scheduled by `pg_cron` every 10 days.
- Exports every table to a single timestamped JSON, uploads to private bucket `backups/`.
- Deletes snapshots beyond the most recent 12.
Settings → Backups (admin): list snapshots (name, date, size), "Backup now", download signed URL, restore with double-confirmation (types "RESTORE" to confirm) — restore is a second edge fn that truncates + reinserts.

## Phase 5 — QA pass

Automated checklist we'll verify before wrapping:
1. Toggle AR↔EN on every screen — no untranslated string, no broken layout.
2. Toggle dark↔light — every color from tokens.
3. Switch through all 4 role personas — allowed actions match spec; RLS blocks disallowed writes.
4. Mobile viewport — all buttons stay ≥52px, touch targets ≥48px.
5. Overdue tasks render red on Dashboard, Projects, Tasks list, Task modal.

---

## Technical Notes

- Stack: TanStack Start + React 19, Tailwind v4 (tokens in `src/styles.css`), shadcn/ui, Recharts, Supabase.
- All server reads via server functions (`requireSupabaseAuth` when auth ships; publishable-key server client during pre-auth phase).
- Timer: client-side interval + persisted `work_sessions` row (started_at when ▶, ended_at + duration_minutes when ⏸).
- Google Drive link validation: regex `^https?://(drive|docs)\.google\.com/…` + type inference from URL segment (`/document/`, `/spreadsheets/`, `/presentation/`, `/file/`).
- Logo: extracted base64 → committed as `src/assets/mechatro-logo.png`.
- Role UI gating via `useRole()` hook returning capability flags — never trust the client alone; RLS is the source of truth.

## Open items (I'll assume these unless you say otherwise)

- Company name/phone/address for Settings → left blank, editable by admin.
- League scoring window = calendar month in the user's local time.
- Notifications: in-app only for now (no email/push).
- Currency/locale for dates: Arabic-Indic digits in AR, Latin digits in EN.
