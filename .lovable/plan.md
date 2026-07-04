## Goal

Let the admin set a **name + password** when generating an invite link. The admin then shares the link + password with the invitee. The invitee opens the link, is greeted by name, enters the password, and their account is created & signed in — no picking their own password.

## UX flow

**Admin — Generate link (Access Control → Generate invite link)**

New "Access" section in the invite modal, added under Role / Link binding:

```text
┌─ Access ────────────────────────────────────┐
│ ( ) Self-serve — invitee sets own password  │
│ (•) Preset password — I'll share it manually│
│                                              │
│   Full name        [ Ahmed Hassan         ]  │
│   Password         [ ••••••••••    ] 🎲 Gen  │
│   (min 8 chars, shown once after creation)   │
└──────────────────────────────────────────────┘
```

- "🎲 Gen" fills a readable random password (e.g. `swift-otter-84`).
- Email-locked mode stays as-is; preset password works with both open and email-locked.
- Role and expiry stay as-is.

**Admin — Link ready screen** (after Generate)

Show link **and** password side-by-side, with:
- Copy link button (existing)
- Copy password button (new)
- "Copy both" convenience button that copies a ready-to-send block:
  ```
  Link: https://…/accept-invite?token=…
  Password: swift-otter-84
  ```
- One-time reveal warning: *"Save this password now — it can't be shown again."*

**Invitee — Accept page**

When `has_preset_password = true`, replace the current "choose your password" form with a branded gate:

```text
        Welcome, Ahmed 👋
   You've been invited to Mechatro Tasks

   Email     [ ahmed@… ]   ← readonly if email-locked, else empty
   Password  [ ••••••••• ]

           [  Activate account  ]
```

On submit → account is created with that email + the preset password, session is set, redirect to `/`.

## Technical details

**DB migration** — add to `public.invites`:
- `password_hash TEXT NULL` (bcrypt/scrypt hash of preset password; nullable = self-serve invite)
- `has_password BOOLEAN GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED` (for cheap peek)

Grants/RLS unchanged; invites are only touched by edge functions using the service role.

**Edge function: `admin-invites` (action `create`)**
- Accept optional `preset_password` (string, ≥8 chars) and `full_name`.
- Hash with `bcrypt` (`https://esm.sh/bcryptjs`) and store in `password_hash`.
- Response returns `preset_password` **once** (echoed back so the UI can show it) — never stored in plaintext.

**Edge function: `redeem-invite`**
- `peek` response: add `has_password: boolean`.
- `redeem`: if `password_hash` is set, require `body.password` and verify with `bcrypt.compare`; on match, create the auth user with that same password as the login password. If no `password_hash`, keep current behavior (invitee-chosen password ≥ 8 chars).
- Return `password_mismatch` error code when the invitee types the wrong password.

**Frontend**
- `src/routes/_authenticated/access-control.tsx` — extend `InviteModal`:
  - Add `access` state (`self_serve | preset`), `presetPassword`, generator helper.
  - Pass to `admin-invites` create.
  - In the "generated" view, render the password block + copy handlers when preset was used.
- `src/routes/accept-invite.tsx` — extend peek result with `has_password`, and when true:
  - Hide the "choose password" copy; show "Enter the password your admin sent you".
  - Add `password_mismatch` to `ERROR_MAP`.
  - On success, sign in with the entered email + password (already the flow after redeem).

**Security notes**
- Password stored only as bcrypt hash; plaintext returned once at creation time and never again.
- Rate-limit password attempts on redeem: 5 tries per token per hour (simple counter column `password_attempts` + `password_locked_until`) to stop brute force.
- All checks stay server-side in the edge function; client never sees the hash.

## Files touched

- `supabase/migrations/<new>.sql` — add columns
- `supabase/functions/admin-invites/index.ts` — accept + hash preset password
- `supabase/functions/redeem-invite/index.ts` — verify preset password on redeem, expose `has_password` on peek
- `src/routes/_authenticated/access-control.tsx` — Access section in modal + reveal-once password UI
- `src/routes/accept-invite.tsx` — password-gate variant of the accept form
