## Bug

In the sidebar, when you open any child under Finance (`/finance/invoices`, `/finance/customers`, `/finance/expenses`, …) the "لوحة مالية" item (`/finance`) also stays highlighted, so two items look selected at once.

## Cause

`src/components/layout/Sidebar.tsx` computes active as:

```ts
pathname === to || pathname.startsWith(to + "/")
```

For `to = "/finance"` and `pathname = "/finance/invoices"`, `startsWith("/finance/")` is `true` — so the parent dashboard row lights up on every child page. Same logic used in two places (line 277 for section-level detection, line 353 for the per-item render).

## Fix

Make prefix-matching skip items whose `to` is itself a prefix of another sibling `to` in the same section — those parent-dashboard rows must match by exact pathname only. This handles `/finance` today and any future "section landing" route without hardcoding.

Steps in `src/components/layout/Sidebar.tsx`:

1. Build a small helper (inside the section render loop where `items` is already in scope):
   ```ts
   const hasDeeperSibling = (to: string) =>
     items.some((it) => it.to !== to && it.to.startsWith(to + "/"));
   ```
2. Replace both active checks with:
   ```ts
   const active =
     to === "/" ? pathname === "/"
     : hasDeeperSibling(to) ? pathname === to
     : pathname === to || pathname.startsWith(to + "/");
   ```
   Apply at line 277 (section-open detection — pass that section's `items`) and line 353 (per-item render).

Section-open detection still needs to expand Finance when any child is active, so keep the section-level "any item active" check using the same per-item rule.

## Out of scope

- No styling / label / route changes.
- No changes outside `src/components/layout/Sidebar.tsx`.

## Result

At `/finance/invoices`: only "الفواتير" is highlighted. At `/finance`: only "لوحة مالية" is highlighted. Same behavior generalizes to any other section with a landing route + siblings.
