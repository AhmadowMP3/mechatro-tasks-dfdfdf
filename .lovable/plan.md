
# Mobile UI Full Checkup

**Rule for every change:** desktop stays byte-for-byte the same. Every fix is gated behind `isMobile` (`< 768px`) so nothing below 1024px changes on tablet/desktop unintentionally, and mobile only diverges where it must.

Same tokens, same colors, same typography — just fitted, with real thumb ergonomics.

## 1. Layout chrome (AppShell + Sidebar)

Rebuild the mobile shell as **top bar + bottom nav** while keeping the exact desktop sidebar.

```text
┌─────────────────────────────┐
│ ☰  [logo]      AR|EN  🌙 🔔 │  top bar (sticky, 56px)
├─────────────────────────────┤
│                             │
│         page content        │
│   (padding-bottom: 84px)    │
│                             │
├─────────────────────────────┤
│ 🏠   📁   ✅   👥   •••     │  bottom tab bar (safe-area)
└─────────────────────────────┘
```

- **Top bar:** hamburger (opens full drawer with the current sidebar contents for secondary routes/profile/sign-out), logo, share-mode chip, refresh (share mode), lang toggle, theme toggle, notifications bell with unread dot. Bell hidden in share mode.
- **Bottom nav:** 4 primary tabs + "More". Tabs adapt to role/share mode:
  - Default: Dashboard, Projects, Tasks, Team, More
  - Share mode: only allowed pages, filled left-to-right, rest under More
- Uses `env(safe-area-inset-bottom)` and `100dvh` (not `100vh`) so iOS Safari address bar doesn't clip content.
- Main content gets `padding-bottom: calc(72px + safe-area-inset-bottom)` on mobile so the bottom bar never covers the last row.
- Drawer opens from correct side based on `lang` (RTL-aware, already partially there).

## 2. Universal mobile fixes (applies to every page)

- **Page headers:** switch from bare `flex flex-wrap` to `grid-cols-[minmax(0,1fr)_auto]` on mobile so title truncates and action button never wraps to a second row awkwardly. Titles drop from 28px → 22px on mobile.
- **Filter bars / toolbars:** horizontally scroll on mobile with `overflow-x: auto; scroll-snap-type: x mandatory;` instead of wrapping into 4 rows.
- **Cards / rows:** full-bleed (edge-to-edge minus 14px page padding), 16px internal padding on mobile vs 20–24px desktop.
- **Tap targets:** every interactive element ≥ 44×44 (audit and fix icon-only buttons under that size).
- **Modals → bottom sheets on mobile:** Dialog/Drawer components render as bottom sheet (rounded top corners, drag handle, max-height 92dvh, scrollable body). Applies to `NewTaskModal`, `TaskDetailModal`, `FilterDrawer`, `GenerateReportDialog`, and any `alert-dialog`/`sheet` opened from the pages listed below.
- **Tables → cards:** `TableView` on mobile renders as stacked cards (already partially so — audit and finish). Kanban gets a horizontal scroll with column snap.
- **Long text:** apply `min-w-0` + `truncate` on all flex text children; multi-line clamp on descriptions.
- **RTL:** replace remaining `marginLeft`/`marginRight` with `marginInlineStart`/`marginInlineEnd`; verify drawer/sheet slide direction in Arabic.
- **Forms:** inputs get `font-size: 16px` on mobile (prevents iOS zoom-on-focus); labels stack above inputs; date pickers use native input on mobile.

## 3. Page-by-page pass

Authenticated pages:
- **Dashboard (`/`)** — stat cards go 1-col on mobile, filter bar scrolls, charts get responsive width.
- **Tasks (`/tasks`)** — view switcher becomes segmented pill row, Kanban horizontal snap-scroll, Table → card list, filter drawer → bottom sheet.
- **Projects (`/projects` + `/projects/$id`)** — grid → 1-col, project detail header uses the responsive grid pattern; sticky sub-tabs.
- **Team (`/team`)** — member cards 1-col, report dialog as bottom sheet.
- **League (`/league`)** — podium reflows to vertical, table → cards.
- **References (`/references`)** — card grid 1-col, tag filters horizontally scrollable.
- **Activity (`/activity`)** — timeline: timestamps stack above content on mobile.
- **Reports history + compare** — list rows collapse; comparison tables horizontally scroll inside a bordered container.
- **Share Links (`/share-links`)** — link rows become cards; copy button always visible.
- **Access Control (`/access-control`)** — user rows → cards with role select full-width.
- **Settings (`/settings`)** — section cards 1-col; language/theme rows large tap targets.
- **Notifications (`/notifications`)** — rows already OK; verify "mark all read" button doesn't wrap.
- **Suspended screen** — center content, cap width, safe-area padding.

Public pages:
- **`/auth`** — form full-width with 16px inputs, buttons min-h-52; social login row stacks vertically < 380px.
- **`/accept-invite`** — same input rules, clear CTA.
- **`/reset-password`** — same.
- **`/share/…`** — top bar hides hamburger (no drawer needed), bottom nav shows only allowed pages, "read-only preview" chip stays visible.

## 4. Verification

- Playwright at 375×812 (iPhone), 390×844, 414×896, 768×1024 (iPad — must look like desktop), 1280 (desktop — must be unchanged).
- Screenshot each route at 375 for the summary.
- RTL pass: switch to Arabic and re-screenshot 3 key pages (Dashboard, Tasks, Task detail sheet).
- Check console for hook / hydration warnings.

## 5. Out of scope (ask if you want these)

- No new features, no data changes, no auth flow changes.
- No visual redesign — same tokens, same brand.
- No PWA install / offline / push.

---

### Technical notes

- Mobile breakpoint: `matchMedia("(max-width: 767px)")` via a shared `useIsMobile` hook (already exists in `src/hooks/use-mobile.tsx` — reuse it, don't duplicate the `resize` listener currently in `AppShell`).
- Bottom nav is a new component `src/components/layout/MobileTabBar.tsx`; sidebar drawer contents unchanged.
- Bottom-sheet variant: reuse existing shadcn `Drawer` (Vaul) for modals on mobile; keep `Dialog` on desktop via a small `<ResponsiveModal>` wrapper.
- Add `viewport-fit=cover` to the root route's `<meta viewport>` if missing, and `padding: env(safe-area-inset-*)` where needed.
- Use `100dvh` everywhere `100vh` currently appears in mobile-visible surfaces.
- No changes to `src/routeTree.gen.ts`, Supabase, or edge functions.
