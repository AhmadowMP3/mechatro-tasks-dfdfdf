## Problem

In the screenshot, the "Edit name" dialog opened from the sidebar is **not covering the full viewport**: the dark backdrop only fills a strip in the middle, the modal sits half-behind the Projects card, and the right side of the page is not dimmed at all.

The dialog itself uses `position: fixed; inset: 0`, which normally covers the whole viewport. It doesn't here because the modal is rendered **inside the sidebar's DOM subtree**, and an ancestor of the sidebar uses `transform` / `filter` / `will-change` (used for the mobile drawer slide + sticky effects). Per the CSS spec, any ancestor with `transform` becomes the containing block for `position: fixed` descendants — so `inset: 0` is measured against the sidebar, not the viewport. That's why the overlay is clipped to the sidebar column.

## Fix

Render `EditNameModal` through a **React portal to `document.body`**, so it escapes the sidebar's transform context and its `position: fixed` overlay is measured against the real viewport.

### Change (single file: `src/components/layout/Sidebar.tsx`)

1. Add `import { createPortal } from "react-dom"`.
2. In `EditNameModal`, wrap the returned JSX with `createPortal(<>…</>, document.body)`.
3. Guard for SSR: only portal when `typeof document !== "undefined"` (return `null` otherwise — the modal is only opened by a client click anyway).
4. No behavior changes: same styles, same save logic, same close-on-backdrop-click, same RTL handling.

### Why not other approaches

- Removing the ancestor `transform` would break the mobile sidebar drawer animation.
- Moving the modal state up to `AppShell` works but is a bigger refactor for the same visual result.
- A portal is the standard fix for exactly this class of bug and is what shadcn's `Dialog` does internally.

## Out of scope

- No changes to the save flow, validation, i18n, or styling of the dialog.
- No changes to any other modal or to the sidebar itself.

## Verification

- Open sidebar → click "Edit name" → confirm the backdrop covers the entire viewport (including the right side and behind the Projects card) and the modal is centered.
- Repeat on mobile (390×844) with the drawer open.
- Typecheck stays clean.