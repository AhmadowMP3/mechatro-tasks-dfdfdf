# Password management

Two new abilities: every signed-in user can change their own password, and admins (including the master admin) can set a password for any other user.

## 1. Change my password (all roles)

- A key icon next to the pencil (edit name) in the sidebar profile card opens a themed dialog, so members reach it without the admin-only Settings page.
- Fields: current password, new password, confirm new password. Bilingual AR/EN, same dark card styling as the Edit Name modal.
- The current password is verified first by re-signing in with the account's login email; only then is the new password saved.
- Rules: minimum 8 characters, new password must differ from the current one, confirm must match. Errors show as clear localized toasts (no raw database text).
- On success: success toast, dialog closes, session stays signed in, and the change is written to the activity log.

## 2. Reset a user's password (admins + master)

- On the Access Control page, each user row's action menu gains "Reset password", visible to admins and the master admin.
- Guardrails: the master admin's password can only be reset by the master admin; admins cannot reset another admin's password, only members and pending users; nobody can reset their own from here (they use the profile dialog).
- The dialog offers both paths: type a new password (with confirm), or press "Generate" to fill a strong random password. Minimum 8 characters.
- After saving, the password is displayed once with a copy button so the admin can hand it over, plus a note that it is not retrievable later.
- The action is recorded in the activity log (who reset whose password), never the password itself.

## Technical notes

- Self-service change uses the browser Supabase client: resolve the login email via the existing `resolve_login_email` RPC, re-authenticate with `signInWithPassword` to verify the current password, then `supabase.auth.updateUser({ password })`.
- Admin reset adds a `set_password` action to the existing `admin-users` edge function, which already validates the caller's admin status server-side. It loads the target profile, enforces the master/admin guardrails, and calls `auth.admin.updateUserById(user_id, { password })`. Password length is validated server-side too, so the endpoint is safe even if called directly.
- Access Control calls it through the existing `call("set_password", ...)` helper; errors surface through `explainSupabaseError`.
- Generated passwords come from `crypto.getRandomValues` in the browser dialog; nothing is stored in the database or logs.

## Files touched

- `src/components/layout/Sidebar.tsx` — key button + new `ChangePasswordModal`
- `src/routes/_authenticated/access-control.tsx` — row action, reset dialog
- `supabase/functions/admin-users/index.ts` — `set_password` action
