# Fix Finance mobile UI

The uploaded screenshots show four concrete breakages on the Finance section at mobile widths (~360–420px):

1. **Tab bar clips the last tab** and gives no scroll affordance — "المصاريف" appears cut to "المصار" at the right edge.
2. **Header row is cramped** — greeting, currency toggle, and the "1 USD = … SYP" hint jam into the same row and wrap awkwardly.
3. **KPI cards overflow** — the big 28px `kpi-value` (e.g. `500,000,000.00 ل.س`) touches the card edge and wraps mid-number.
4. **12-month chart is too tight** — twelve equal columns in the mobile width squeeze the bars to hair-thin, month labels overlap.

Everything below is presentation-only. No changes to data flow, queries, currency logic, or i18n keys.

## Changes

### 1. `src/routes/_authenticated/finance.tsx` — tab bar

- Add horizontal end padding (14 → 20) plus `scroll-padding-inline: 20px` so the first/last tab breathe.
- Add `-webkit-mask-image` fade on both edges of the scroller to make it obvious the row is scrollable.
- Add `scrollbar-width: none` / `::-webkit-scrollbar { display: none }` for a cleaner mobile look.

### 2. `src/styles/finance.css` — mobile-specific rules under `@media (max-width: 640px)`

- `.finance-tabs a` — drop min-height to 40, font 13.5px, padding `8px 14px`, keep icons.
- `.finance-root { padding: 14px !important; }` on the outer container (currently 20).
- `.finance-root h1 { font-size: 22px !important; }` (down from 28).
- `.finance-root .kpi-value` — `font-size: 22px !important; overflow-wrap: anywhere; word-break: break-word; line-height: 1.15;` so long money strings wrap on the comma/space instead of pushing the card.
- `.finance-root .quick-action` — reduce padding to `14px 16px`, min-height 60, font 15.
- `.finance-root .brand-card` — reduce inner padding on cards from 20/22 → 16 via a mobile override (`.finance-root section.brand-card, .finance-root .brand-card { padding: 16px !important; }` scoped to the media query only).

### 3. `src/routes/_authenticated/finance.index.tsx` — header + KPI + chart

**Header row (lines 140–170)** — restructure so it stacks cleanly:

```
[ Greeting + date          ]
[ Currency label + toggle  ]  ← same row on mobile
[ 1 USD = … SYP hint       ]  ← own line on mobile
```

Concretely: wrap the right-side controls in a container that uses `flex-wrap: wrap`, move the FX hint into its own `<div>` with `width: 100%` / `flex-basis: 100%` so it drops to a new line rather than dangling next to the toggle.

**KPI grid (line 198)** — change `minmax(240px, 1fr)` → `minmax(200px, 1fr)` so two cards fit side-by-side around 420px width instead of stacking to one column too early.

**KPI card body (line 286)** — remove `minHeight: 128` (mobile doesn't need the fixed height once the value wraps), and add `min-w-0` semantics via inline `minWidth: 0` on the outer card and on the value div, so text wrapping actually kicks in inside grids.

**Monthly chart (line 210)** — on mobile the 12-column grid becomes scrollable:
- Wrap the bar grid in a `<div style={{ overflowX: "auto" }}>`.
- Give the inner grid `minWidth: 480` so bars stay legible; on desktop it fills naturally because 480px is less than any real desktop width there.

## Out of scope

- Other finance sub-routes (invoices/customers/expenses/etc.) — the reported issues are on `/finance` overview and the shared tab bar; those two already cover both screenshots. If specific sub-pages need mobile polish later, that's a separate pass.
- No changes to Arabic/English digit rules (already Latin-only), no changes to numbers formatting, currency conversion, or any business logic.
- No new dependencies; pure CSS + small JSX restructure.

## Verification

After changes I will:
1. Set the preview to mobile viewport and load `/finance` in Arabic — check tabs scroll edge-to-edge with fade, KPI amounts wrap inside cards, header stacks in the order above.
2. Switch language to English — sanity check that the same layout holds LTR.
3. Confirm desktop (`>= 1024px`) is visually unchanged by re-checking the current preview after the edit.
