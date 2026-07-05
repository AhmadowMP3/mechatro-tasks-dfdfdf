## Goal
Make sure references are visible to every signed-in user, and only admins can add/edit/delete/pin them.

## Current state
- DB policies on `public.references` are already correct:
  - `SELECT` → any authenticated user (`USING true`)
  - `INSERT/UPDATE/DELETE` → admins only (`private.is_admin(auth.uid())`)
- Frontend (`src/routes/_authenticated/references.tsx`) computes:
  ```
  canManage = isMasterAdmin || role === "admin" || role === "manager"
  ```
  This includes `manager`, which the DB will reject → a manager sees the "Add reference" button and edit menu but every write fails with an RLS error.

## Fix (frontend-only, one file)
Edit `src/routes/_authenticated/references.tsx`:

1. Change `canManage` to admin-only:
   ```ts
   const canManage = isMasterAdmin || user?.role === "admin";
   ```
   This hides the Add button, the card "⋮" menu (Pin / Edit / Delete), and the empty-state "Add" CTA for members and managers. Everyone still sees the full list, can open links, and copy URLs — matching the DB SELECT policy.

2. No DB migration needed — policies already enforce the same rule server-side.

## Verification
- Sign in as a non-admin: references list renders, no "Add reference" button, no "⋮" menu on cards, links open normally.
- Sign in as admin: Add / Edit / Delete / Pin all work as before.

## Out of scope
No changes to i18n, styling, layout, or the modal itself.