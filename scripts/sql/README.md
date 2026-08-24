# SQL scripts — self-hosted Supabase

Run these on the self-hosted instance (`https://supabase.mechatro-sy.com` → SQL Editor → paste → Run).
All scripts are idempotent: re-running them is safe.

| Order | File | What it does |
| --- | --- | --- |
| 1 | `2026-08-19-latest.sql` | Base sync of the schema up to 19 Aug |
| 2 | `2026-08-20-drive-oauth-targets.sql` | Google Drive OAuth + backup targets |
| 3 | `2026-08-23-drive-tables-fix.sql` | Drive tables / schema-cache fix |
| 4 | `2026-08-24-business-docs.sql` | Business documents (also included in #5) |
| 5 | **`2026-08-24-selfhost-sync.sql`** | **Latest — run this one** |

## `2026-08-24-selfhost-sync.sql`

Single file that brings the self-hosted database fully up to date:

1. Business documents system (quotation / RFQ / offer / invoice / proforma invoice / purchase order) — tables, RLS (Master Admin only), numbering functions.
2. `user_badges.user_id` and `season_scores.user_id` repointed to `public.profiles` (fixes the foreign-key error when awarding points to a member without an auth account).
3. New points engine: `settle_task_points()`, `award_points_to_user()`, `award_task_points()`, `settle_awards_on_change()` + triggers on `tasks` and `task_point_awards`, with execute limited to `service_role`.
4. Full recalculation: settles every pending award on completed tasks, rebuilds `profiles.total_points` and `season_scores` (including ranks).
5. Drops the retired `share_links` table.
6. Verification queries at the end — sections (a) and (b) must return **0 rows**; (c) lists current balances; (d) must list the 4 business-doc tables.

Everything except the verification queries runs inside a single transaction.
