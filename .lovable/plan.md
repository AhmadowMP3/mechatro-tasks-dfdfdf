## Goal

Polish icons and small UI details across the app so both mobile and desktop feel more crafted and "alive" — without changing any functionality.

## Icon polish

- **Consistent sizing** across the app: 16px inline, 18px in buttons, 20px in headers, 22–26px in feature cards. Set a uniform `strokeWidth={1.75}` on Lucide icons so they read lighter and more premium than the default 2.
- **Colored icon tiles** (small rounded-square with soft gradient behind the icon) for the sidebar nav, page-header actions, empty-states, and card headers — replacing bare mono icons. Each nav item gets a tinted tile in its brand color that lights up on hover / active.
- **Active-state glow**: sidebar active item icon gets a subtle drop-shadow + brighter tile. Hover: gentle scale (1.05) + tile brighten. Focus-visible: ring in `--primary`.
- **Semantic color pass**: status icons (done/overdue/paused) always resolve from tokens, never hardcoded hex.
- **Empty-state icons**: bigger (56–64px), inside a soft gradient circle, with subtle float animation.

## Desktop polish

- **Sidebar**: item chips with icon tile + label, hover slide-in accent bar on the leading edge, active item gets `--grad-blue` tile + soft glow. Divider between sections. Collapsed rail tooltip on hover.
- **Page headers**: title + subtitle spacing tuned, action buttons unified to `brand-btn-sm`, gradient underline accent under the title.
- **Cards**: hover lift (translateY -2px + shadow-glow), gradient hairline on top edge in dark mode.
- **Buttons**: unified hover (brightness 1.06 + translateY -1px), active (translateY 0 + brightness .96), disabled dim. Consistent icon+label gap.
- **Inputs / selects**: focus ring uses `--primary`, subtle inset shadow in light mode.
- **Toasts**: match card style (backdrop blur, gradient icon tile per severity).

## Mobile polish

- **Bottom tab bar** (already present, if applicable): larger tap targets (min 48px), active pill behind icon+label, safe-area padding.
- **Sticky mobile header** with condensed page title + inline search icon button.
- **Filter chips**: horizontal snap scroller with fade edges; active chip in gradient blue.
- **Cards**: full-bleed on small screens, tighter padding, single-column stacks.
- **Icons scale up 10%** on mobile so they don't feel weak next to larger tap targets.
- **Haptic-feeling press states**: scale .97 on tap for buttons and cards.

## Micro-interactions

- Page-header title: subtle fade+slide-in on mount.
- Sidebar active item icon: 250ms color transition.
- Card hover glow: 200ms ease.
- Skeleton loaders on Reports Hub cards while data is fetching (if applicable).
- Language toggle: swap fonts and `dir` with a 300ms crossfade.

## Files likely touched

- `src/styles.css` — icon tile utility, hover/active transitions, mobile bottom-bar polish, focus rings.
- `src/components/layout/Sidebar.tsx` — icon tiles + active state + hover accent.
- `src/components/layout/PageHeader.tsx` — spacing, gradient accent, action button sizing.
- `src/components/layout/BottomTabBar.tsx` (if present) or mobile nav — active pill.
- `src/components/ui/button.tsx`, card, badge — unified icon sizes + press states.
- Icon usages across routes get a light sweep to standardize `size` and `strokeWidth`.

## Out of scope

- Redesigning any route's layout or IA.
- Replacing the icon library.
- New illustrations or 3D assets.
- Changing colors from the just-approved light/dark polish.
- Backend or business-logic changes.
