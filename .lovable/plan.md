## Goal

Sign-in shows only **Name** and **Password** — no email field, no email errors. The invite/accept flow follows the same rule.

Lovable Cloud auth requires each account to have an email under the hood, so we keep a hidden email on the account but the user never types or sees it — it's generated automatically from the name.

## What changes for the user

- **/auth**: two fields only — **Name** and **Password**. No email input, no email validation errors.
- **/accept-invite**: **Name** (locked to the invite's name when set) + **Password**. No email input.
- Existing accounts keep working — anyone who already has a real email can sign in by typing their **full name** (or the name the admin set) instead of the email.

## How it works under the hood (technical)

1. **`profiles.username`** — add a `citext` column with a unique index. Backfill from `full_name` (lowercase, spaces → `.`, non-alnum stripped); collisions get a numeric suffix. Kept in sync with `full_name` only until the user has a custom username.

2. **Synthetic email bridge** — every account still has an email in `auth.users`. New accounts get `"<username>@users.mechatro.local"`. Existing real emails stay untouched; login resolves username → email.

3. **RPC `resolve_login_email(p_name text) returns text`** — SECURITY DEFINER, `search_path = public`. Matches `lower(username) = lower($1) OR lower(full_name) = lower($1)`, returns the email only when `status = 'active'`. Returns NULL otherwise (client shows a single generic "Invalid name or password" — no user enumeration). `GRANT EXECUTE TO anon, authenticated`.

4. **Sign-in flow** (`src/routes/auth.tsx`):
   - Replace the email input with a **Name** input (`autoComplete="username"`, LTR).
   - On submit: `supabase.rpc("resolve_login_email", { p_name: name })` → if it returns a string, call `signInWithPassword({ email, password })`; otherwise show the generic error.
   - Drop `type="email"` and email-only strings. AR/EN labels: "الاسم" / "Name".

5. **Invite acceptance** (`src/routes/accept-invite.tsx` + `supabase/functions/admin-invites/index.ts`):
   - Remove the email input. Use the invite's `full_name` as the name; if the invite has no name, ask for one on the accept screen.
   - The edge function derives `username` from the accepted name and creates the auth user with `"<username>@users.mechatro.local"`. On collision, append a numeric suffix and return the final name so the UI can show it.
   - Delete `is_email_locked`, `email_required`, `email_mismatch`, `email_taken` strings and branches.

6. **Access-Control admin UX** — where the pending/active list currently prints the email as a subtitle, show `@username` instead (fallback to nothing when unset). No policy changes.

7. **Master-admin bootstrap** — `app_config.master_admin_email` stays for server-side identification. The master signs in the same way: types their name, RPC resolves to their email.

## Files touched

- `supabase/migrations/*` — `username` column + unique index, backfill, `resolve_login_email` RPC + grants.
- `src/routes/auth.tsx` — name field, RPC call, error handling.
- `src/routes/accept-invite.tsx` — remove email UI + related strings.
- `supabase/functions/admin-invites/index.ts` — derive username, synthesize email, drop email from the create-invite payload.
- `src/routes/_authenticated/access-control.tsx` — subtitle uses `@username`.

## Not in scope

Password reset via email link. Once emails are hidden, "forgot password" needs an admin-driven reset (admin sets a new password from Access Control). Small follow-up if you want it.

## One question before I build

The invite dialog currently lets admins optionally type an email for the invitee. Do you want me to:

- **(A)** Remove the email field completely — invites are name-only, synthetic email generated automatically; or
- **(B)** Keep it as an *optional* admin note (hidden from the invitee, used only if the admin later wants a real recovery email).

Reply "A" or "B" and I'll implement.
