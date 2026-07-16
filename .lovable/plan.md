# Fix backup / restore: make it actually restore everything

## Root causes of "restored but nothing came back"

Reading `supabase/functions/backup-snapshot/index.ts` against the current schema (42 public tables), the restore is broken in several ways at once:

1. **Snapshot doesn't capture most of the app.** The hard-coded `TABLES` list has only 16 entries. Missing: `customers, invoices, invoice_items, invoice_payments, expenses, expense_categories, income_entries, subscriptions_income, subscriptions_expense, payroll_periods, payroll_entries, member_salary_settings, financial_settings, fx_rates, finance_reminders_log, notes, note_folders, note_tags, note_tag_links, note_shares, note_comments, note_attachments, task_assignees, task_point_awards, user_sessions`. Those tables are **never snapshotted and never restored** — the file simply doesn't contain them.
2. **Deletes silently fail.** The code does `sb.from(t).delete().neq("id", "00000000-...")` for every table. But `app_config.id` is boolean, and `season_scores`, `task_assignees`, `note_shares`, `note_tag_links`, `member_salary_settings` have **no `id` column at all** (composite PKs). Postgres returns "column does not exist" and the error is discarded (return value never checked). So those tables never get cleared.
3. **FKs from non-listed tables block deletes.** `task_assignees.task_id → tasks.id`, `invoice_items.invoice_id → invoices.id`, `note_shares.note_id → notes.id`, etc. Because those child tables aren't in `TABLES`, they still hold references, and deletion of the parent silently fails.
4. **Triggers corrupt inserts.** `award_task_points`, `sync_task_primary_assignee`, `notify_admins_on_review`, `log_row_change`, `handle_new_user`-adjacent triggers all fire on insert during restore, mutating rows and generating fake notifications/activity log entries that then conflict with the snapshot's own rows.
5. **Not atomic.** Each `sb.from().insert()` is its own request. A half-run restore leaves the DB in a mixed state, and every error is `console.error`d — the function still returns `{ ok: true }`, so the UI shows success while nothing changed.
6. **Errors never surface.** The user has no way to see that N tables failed; the toast says "saved".

The user's report ("I deleted a project and restore did nothing") is exactly what these bugs produce together.

## Fix

### 1. Move the actual restore into a SQL function (atomic, trigger-safe)

New migration adds a `SECURITY DEFINER` function `public.restore_full_snapshot(payload jsonb)`:

- Enforce `private.is_master_admin(auth.uid())` OR called via service role (edge function runs as service role).
- Inside one transaction:
  - `SET LOCAL session_replication_role = 'replica'` — disables triggers and FK checks for the transaction only.
  - Loop over a hard-coded, dependency-ordered `ALL_TABLES` array covering every real public table except `backup_requests` (the control log we want to keep).
  - `EXECUTE format('TRUNCATE %I RESTART IDENTITY CASCADE', t)` once per table (single TRUNCATE call at the end also works — will use one combined statement for speed).
  - For each `t` present as a key in `payload`, insert with `INSERT INTO public.<t> SELECT * FROM jsonb_populate_recordset(null::public.<t>, payload->t)`. Missing keys mean "table wasn't in the snapshot" → leave empty (already truncated).
  - Reset `session_replication_role`.
- Returns `jsonb` like `{ "profiles": 12, "projects": 4, ... }` so the edge function can bubble counts back.
- Grant EXECUTE to `service_role` only (not `authenticated` — client can't call directly).

### 2. Rewrite the restore branches in the edge function

`supabase/functions/backup-snapshot/index.ts`:

- For `{ restore: true, file }`: download the JSON from the `backups` bucket, `JSON.parse` it, then `await sb.rpc('restore_full_snapshot', { payload: snapshot })`. Return the counts.
- For `{ restore_inline: true, payload }`: validate payload is a non-empty object of arrays whose keys are subset of the known table list, then `sb.rpc('restore_full_snapshot', { payload })`.
- If the RPC returns an error, return `{ error }` with status 500 so the UI toasts the real reason.

### 3. Snapshot every table

Replace the current 16-entry `TABLES` array with the full dependency-ordered list (used only for the snapshot loop now — restore uses the SQL function's own list):

```
app_config, financial_settings, profiles, projects, references,
league_seasons, invites, share_links, customers, expense_categories,
fx_rates, invoices, invoice_items, invoice_payments, expenses,
income_entries, subscriptions_income, subscriptions_expense,
payroll_periods, payroll_entries, member_salary_settings,
finance_reminders_log, note_folders, note_tags, notes, note_tag_links,
note_shares, note_comments, note_attachments, tasks, task_assignees,
task_files, task_comments, task_point_awards, work_sessions,
season_scores, user_badges, member_reports, activity_log, notifications,
user_sessions
```

`backup_requests` is intentionally excluded (control log, would break the running restore request).

### 4. Restore uploaded files too

Snapshot already mirrors `invoices / member-reports / expense-receipts / note-attachments` under `backups/snapshot-<stamp>/<bucket>/<path>`. After the DB restore succeeds, the edge function will:

- Derive `stamp` from the backup filename (`backup-<stamp>.json` → `snapshot-<stamp>/`).
- For each mirrored bucket folder, list files recursively, download from `backups`, and upload to the original bucket with `upsert: true`.
- Skip silently if the mirror folder is missing (older backups won't have it).

For inline external restore, if the uploaded JSON has no matching mirror in the `backups` bucket, DB is restored and a toast tells the user files were not restored (external file only contains DB rows).

### 5. Surface real errors in the UI

`src/routes/_authenticated/settings.tsx` — the `RestoreDialog` confirm handler currently ignores response body. Change it to read `data.error` and toast it, and on success show `t("restoreDone")` with the row counts (short "Restored N rows across M tables"). Add EN/AR keys for `restoreDone` and `restorePartial`.

## Files touched

- **New migration** — `public.restore_full_snapshot(payload jsonb)` SECURITY DEFINER + grants.
- `supabase/functions/backup-snapshot/index.ts` — new `TABLES` list, rewrite both restore branches to call the RPC, add post-restore file-mirror copy-back, propagate errors/counts.
- `src/routes/_authenticated/settings.tsx` — `RestoreDialog` reads `data.error`/`data.counts`, toasts real result.
- `src/i18n/dict.ts` — `restoreDone`, `restorePartial`, `restoreFilesRestored`, `restoreFilesSkipped`.

## Out of scope

- Fixing FK cycles or auth.users linkage: profiles snapshot rows correspond to existing `auth.users` because we never delete auth users; snapshot / restore only touches `public.*`.
- Backfilling old snapshot files that were captured with the incomplete TABLES list — those files simply lack the missing tables. Only backups taken **after** this fix will fully restore everything. This will be called out in a toast/note on the backups panel.
