## The error

```
insert or update on table "note_shares" violates foreign key
constraint "note_shares_shared_with_user_id_fkey"
```

`public.note_shares.shared_with_user_id` currently references `auth.users(id)`, but the Share modal lists people from `public.profiles`. When a profile exists whose `id` has no matching row in `auth.users` (e.g. the seeded "Test User"), the insert fails the FK check before it ever hits RLS.

## Fix (one small migration)

Repoint the FK to `public.profiles(id)` — the table the UI actually reads from — so any user visible in the share picker can be inserted.

```sql
ALTER TABLE public.note_shares
  DROP CONSTRAINT note_shares_shared_with_user_id_fkey;

ALTER TABLE public.note_shares
  ADD CONSTRAINT note_shares_shared_with_user_id_fkey
  FOREIGN KEY (shared_with_user_id)
  REFERENCES public.profiles(id) ON DELETE CASCADE;
```

Also add a tiny safety net in `setNoteShares` (`src/lib/notes.ts`) so the toast surfaces a clean message ("This user can't be shared with") on a 23503 FK violation instead of the raw Postgres text.

No UI changes, no schema of `note_shares` changes beyond the FK target — RLS, grants, and the recursion-safe policies from earlier migrations stay intact.

## Notes UI polish (optional, same turn)

You already asked for the Notes to feel "cool without errors". If you want, I can also, in the same turn:

- Make the Share modal show a subtle avatar + role chip per row and a live count ("3 of 8 selected").
- Add an inline "Shared with N" pill on the note header that opens the modal.
- Toast on save: "Shared with Ahmed, Sara +2".

Say **yes to polish** or **just the fix** and I'll implement.