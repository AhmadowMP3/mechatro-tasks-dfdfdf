# Mobile UI Polish Plan

Keep the current visual language (colors, tokens, gradients). Refine at the details level: tap targets, spacing rhythm, alignment, motion, and RTL correctness. No business-logic changes.

## 1. Global Shell (`src/components/layout/AppShell.tsx`, `PageHeader.tsx`, `src/styles.css`)

- Enforce safe-area insets on top (`env(safe-area-inset-top)`) so page headers clear the notch.
- Standardize mobile page padding: 16px inline, 12px top, 96px bottom (clears tab bar + safe-area).
- Global mobile typography scale in `styles.css` under `@media (max-width: 640px)`:
  - `h1` 22px, `h2` 18px, `h3` 16px, body 15px, `line-height: 1.5`.
  - Ensure all headings use `text-wrap: balance` and long strings get `overflow-wrap: anywhere`.
- Minimum tap target rule: buttons, links in nav, icon buttons ≥ 44×44 px on mobile via a `.tap-44` utility applied where needed.
- `:focus-visible` ring standardized (2px primary, 2px offset) — accessibility on touch too.

## 2. Mobile Tab Bar (`MobileTabBar.tsx`, `styles.css`)

- Keep the glow-icon active style already in place; refine:
  - Add smooth spring-like transform on active change (`transition: transform .22s cubic-bezier(.4,1.3,.5,1)`).
  - Slight scale (1.06) + upward translate on active icon, glow fades in.
  - Label weight jumps 700 → 800 on active for better contrast.
  - Add subtle `:active` press state (scale .96).
  - Ensure `min-height: 60px` per cell and `padding-bottom: env(safe-area-inset-bottom)` (already there — verify).
- More sheet: ensure it uses same safe-area padding.

## 3. Page Headers (`PageHeader.tsx`, per-page headers)

- Convert all page header rows to the responsive grid pattern:
  `grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex`.
- `min-w-0` on text container, `truncate` on titles, `shrink-0` on action buttons.
- Action buttons stack into a horizontal scroll strip on very narrow widths when > 2 actions.

## 4. Cards, Lists & Tables

- `.brand-card` mobile: `padding: 14px`, `border-radius: 14px`.
- Task cards: title `line-clamp: 2`, meta row wraps cleanly, assignee stack caps at 3 + overflow badge.
- Kanban: hidden on mobile in favor of horizontal snap-scroll columns (already exists — verify column width `min(85vw, 320px)` and `scroll-snap-type: x mandatory`).
- Tables: on <640px force the "table becomes stacked cards" pattern for read-only lists (via CSS `display: block` + row cards). For editable tables (finance), keep horizontal scroll with sticky first column.

## 5. Forms, Inputs & Modals

- Inputs ≥ 46px min-height, 16px font (prevents iOS auto-zoom), 12px radius.
- Selects use native picker on mobile (already the case for finance).
- Modals (`NewTaskModal`, `TaskDetailModal`, `FilterDrawer`, share modals):
  - Full-screen sheet on mobile: `inset: 0`, `border-radius: 20px 20px 0 0`, slide-up animation.
  - Sticky header (title + close) + sticky footer (actions), scrollable body between.
  - Backdrop tap closes; `Esc` closes; body scroll-locked when open.

## 6. Motion & Micro-interactions

- Standard easing token in `styles.css`: `--ease-out: cubic-bezier(.2,.7,.2,1)`.
- Page transitions: fade + 4px slide on route change (opt-in via a wrapper — light, no framer-motion required).
- Button press: `transform: scale(.97)` on `:active`.
- List item hover/press: subtle background shift.
- Skeleton loaders get a shimmer keyframe.
- Respect `prefers-reduced-motion` — disable transforms/shimmer.

## 7. RTL / Arabic

- Audit hardcoded `left`/`right`, `marginLeft`/`marginRight` in mobile-critical components and swap for logical properties (`inline-start`/`inline-end`, `margin-inline-*`).
- Verify icons that carry direction (chevrons, back arrows) flip in RTL via `[dir="rtl"] .rtl-flip { transform: scaleX(-1) }`.
- Numbers already forced to English — verify formatters used everywhere on mobile pages.
- Confirm the mobile tab bar labels don't overflow in Arabic (test at 320px width).

## 8. Per-page mobile passes

Quick targeted sweep on each core page:

- **Dashboard (`_authenticated/index.tsx`)**: KPI grid uses `minmax(160px, 1fr)` on mobile; charts get horizontal scroll wrapper; podium card shrinks avatars.
- **Tasks (`_authenticated/tasks.tsx`)**: ViewSwitcher hides labels <400px (already `hide-sm`), filter drawer opens as bottom sheet; task cards get consistent 12px gap.
- **Projects**: project cards single column, hero image height caps at 140px.
- **Team**: member cards stack, avatar 56px, stats wrap.
- **League**: podium scales down to fit 320px, table becomes stacked rows.
- **Finance**: keep existing polish; only verify all sub-pages (invoices, expenses, income, payroll, subscriptions, reports, settings) use the same tab-bar treatment and card padding — no logic changes.
- **Notes**: editor toolbar becomes horizontal-scroll on mobile, AI menu opens as sheet.

## 9. Verification

- Playwright screenshots at 320px, 375px, 414px in both LTR and RTL for: Dashboard, Tasks, Projects, Team, League, Finance overview, one modal open.
- Visually confirm no overflow, no clipped text, tab bar aligned, safe-area respected.
- Typecheck must pass.

## Technical notes

- Almost all changes land in `src/styles.css` (adding utilities + `@media (max-width: 640px)` blocks), `MobileTabBar.tsx`, `PageHeader.tsx`, and small edits in each page/modal to apply the responsive grid pattern.
- No new dependencies. No changes to data, queries, server functions, or auth.
- No token/color changes — reuse existing CSS variables.

## Out of scope

- Desktop layout changes.
- New features or content.
- Business logic, data model, backend.
