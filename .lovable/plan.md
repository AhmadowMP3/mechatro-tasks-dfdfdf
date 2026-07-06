
# Finance UI Polish — Simple & Comfortable for Master Admin

Goal: make every finance page easy to read and tap for an older admin, while keeping the current Mechatro brand (deep navy `#0A2540`, blue `#189FD1`, gold `#C8A24B`, gradient blue). No color rebrand, no logic changes — only presentation.

## Design rules (applied across all finance pages)

- **Type scale bump** (finance-only, scoped via a `.finance-root` wrapper class on the layout):
  - Body: 15px → **17px**
  - Table cells: 13px → **16px**, row height 44 → **56px**
  - Section titles: 18px → **22px**, page titles **28px** bold
  - Numbers/money: **tabular-nums**, +1px, semibold
- **Buttons**: min height **48px**, min width **120px**, radius 12, primary uses existing `--grad-blue`; icon+label always (no icon-only primary actions).
- **Inputs**: height **48px**, 16px font (prevents mobile zoom), clearer focus ring using `--brand` at 40% alpha.
- **Spacing**: card padding 16 → **24px**, gap between cards 12 → **20px**.
- **Contrast**: muted text lightened one step for readability; keep dark surface.
- **One primary action per page** (top-right on desktop, sticky bottom on mobile).
- **Tabs bar** (`finance.tsx`): taller (48px), larger label (15px), active tab gets gold underline in addition to blue fill for clearer "you are here".

## Page-by-page changes

### 1. Overview (`finance.index.tsx`) — friendly landing
- Big greeting header: "أهلاً {name}" / "Hi {name}" + today's date.
- **4 large KPI tiles** (2×2 on mobile, 1×4 on desktop): Income this month, Expenses this month, Net, Unpaid invoices — each 120px tall with big number + trend arrow + one-line label.
- Below: **"Quick actions"** row of 3 big buttons (56px): **Log income**, **Log expense**, **Run payroll** — matches the user's priorities.
- Remove/collapse dense charts into a single "This month" summary card; move detailed charts behind a "See details" link.

### 2. Income (`finance.income.tsx`) — priority
- Sticky top bar: month picker + big "＋ Add income" primary button.
- Card list style (not compressed table) on mobile; on desktop a spacious table with 56px rows.
- Each row shows: date · source · amount (large, right-aligned) · method pill. Extra columns collapse into an expand toggle.
- Empty state with illustration + single "Log first income" CTA.

### 3. Expenses (`finance.expenses.tsx`) — priority
- Same pattern as Income: sticky filter bar (month + category), big "＋ Add expense" button.
- Category shown as colored chip; amount large and red-tinted (`#F0676A`) so the eye finds it fast.
- Approve/reject actions become 44×44 icon buttons with tooltips + labels on hover; on mobile they appear inline as full labeled buttons.

### 4. Payroll (`finance.payroll.tsx`) — priority
- Reframe as a **step-by-step month card**: 1) Select month → 2) Review members → 3) Finalize → 4) Mark paid. Each step is a tall clickable card with a checkmark when complete.
- Member rows: avatar 40px, name 17px, salary large. Big status pill (draft/finalized/paid).
- Primary action button ("Finalize" / "Mark all paid") sits sticky at the bottom of the card, always 48px tall.

### 5. Invoices (`finance.invoices.index.tsx` + detail)
- List: big status pills, larger customer name, amount right-aligned in bold.
- Detail page: title 28px, customer block enlarged, line items table with 56px rows, totals block on the right stacked and roomy.
- Actions (Issue / Record payment / Download PDF) become a horizontal row of labeled buttons instead of a menu.

### 6. Customers (`finance.customers.tsx`)
- Card grid (2 cols mobile, 3-4 desktop) instead of a dense table; each card shows name, phone, outstanding balance in large type, and a single "Open" button.

### 7. Subscriptions, Reports, Settings
- Same type scale + button sizing; no structural rework.
- Reports: bigger download buttons, plain-language descriptions under each report name.
- Settings: group inputs in labeled cards with more vertical space; save button sticky at bottom.

## Technical section

- Add a scoped stylesheet `src/styles/finance.css` imported once in `src/routes/_authenticated/finance.tsx`, all rules under `.finance-root` so nothing leaks to other pages.
- Wrap the finance `<Outlet />` in `<div className="finance-root">`.
- Introduce shared components (finance-scoped) in `src/components/finance/`:
  - `StatTile.tsx` — KPI tile
  - `QuickAction.tsx` — big 56px labeled action button
  - `SectionCard.tsx` — padded card wrapper
  - `MoneyCell.tsx` — tabular-nums money display with size prop
- Reuse existing `formatMoney`, `StatusPill`, `PriorityPill`, `RoleBadge` — no changes to logic, tokens, or data flow.
- Keep all existing routes, loaders, mutations, and server functions untouched.

## Out of scope
- No color palette change, no logo change, no font swap.
- No changes to database, RLS, server functions, or business logic.
- Non-finance pages (tasks, notes, projects, etc.) are untouched.

## Rollout order
1. Shared CSS + components + layout wrapper.
2. Income → Expenses → Payroll (priority).
3. Overview KPI + quick actions.
4. Invoices (list + detail) → Customers.
5. Subscriptions, Reports, Settings.
