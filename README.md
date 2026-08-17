# Mechatro Flow

# Mechatro Tasks — MASTER PROMPT for Lovable (paste as one message)

Build a complete internal project & task management web app for one company called **Mechatro** — app name "Mechatro Tasks" / "مهام ميكاترو". Fully bilingual Arabic (RTL, default) + English (LTR), dark mode (default) + light mode. Backend: **Supabase** (database, auth, storage, edge functions). This is an internal tool for one company, not multi-tenant.

---

## 1. BRAND IDENTITY (strict — never deviate)

### Colors (define as CSS variables / design tokens)
- **Primary blue:** `#189FD1`, light variant `#42C2EE`, gradient `linear-gradient(135deg,#189FD1,#39C0EC)` → primary buttons, active nav, links, selected states
- **Accent orange:** `#E8732E`, light `#FF9255`, gradient `linear-gradient(135deg,#E8732E,#FF9C5A)` → high priority, alerts, important stats, secondary CTA
- **Success green:** `#4E9A33`, light `#73C94E`, gradient `linear-gradient(135deg,#3F782A,#67BD42)` → completed tasks, positive progress, WhatsApp button
- **Destructive/overdue red:** `#F0676A` (dark mode) / `#D9484B` (light mode)
- **Dark mode:** background `#081320`, card `#0F2031`, surface-2 `#0B1A2A`, surface-3 `#13283D`, border `#1E364D`, border-2 `#274560`, text `#EAF2F9`, muted `#86A1B7`. Body background has two subtle fixed radial glows: blue `rgba(24,159,209,.13)` top-right and orange `rgba(232,115,46,.10)` bottom-left.
- **Light mode:** background `#F0F4F8`, card `#FFFFFF`, surface-2 `#F5F7FA`, surface-3 `#ECF1F6`, border `#D7DEE5`, text `#1A2332`, muted `#5A6B7D`, shadow `0 2px 12px rgba(0,0,0,.08)`.
- Color usage ratio: ~60% dark surfaces, 25% blue, 10% orange, 5% green. Never mix more than two gradients on one screen. Never put orange text on green or vice versa.

### Typography
- Font stack everywhere: `'Montserrat','Montserrat Arabic','Almarai',sans-serif`.
- Load **Montserrat** (weights 400,500,600,700,800,900) and **Almarai** (400,700,800) from Google Fonts. I will upload licensed **Montserrat Arabic** woff2 files — create `@font-face` for weights 400, 700, 800.
- Headings: 800–900 weight (H1 28px, H2 22px, H3 17px). Body: 400–500, 15px. Secondary/labels: 500, 13px. Big stat numbers: 800, 26px in brand colors.

### Accessibility rules (mandatory across ENTIRE app)
- All buttons: **min-height 52px**, font-size 16px, weight 700, border-radius 13px, padding 14px 28px.
- Every clickable element (icon buttons, rows, toggles, pills) minimum **48×48px** touch target.
- Cards: border-radius 16px, subtle shadow `0 6px 20px rgba(0,0,0,.38)` (dark mode).
- Large, readable, simple UI — built for non-technical users. High contrast (WCAG AA minimum) in both themes.

### Logo
I will upload the Mechatro logo (transparent PNG, blue/orange/green gear + wordmark). Sidebar: 188px wide with `drop-shadow(0 2px 8px rgba(0,0,0,.4))`. Mobile topbar: 30px height. Never recolor or distort it.

---

## 2. INTERNATIONALIZATION & THEMING
- Full i18n via translation dictionary — zero hardcoded strings. Arabic default with `dir="rtl"`; English switches whole app to `dir="ltr"`. Every label, button, toast, error, empty state, date format, and notification is translated.
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`, etc.) so RTL/LTR never breaks.
- Language toggle (عربي/English) + theme toggle (🌙/☀️) as pill buttons in the top bar. Persist both per user in their profile.
- Empty states are invitations to act ("No projects yet — create your first project"), errors explain what to do, buttons say exactly what they do ("Save changes", not "Submit").

---

## 3. AUTH & ROLES (Supabase)
- Email + password auth. **No public signup** — Admin creates/invites users. Seed one admin account for me.
- `profiles` table with role: **admin / manager / member / viewer**:
  - **Admin:** everything + user management + settings + backups
  - **Manager:** full CRUD on projects & tasks, assign tasks, manage team tasks
  - **Member:** view all; edit only tasks assigned to them (status, progress, work timer, comments, file links)
  - **Viewer:** read-only everywhere
- Enforce with **Row Level Security on every table** AND hide/disable UI actions by role.

---

## 4. DATABASE SCHEMA (Supabase, all with RLS + indexes)
- `profiles`: id (auth uid), full_name, avatar_url, role, phone, job_title, active, language_pref, theme_pref, created_at
- `projects`: id, name_ar, name_en, description, color (brand color), status (active/on_hold/done), start_date, due_date, archived bool, created_by, created_at
- `tasks`: id, project_id FK, title, description, assignee_id FK, priority (low/normal/high/urgent), status (todo/in_progress/paused/done), progress 0–100, due_date, completed_at, created_by, created_at, updated_at
- `task_files`: id, task_id, file_name, drive_url, file_type, added_by, created_at — **no file uploads to the app; users paste Google Drive share links only.** Validate URL, render a card with type icon + open button.
- `task_comments`: id, task_id, author_id, body, created_at
- `work_sessions`: id, task_id, user_id, started_at, ended_at, duration_minutes
- `activity_log`: id, actor_id, action, entity_type, entity_id, meta jsonb, created_at — log every create/update/delete/status change
- `notifications`: id, user_id, type, title_ar, title_en, body, entity_id, read bool, created_at

Indexes on tasks(project_id, assignee_id, status, due_date).

---

## 5. LAYOUT & NAVIGATION
- Sidebar on the **right in RTL** (left in LTR): logo, current-user card with role badge (admin=orange, manager=blue, member=green, viewer=gray), nav: Dashboard, Projects, Tasks, Team, League, Notifications, Settings; logout at bottom.
- Mobile: hamburger collapsible sidebar + bottom navigation bar. Fully responsive.

---

## 6. PAGES & FEATURES

### Dashboard
Greeting with user name; 4 stat cards (active tasks, completed this week, overdue in red, active projects) with big 800-weight numbers; donut chart "Task Distribution" by status in brand colors; "Overdue Tasks" red-headed alert section; "Recent Activity" feed from activity_log with relative timestamps.

### Projects
Grid of project cards: name, color bar, computed progress %, task counts per status, due date, member avatars. New Project (manager+). Archive/unarchive + "show archived" toggle. Project detail view: header + its tasks + "add task here" button.

### Tasks
Filterable list (project, assignee, status, priority, overdue) + text search. Cards: title, project chip, assignee avatar, priority pill, status pill, progress bar, due date with red overdue highlight.
**Task detail modal:** editable per role; status buttons; progress slider; **Start Work ▶ (green) / Pause Work ⏸ (red)** timer writing to work_sessions with total logged time shown; comments thread; Google Drive links section (add/delete); **WhatsApp + Telegram share buttons** opening a prefilled message (task title, project, assignee, due date, status) in the current language.
**Pill colors:** in_progress blue tint `rgba(24,159,209,.18)`/text `#42C2EE`; done green tint; high/urgent orange tint; overdue red tint (equivalent tints on white in light mode).

### Team
Member cards: avatar, name, role badge, job title, open/done task counts, total logged hours. Admin adds/edits/deactivates members and changes roles. "Record" button per member → performance view: completed history, hours logged, on-time percentage.

### League (gamification)
Monthly leaderboard: on-time task = 10 pts, late completion = 4, high-priority bonus = +5, each logged hour = 1. Podium for top 3 (gold/silver/bronze accents on brand style), month selector, current user's row highlighted.

### Notifications
Bell with unread badge + page. Triggers: task assigned to you, status change on your task, new comment, task became overdue (daily check), project completed. Mark read / mark all read.

### Settings (admin)
Company info, user management, defaults (language/theme), and **Backups** section.

---

## 7. BACKUP SYSTEM
Supabase Edge Function scheduled with pg_cron to run **every 10 days**: export all tables as a timestamped JSON snapshot into private storage bucket `backups/`. Keep last 12 snapshots, delete older. Settings → Backups (admin only): list snapshots with date & size, "Backup now" button, download, and a restore flow with double-confirmation warning that it overwrites current data.

---

## 8. FORMS & QUALITY BAR
- All forms as modals with large inputs (min-height 48px) and clear bilingual validation.
- Every action gives feedback (toast) using the same verb as the button ("Publish" → "Published").
- Must pass: (1) AR↔EN switch on every screen with no broken layout or untranslated string; (2) dark↔light with all colors from tokens; (3) each of the 4 roles sees only allowed actions AND is blocked by RLS; (4) mobile with buttons still ≥52px; (5) overdue tasks red everywhere they appear.

Start by building the foundation (shell, auth, theming, i18n), then the database, then the pages in the order listed.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mechatro-tasks.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/70935899-f801-4b02-9f3a-e174fc26093c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
