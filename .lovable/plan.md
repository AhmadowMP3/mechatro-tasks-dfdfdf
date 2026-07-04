## What's actually going on

The invite system already exists and works:

- Admin page: `/access-control` — approve pending users, change roles, kick users, generate invite links, view/revoke active links.
- Public accept page: `/accept-invite?token=…` — invitee lands here, signs up / signs in, gets auto-approved with the role from the invite.
- Backend: `admin-invites` + `redeem-invite` edge functions (already deployed).

You can't find it because:

1. In the sidebar it's gated to **master admin only** (regular admins don't see it).
2. It's not surfaced anywhere on mobile beyond the hamburger sidebar, so it feels hidden.
3. There's no shortcut from the pages where you'd actually think of inviting someone (Team page).

## Plan

### 1. Surface "People & Invites" everywhere it belongs

- Rename the sidebar entry from "Access Control" to **"People & Invites"** with a `UserPlus` icon (both AR/EN). Keep route as `/access-control`.
- Show it for **all admins** (not just master). The `admin-invites` / `admin-users` edge functions already enforce master-admin for destructive ops, so admins get a read + invite-generate experience; sensitive controls stay gated server-side.
- Add a prominent **"Invite by link"** button on the **Team** page header for admins — opens the same `InviteModal` used in Access Control.
- Add an **"Invite people"** quick tile on the Dashboard for admins (small card, gold accent, opens the modal).

### 2. Mobile discoverability

- Add a floating **"+ Invite"** entry inside the mobile sidebar top area (right under the profile block) for admins — one tap → invite modal, no need to scroll the nav.
- Ensure the mobile tab bar's overflow ("More") lists People & Invites for admins.

### 3. Polish the invite modal + link screen

Desktop + mobile:
- Full-height sheet on mobile (bottom-sheet style), centered dialog on desktop.
- Role picker as segmented buttons (Member / Admin) with icons.
- Expiry chips: 24h · 7d · 30d · Never.
- Optional "lock to email" field with a hint.
- Generated-link view: big monospace pill, one-tap **Copy** + **Share** (uses `navigator.share` on mobile), QR code toggle for in-person handoff, and expiry countdown.
- Active invites list: cleaner rows on mobile (stacked), copy/revoke inline, "expires in Xd" badge.

### 4. Accept-invite page polish

- Branded header with Mechatro logo lockup.
- Clear "You've been invited as **Member/Admin**" hero.
- Sign-in vs. sign-up toggle preserved; on success, auto-navigate to `/`.
- Better error states for revoked/expired/used (already localized — just restyle).

### 5. Kick / role change UX (already exists — just polish)

- Confirm dialog for kick with the user's name.
- Role dropdown → segmented control on desktop rows; sheet picker on mobile rows.
- Toast on success ("Kicked Ahmed", "Ahmed is now Admin").

## Files to touch

- `src/components/layout/Sidebar.tsx` — rename entry, change gate to `isAdmin`, add mobile "Invite" shortcut block.
- `src/components/layout/MobileTabBar.tsx` — add to More menu for admins.
- `src/routes/_authenticated/access-control.tsx` — modal + list polish, mobile layout.
- `src/routes/_authenticated/team.tsx` — add "Invite by link" header button.
- `src/routes/_authenticated/index.tsx` (dashboard) — add "Invite people" tile for admins.
- `src/routes/accept-invite.tsx` — visual polish only.
- `src/styles.css` — utility classes for the invite sheet + QR block.

No schema, edge-function, or RLS changes. Existing `admin-invites` and `redeem-invite` functions handle everything.

## One thing to confirm

Right now regular admins can't open Access Control at all. Do you want:

- **A**: Regular admins can open the page and generate invite links, but only master admin can approve/kick/change roles (recommended — backend already enforces this).
- **B**: Keep it master-admin-only, just make it easier to find on mobile.
