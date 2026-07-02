## Goal

Swap the current "email an invite from the system" flow for a link-based one: the master admin generates an invite, copies the URL, and sends it manually (WhatsApp, email, in person). The recipient opens the link, sets their password, and lands in the app.

## What changes for the admin (Access Control page)

- "Invite user" button → **Generate invite link**.
- Modal fields:
  - Role: Member / Admin
  - Link type:
    - **Email-locked** — enter the member's email + optional name. Only that email can redeem.
    - **Open link** — anyone with the link can sign up (name/email chosen by whoever opens it).
  - Expiry: dropdown — 24 hours / 7 days / 30 days / Never (default 7 days). Always single-use.
- On submit: the modal flips to a "Link ready" view showing the full URL, a big **Copy** button, and quick-share buttons for WhatsApp and Email (prefilled). Bilingual copy blurb the admin can paste.
- New **Pending invites** section on the same page: list of unredeemed invites with role, type, expiry, created-by, and actions: Copy link, Revoke.
- Existing "Resend invite" menu item on user rows is removed (no email flow anymore). Replaced by "Generate new link" for users whose invite is still pending.

## What changes for the member (recipient)

- Opens the link → new public route `/accept-invite?token=…`.
- Page shows: Mechatro branding, role they're being granted, and a form:
  - Email-locked invite → email is pre-filled and read-only, member fills in Full name + Password.
  - Open invite → member fills Full name + Email + Password.
- Submit → account is created (email pre-confirmed), invite is marked used, member is signed in automatically and redirected to the dashboard.
- Clear error states for: invalid token, expired, already used, revoked, email mismatch.

## What changes on the sign-in page

- Wording updated: "Invite-only — ask your admin for an invite link" (no more "check your inbox").

## Activity Log

- New action `invite_created` and `invite_redeemed` on entity `invite`, captured by the existing DB audit trigger. Revoke also logged.

---

## Technical details

**New table `public.invites`**
- `id uuid pk`, `token text unique` (32-byte URL-safe, generated server-side), `role app_role`, `email text null` (lowercased when set), `full_name text null`, `expires_at timestamptz null`, `created_by uuid → profiles`, `created_at`, `revoked_at timestamptz null`, `used_at timestamptz null`, `used_by uuid null → profiles`.
- RLS: admins can select/insert/update; anon can do nothing (redemption goes through the edge function with service role).
- GRANTs per project convention; audit trigger attached.

**Edge function `admin-invites`** (master-admin-only, verifies bearer):
- `create` → returns `{ token, url }` where `url = <site>/accept-invite?token=…`.
- `list` → pending + recent invites with computed `status` (pending / expired / used / revoked).
- `revoke` → sets `revoked_at`.

**New public edge function `redeem-invite`** (no auth required, `verify_jwt = false`):
- Input: `token`, `full_name`, `email` (ignored when invite is email-locked), `password`.
- Validates token: exists, not revoked, not used, not expired, email match if locked.
- Uses service role to `admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, invited_via: token } })`.
- Updates the auto-created profile with `role`, `status='active'`, `invited_by`, `invited_at`.
- Marks invite `used_at`, `used_by`.
- Returns success; client then signs in with the same email + password.

**Old `admin-users` edge function**: `invite` and `resend_invite` actions removed; other actions untouched.

**Frontend**
- New route `src/routes/accept-invite.tsx` (public, top-level).
- Rewrite `InviteModal` inside `access-control.tsx` to the two-step Generate → Copy flow; add `PendingInvitesSection`.
- Small dictionary additions in `src/i18n/dict.ts` (AR + EN) for all new labels and error messages.
- Site origin for building the link comes from `window.location.origin` in the admin's browser (works for both preview and published domains).

**Security notes for the memory doc after implementation**
- Tokens are 32-byte cryptographically random, single-use, expirable, revocable.
- `redeem-invite` is intentionally public but strictly validates the token before creating any user; no user enumeration (uniform error messages).
- `invites` table has no anon grant.
