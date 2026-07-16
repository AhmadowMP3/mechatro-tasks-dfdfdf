## Root cause

The "Client" team member is a **profile-only** user — a row in `public.profiles` (`id = 603a7a27-…`) with **no matching row in `auth.users`** (it was created as a manual/placeholder member, not through sign-up).

When you approve & award points, the DB function `award_points_to_user` runs and eventually tries:

```sql
INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'first_blood');
```

`user_badges.user_id` has a foreign key **to `auth.users(id)`**. Since the Client profile has no auth.users row, Postgres rejects the insert with:

```
insert or update on table "user_badges" violates foreign key constraint "user_badges_user_id_fkey"
```

That aborts the whole approval transaction — no points get awarded to anyone.

Notifications didn't fail because `notifications.user_id` already points to `profiles(id)`, not `auth.users`. Season scores didn't fail either, but only because there is no active league season right now — otherwise `season_scores.user_id_fkey` would break for the same reason.

## Fix

Migration that repoints two FKs from `auth.users(id)` → `public.profiles(id)` so every profile (auth-backed or profile-only) can receive badges and season scores. `profiles.id` still references `auth.users` where applicable, so nothing loosens for real users.

```sql
ALTER TABLE public.user_badges
  DROP CONSTRAINT user_badges_user_id_fkey,
  ADD  CONSTRAINT user_badges_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.season_scores
  DROP CONSTRAINT season_scores_user_id_fkey,
  ADD  CONSTRAINT season_scores_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
```

No app code changes. No data changes. Existing badges/scores stay intact.

## Out of scope

- Not touching FKs on invoices, expenses, notes, etc. (those are "created_by" audit fields and only ever set to real signed-in users).
- Not changing the award UI or the split flow.
- Not adding a "hide profile-only users from the award panel" filter — you explicitly want Client to receive points.

## Verification

After the migration:
1. Re-run the same approve action on the task in your screenshot. All four members (including Client) receive points and any earned badges without error.
2. `SELECT user_id, code FROM public.user_badges WHERE user_id = '603a7a27-4ebb-4442-aae6-352e4f059ee6';` shows Client's newly awarded badges.
