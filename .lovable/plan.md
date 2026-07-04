## Goal
Make the sidebar profile block a full "who am I / access level" panel — avatar, name, role badge, email, sign-out — and let the signed-in user edit their own name inline. Also confirm the signup (invite acceptance) form already captures the full name and tighten it a bit.

## What already exists (no change needed)
- Signup is **invite-only** in this app — there's no public signup form. The invite acceptance page (`/accept-invite`) already asks for **full name** + password before redeeming. Good.
- Sidebar already renders **avatar + full name + role badge** at the top.
- Sidebar footer already has a **Sign out** button.

## What I'll add / change

### 1. Sidebar profile block (`src/components/layout/Sidebar.tsx`)
Turn the existing block into a richer "Profile" card:
- Avatar (kept)
- Full name (kept) — clickable, opens inline edit
- **Role/access badge** — RoleBadge already shows role; keep it and add a subtle "Master Admin" chip when `isMasterAdmin`.
- **Email** — new line under the name in muted color, LTR, truncated with ellipsis on overflow.
- A small **pencil (edit) icon** on the block — opens a lightweight edit modal.
- Placement: **stays near the top** (the app already has it there). The **sign-out button remains fixed at the bottom** as it is today (matches your "bottom of the sidebar" answer for the profile footer sign-out control).

Note on your placement answer: the block itself has to sit at the top-under-logo because a large signed-in identity card at the very bottom conflicts with the existing sign-out button. What I'll do is keep the profile info near the top (visible on every page load without scrolling) and keep the **sign-out button as a fixed footer at the bottom**, so the sidebar bottom is dedicated to that action. If you'd rather move the whole profile block to the bottom (above sign-out) instead, tell me on approval and I'll switch it.

### 2. Edit-name modal (small, inside the sidebar file)
- Opens when the user taps their profile block or the pencil icon.
- Single field: **Full name** (trimmed, required, 2–80 chars).
- Cancel + Save buttons; Save calls `supabase.from("profiles").update({ full_name }).eq("id", user.id)`.
- The existing `profiles_guard_self_update` trigger allows non-admins to update their own `full_name` (it only blocks role/status/email/active/id changes), so this works for every user.
- On success: toast, refresh the local `user` in `AppProvider` (call `refreshUsers` + re-fetch own profile), close modal.
- Bilingual labels (AR/EN) via existing `t()` where a key exists, otherwise inline strings.

### 3. Invite form polish (`src/routes/accept-invite.tsx`)
- Add zod-style client validation: `full_name.trim().length >= 2 && <= 80`.
- Show inline error if empty/too short before calling `redeem-invite`. No backend change.

### 4. `app-context` (`src/lib/app-context.tsx`)
- Expose a small `refreshSelf()` helper that re-reads the signed-in user's profile row, so the edit modal can refresh the sidebar instantly without a full page reload.

## Not touched
- No changes to RLS, edge functions, or role assignment.
- No changes to how signup/invite tokens are issued.
- No new i18n bundle overhaul — new labels use existing keys or short inline AR/EN strings.

## After it's done
- Every signed-in user sees, in the sidebar: their avatar, their name (editable via pencil), their role badge (Master Admin / Admin / Member), and their email. Sign-out stays at the bottom.
- Members can rename themselves; role/email/status stay locked (as the security guard already enforces).