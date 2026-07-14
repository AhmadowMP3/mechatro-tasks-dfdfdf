## Problem

Adding "ahmad sabagh" as a task assignee fails with:
`insert or update on table "task_assignees" violates foreign key constraint "task_assignees_user_id_fkey"`

**Root cause:** `task_assignees.user_id` has a foreign key to `auth.users(id)`, but the profile "ahmad sabagh" exists in `public.profiles` without a matching `auth.users` row (a member profile created without an auth account). The main `tasks.assignee_id` column already correctly references `profiles(id)`, so single-assignee works but multi-assignee fails for any profile lacking an auth user.

## Fix

Migration to realign the FK with the rest of the schema:

1. Drop `task_assignees_user_id_fkey`.
2. Re-create it as `FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE`.

No app/UI changes needed — the assignee picker already lists profiles, and this makes the constraint consistent with `tasks.assignee_id`.