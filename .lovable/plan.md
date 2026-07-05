## Problem
In the tasks grid, cards with a points badge grow taller than cards without, because the points chip joins the pills row and forces `flex-wrap` to a second line. Cards without points stay one line. Result: inconsistent card heights inside the same row.

## Change (single file)

**`src/components/TaskCard.tsx`**

1. Remove the points chip from the pills flex row (lines 58–66).
2. Add `position: "relative"` to the card `<button>` wrapper.
3. Render the points chip as an absolutely-positioned badge at the top-inline-end corner of the card (outside the pills flow), so its presence never affects the header row height:
   - `position: absolute; top: 10px; insetInlineEnd: 10px; zIndex: 2`
   - Same visual styling as today (gold gradient when awarded, orange-red gradient when pending, star + number).
4. Reserve horizontal space so long project names don't slide under it: add `paddingInlineEnd: 56px` to the pills row (only when there is space to spare it visually stays clean; the badge sits on top).

Also, to guarantee equal heights across a row regardless of pill wrap or title length:

5. Ensure the card fills its grid cell: add `height: "100%"` to the `<button>` style so the auto-fill grid rows stretch consistently.

## Out of scope
- No layout changes to the grid container in `tasks.tsx`.
- No changes to Kanban / Table views (points already render differently there).
- No changes to points logic, colors, or awarding behavior.

## Verification
- Row of mixed cards (some with points, some without) shows equal heights.
- Points badge stays visible at the top corner and does not overlap the title.
- RTL and LTR both look correct (uses `insetInlineEnd` / `paddingInlineEnd`).
