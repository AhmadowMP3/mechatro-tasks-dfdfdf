# Shareable Access Links (Master Admin)

A new master-admin page to generate **public read-only links**. Recipients open the link (no account), optionally enter a password, and get a stripped-down version of the app that shows ONLY the pages the master admin whitelisted. All actions (create/edit/delete/comment/status change) are disabled everywhere. Non-whitelisted pages are hidden from the sidebar and blocked at the URL level.

## What the master admin gets

New sidebar item (master-admin only): **Share Links / روابط المشاركة**

Per-link controls:
- **Label** (internal note, e.g. "Client XYZ preview")
- **Allowed pages** — checklist: Dashboard, Projects, Tasks, Team, League, References, Activity Log
- **Expiry date/time** (optional)
- **Max uses** (optional; counter increments on each successful unlock)
- **Password** (optional; hashed server-side)
- **Revoke toggle** (instant kill switch)
- **Edit** button on each link row to update any of the above after creation (whitelist, expiry, max uses, password, label, revoke) — changes apply live to anyone using the link
- Copy-to-clipboard button, view counter, last-used timestamp

## What the recipient sees

- Opens `/share/<token>` → password prompt if set → lands on the first allowed page
- Top banner: "Read-only preview — Mechatro" with expiry countdown
- Sidebar contains ONLY the whitelisted pages (in the app's normal branded shell, dark mode default, AR/EN toggle available)
- Every mutation control (buttons, modals, drag handles, inputs) is hidden or disabled
- Direct URL to a non-whitelisted page → "Access restricted" screen
- If revoked / expired / max uses hit → branded "Link no longer active" screen

## Technical section

### Database (one migration)

New table `public.share_links`:
- `id uuid pk`, `token text unique` (URL-safe random), `label text`
- `allowed_pages text[]` (enum-checked in app)
- `expires_at timestamptz null`, `max_uses int null`, `use_count int default 0`
- `password_hash text null` (bcrypt via pgcrypto `crypt()`)
- `revoked bool default false`
- `created_by uuid → profiles.id`, `created_at`, `updated_at`, `last_used_at`

RLS:
- SELECT/INSERT/UPDATE/DELETE restricted to master admin (`is_master_admin(auth.uid())`)
- NO anon policy — public access goes through server functions using `supabaseAdmin`

Grants: `authenticated` (master admin scoped by RLS), `service_role`.

Activity log trigger on this table (create/update/revoke).

### Server functions (`src/lib/share.functions.ts`)

Public (no auth) — use `supabaseAdmin` inside handler:
- `resolveShareLink({ token, password? })` → validates token, checks revoked/expired/max_uses, verifies password with `crypt()`, increments `use_count`, updates `last_used_at`, returns `{ allowed_pages, label, expires_at }`
- `getShareData({ token, resource })` — read-only fetch for dashboard KPIs, projects list, tasks, team, league, references, activity. Server enforces `resource ∈ allowed_pages` for that token; returns sanitized DTOs (no emails, no invite tokens, no suspension reasons).

Master-admin only (with `requireSupabaseAuth` + `is_master_admin` check):
- `createShareLink`, `updateShareLink`, `deleteShareLink`, `listShareLinks`

### Routes

- `src/routes/_authenticated/share-links.tsx` — master-admin management page (list, create modal, edit drawer, copy, revoke)
- `src/routes/share/$token.tsx` — public entry; handles password prompt, stores unlocked token in `sessionStorage`, redirects to first allowed page under `/share/$token/...`
- `src/routes/share/$token/route.tsx` — layout wrapping a `ShareShell` (branded sidebar with only allowed pages, read-only banner, AR/EN + theme toggles, no auth calls)
- Child routes under it: `dashboard.tsx`, `projects.tsx`, `tasks.tsx`, `team.tsx`, `league.tsx`, `references.tsx`, `activity.tsx` — each reuses existing presentational components in a **read-only mode**, fed by `getShareData`
- Any child route whose path isn't in `allowed_pages` → `AccessRestricted` component

### Read-only enforcement

- New `ShareContext` provides `{ readOnly: true, allowedPages }`
- Existing pages already have their write UI in modals/buttons — extract shared presentational parts (KanbanColumn, TaskCard, ProjectCard, etc.) and pass `readOnly` to hide action buttons, disable drag-and-drop, hide "New" buttons
- No `AppProvider` / Supabase user session on `/share/*` routes — completely detached from auth

### Sidebar entry

Add "Share Links / روابط المشاركة" to `Sidebar.tsx`, visible only when `profile.is_master_admin === true`.

### Security notes

- Tokens: 32-byte URL-safe random, never logged
- Passwords hashed with `crypt(pw, gen_salt('bf'))`, verified server-side only
- All public server functions rate-limited by IP via a lightweight in-memory + `share_link_attempts` insert (optional, can be added later)
- `getShareData` only returns fields safe for external viewers (no PII beyond names shown on team page, which you already display)

### Out of scope (confirm if you want them)

- Analytics per link beyond `use_count` / `last_used_at`
- Downloading PDFs from the share view
- Comments/reactions from public viewers
