## Goal
On mobile, the "Table" view of tasks currently renders `TaskCard`s — identical to the "Cards" view. Make the Table view stay a real table on mobile so the two view modes are visually distinct.

## Change (single file)

**`src/components/tasks/TableView.tsx`**
- Remove the mobile `TaskCard` fallback (lines 26 + 68-88): drop `useIsMobile` import/usage and the `if (isMobile) { return ... }` branch.
- Keep the existing horizontally-scrollable table (`overflowX: "auto"` on the wrapper, `minWidth: 720` on the table) so on narrow screens the user swipes sideways to see all columns.
- To make the compact table friendlier on mobile without changing the desktop look, tighten only cell padding at the mobile breakpoint via inline media in a small `<style>` block scoped to the table wrapper, OR keep as-is if legibility is acceptable — proposal: keep padding as-is; the horizontal scroll is enough to differentiate views.

## Out of scope
- No changes to the Cards view, Kanban view, filters, sort, or `TaskCard` itself.
- No column removal — all columns remain accessible by horizontal scroll.

## Verification
- On mobile (`/tasks` with view=Table): a real table renders with horizontal scroll; view=Cards renders the card grid. The two look clearly different.
- Desktop table view is unchanged.
