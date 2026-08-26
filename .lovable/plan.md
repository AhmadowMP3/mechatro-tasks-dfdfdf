# Fix: Leaderboard empty on dashboard.mechatro-sy.com

## What's happening

The Leaderboard page reads the whole team through a database function called `leaderboard()`. That function was created on the Lovable-managed database, but the live site at `dashboard.mechatro-sy.com` runs on your self-hosted server — and no SQL script for that function was ever added to `scripts/sql/`, so it was never applied there.

The app calls the function, the server answers "function does not exist", and the code silently turns that error into an empty list. Result: a trophy icon and a dash, even though points and profiles are full.

## The fix

1. Add `scripts/sql/2026-08-26-leaderboard-function.sql` containing the security-definer `public.leaderboard()` function plus its `GRANT EXECUTE TO authenticated`, so it can be applied on the self-hosted SQL editor. Written to be safe to re-run.
2. Stop swallowing the error in `src/lib/leaderboard.ts`: on RPC failure, log the error and fall back to a direct `profiles` read so the board still shows something instead of nothing.
3. Show a real message in the empty state on the Leaderboard page (and the dashboard podium card) instead of the bare dash, so a future failure is visible rather than silent.

## Your one manual step

Run `scripts/sql/2026-08-26-leaderboard-function.sql` in your self-hosted Supabase SQL editor. After that the board fills in immediately — no redeploy needed.

## Technical notes

- Function returns only safe fields: `id, full_name, avatar_url, job_title, total_points, current_streak, longest_streak` for active profiles, ordered by points.
- `SECURITY DEFINER` with `set search_path = public`; execute granted to `authenticated` only, so members can see the full board without loosening profile RLS.
