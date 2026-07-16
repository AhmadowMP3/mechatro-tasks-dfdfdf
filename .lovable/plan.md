## Problem

Two gaps in the current backup system:

1. **The 10-day cron doesn't back up anything.** It only inserts a `pending` row in `backup_requests` and notifies master admins. If no admin clicks "Approve" in Settings, nothing is ever backed up.
2. **Backups are DB-only.** The `backup-snapshot` edge function saves JSON of tables, but skips all storage buckets (`invoices`, `member-reports`, `expense-receipts`, `note-attachments`).

Manual "Backup Now" from Settings works — this pass keeps that behavior and fills the gaps.

## Fix

### 1. Full backup includes files (`supabase/functions/backup-snapshot/index.ts`)

- After building the DB JSON snapshot, walk every non-`backups` bucket (`invoices`, `member-reports`, `expense-receipts`, `note-attachments`) and download each file.
- Package everything as one archive per backup:
  - `mechatro-YYYYMMDD-HHmm/data.json` (existing table snapshot)
  - `mechatro-YYYYMMDD-HHmm/files/<bucket>/<path>` (all storage files)
  - Store as a single `.zip` in the `backups` bucket using a lightweight Deno zip lib.
- Retention: keep last **12** archives, delete older.
- Restore stays **data only** (current behavior) — the archive's `data.json` is what gets read; files inside the archive are preserved for cold recovery.

### 2. Auto-approve pending backup requests after 24h

- The cron currently creates a pending request every 10 days. Add a second scheduled sweep (hourly) that finds any `backup_requests` row with `status = 'pending'` and `requested_at < now() - interval '24 hours'`, marks it `auto_approved`, then calls the backup endpoint.
- Master admin can still approve manually before 24h from Settings (unchanged UI path).
- Existing `expired` sweep at 15 days becomes redundant — replaced by the 24h auto-approve.

Implementation shape: convert `backup-snapshot` edge function into a public route or add a new `src/routes/api/public/hooks/backup-auto-approve.ts` that pg_cron calls hourly. It runs the same snapshot logic the manual "Approve" button runs.

### 3. Advance warning to members

- **In-app banner**: when a `backup_requests` row is `pending` or backup is about to run in <1h, show a top-of-app info banner (both Arabic and English via i18n dict) telling members "A full backup is about to run — please save your work."
- **Notification**: when the 10-day cron creates the pending request, also insert a `notifications` row for every active member (not just master admins) with type `backup_incoming`, title "نسخة احتياطية قريباً / Backup coming up", body "Please save your work — full snapshot in 24h."
- New i18n keys: `backupIncomingBanner`, `backupSaveYourWork`, `backupIncomingTitle`.

### 4. Settings page polish (`src/routes/_authenticated/settings.tsx`)

- Show next scheduled backup date (computed from last backup + 10 days).
- Show retention count (12) beside the list.
- Show "auto-approves in Xh" countdown on each pending row so master admins know when it will run itself.
- No layout redesign — same visual style as the rest of the app.

### 5. Cron changes (via `supabase--insert`)

- Keep `mechatro-backup-10d` (creates pending request + member notifications).
- Add `mechatro-backup-auto-approve-hourly` (`0 * * * *`) that calls the new hook to auto-approve any pending request older than 24h.

### Out of scope

- Restoring files (kept data-only per your answer).
- Changing the backups bucket to public (stays private, signed URLs only).
- Redesigning the Settings UI beyond the countdown/next-run additions.

### Technical notes (for internal use)

- Zip in Deno: use `jsr:@zip-js/zip-js` or `https://deno.land/x/zipjs` — streams supported, no native deps.
- Archive filename: `mechatro-YYYYMMDD-HHmm.zip` (single object per backup, easier retention math).
- Auto-approve hook reuses the exact `runSnapshot()` code path — no divergence between manual approve and auto approve.
- Advance-warning notification insert happens inside the existing 10-day cron SQL — one extra `INSERT ... SELECT` targeting all active profiles.
