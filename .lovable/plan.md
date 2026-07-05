## Goal
Every 10 days the system asks a master admin to approve a backup. Nothing is written to storage until an admin clicks **Approve**. Manual "Backup now" keeps working.

## Findings from current setup

**Edge function** `supabase/functions/backup-snapshot/index.ts`
- Master-admin JWT OR `x-backup-cron-secret` header required.
- Snapshots only 8 tables: `profiles, projects, tasks, task_files, task_comments, work_sessions, activity_log, notifications`.
- Missing from snapshot: `invites, league_seasons, season_scores, member_reports, references, share_links, user_badges, app_config`.
- Retains last 12 files in the `backups` bucket.
- Restore truncates + reinserts in FK-safe order.

**Cron job** (`cron.job`, id 1, `mechatro-backup-10d`, `0 3 */10 * *`)
- Posts to the edge function with NO `Authorization` header and NO `x-backup-cron-secret` header → every scheduled run currently 401s and no backup is saved. Confirmed silent failure.

**UI** `src/routes/_authenticated/settings.tsx` `BackupsSection`
- Lists files in `backups` bucket, Backup now, Download, Restore (typed "RESTORE" confirm). No approval flow.

## Design — approval-gated scheduled backup

### 1. New table `public.backup_requests` (migration)
Columns: `id uuid pk`, `status` enum `pending|approved|rejected|completed|failed|expired` default `pending`, `requested_at`, `requested_by uuid null` (null = system/cron), `decided_by uuid null`, `decided_at timestamptz null`, `result_file text null`, `error text null`, `created_at`, `updated_at`.

GRANT SELECT/UPDATE to `authenticated`, ALL to `service_role`. Enable RLS.
Policies (master admins only, via existing `private.is_admin`/`is_master_admin` check pattern):
- SELECT: master admin can read all rows.
- UPDATE: master admin only (used by Approve/Reject to change status → approved/rejected).
- INSERT/DELETE: none from client — inserts come from cron (service role) and manual admin action goes through the edge function.
`updated_at` trigger with `public.set_updated_at`.

### 2. Cron rewrite (via `supabase--insert`, not migration)
Unschedule `mechatro-backup-10d`. Reschedule to run every 10 days at 03:00 UTC:
```sql
INSERT INTO public.backup_requests (status) VALUES ('pending');
INSERT INTO public.notifications (user_id, type, title_ar, title_en, body)
SELECT id, 'backup_request',
       'طلب نسخة احتياطية بانتظار موافقتك',
       'Backup request awaiting your approval',
       'Scheduled every 10 days'
  FROM public.profiles WHERE is_master_admin = true;
```
No `pg_net`, no edge function call from cron — approval flow does the actual snapshot.

Also auto-expire: before inserting a new pending, `UPDATE backup_requests SET status='expired' WHERE status='pending' AND requested_at < now() - interval '15 days'`.

### 3. Edge function updates (`backup-snapshot/index.ts`)
- Extend `TABLES` to include `app_config, invites, league_seasons, season_scores, member_reports, references, share_links, user_badges` (FK-safe order: keep `profiles` first for insert, reverse for delete).
- New request body variants:
  - `{ approve_request_id }` — verify caller is master admin, load the row, must be `pending`; run snapshot; on success set row to `completed` + `result_file`; on error set to `failed` + `error`.
  - `{ reject_request_id }` — verify master admin; set status to `rejected` + `decided_by/at`.
- Existing `{ manual: true }` and `{ restore, file }` paths unchanged.
- Remove cron-secret path — cron no longer calls this function directly (kept simpler and closes an unused auth surface).

### 4. UI changes — `src/routes/_authenticated/settings.tsx` `BackupsSection`
Add a "Pending backup requests" card above the existing file list (only shown to master admin):
- Query `backup_requests` where `status='pending'` ordered by `requested_at desc`.
- Each row shows requested_at, source (system/manual by X), and two buttons: **Approve & run** (calls edge fn with `approve_request_id`) and **Reject** (calls edge fn with `reject_request_id`).
- After approve completes, toast success and refetch both queries.
- Non-master admins keep the current file-listing view but hide the pending-requests card.

Also update the "Backup now" button: instead of immediately snapshotting, it can either (a) run immediately as today (master-admin manual override), or (b) create a pending request. Default keeps today's immediate behavior since the user only asked for the *scheduled* one to require approval.

### 5. i18n additions in `src/i18n/dict.ts`
`pendingBackupRequests`, `approveAndRun`, `reject`, `backupRequestedAt`, `bySystem`, `bySelf`, `noPendingBackups`, `backupApproved`, `backupRejected` (ar + en).

## Verification
- `cron.job` shows the new schedule with the SQL-only body (no HTTP call).
- Manually insert a pending row → master admin sees it in Settings, notification arrives.
- Click Approve → row transitions to `completed`, new file appears in bucket, tables now include the full 16-table set.
- Click Reject → row transitions to `rejected`.
- Non-master-admin cannot see pending card and cannot mutate requests (RLS + edge function checks).

## Out of scope
- Email notifications (in-app notification only).
- Restoring individual tables.
- Backup encryption / off-site storage.
- Retention policy change (still keep 12 most recent files).