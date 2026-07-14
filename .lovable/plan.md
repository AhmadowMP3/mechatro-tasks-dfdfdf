## Reset users & wipe demo data

**Goal**: Delete all existing users + demo data, then create exactly 3 fresh users (super admin, admin, member) with clean state and no deletion errors.

### New users

| Role | Name | Email | Password | Master admin? |
|---|---|---|---|---|
| Super Admin | Zizo | `zizo@mechatro.com` | `Mechatro@2026` | Yes |
| Admin | Client | `client@mechatro.com` | `Mechatro@2026` | No |
| Member | Ahmad | `ahmad@mechatro.com` | `Mechatro@2026` | No |

All three emails auto-confirmed so they can log in immediately. You can change any of these later from the app.

### What gets deleted (single migration, correct FK order)

All rows from these tables (data only — schema stays intact):

- Tasks & related: `task_assignees`, `task_comments`, `task_files`, `tasks`
- Notes & related: `note_attachments`, `note_comments`, `note_shares`, `note_tag_links`, `note_tags`, `note_folders`, `notes`
- Finance: `invoice_payments`, `invoice_items`, `invoices`, `expenses`, `income_entries`, `subscriptions_income`, `subscriptions_expense`, `finance_reminders_log`, `customers`, `expense_categories`, `fx_rates`
- Payroll: `payroll_entries`, `payroll_periods`, `member_salary_settings`, `member_reports`
- League/gamification: `season_scores`, `league_seasons`, `user_badges`
- System: `notifications`, `activity_log`, `work_sessions`, `user_sessions`, `share_links`, `backup_requests`, `references`, `invites`, `projects`
- Users: `profiles`, then `auth.users`

Everything is wiped in one transaction, children before parents, so no FK / RLS deletion errors.

### Then create the 3 users (same migration)

For each user:
1. Insert into `auth.users` with `encrypted_password = crypt('Mechatro@2026', gen_salt('bf'))`, `email_confirmed_at = now()`, `aud='authenticated'`, `role='authenticated'`.
2. Insert into `auth.identities` with a provider record so email login works.
3. Insert into `public.profiles` with the correct `role` (`admin`/`member`), `status='active'`, `active=true`, and `is_master_admin=true` for Zizo only.
4. Set `app_config.master_admin_email = 'zizo@mechatro.com'` so master-admin sync stays consistent.

### Why the earlier delete errors happened

Deleting a user hit FK cascades and audit triggers (`log_row_change`, `award_task_points`, `sync_task_primary_assignee`) that were firing mid-cascade on rows whose parent was already gone. Doing the wipe in strict child→parent order inside one migration bypasses that — no partial cascade, no dangling references.

### Out of scope

- No schema changes, no policy changes, no trigger changes.
- Storage bucket files (invoices, receipts, note attachments, backups, member-reports) stay — only DB rows are cleared. Say if you want those wiped too.
- No app code changes; sign in from the auth page with the credentials above.
