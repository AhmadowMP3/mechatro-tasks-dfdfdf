## Goal
Task cards without a points badge appear slightly shorter than cards with one, breaking the grid alignment. Make all task cards render at the same height.

## Change (single file)
**`src/components/TaskCard.tsx`** — line 58-66, the conditional points pill:
- Keep the visible pill when `(task.points ?? 0) > 0`.
- When there are no points, render an invisible placeholder span with the same padding, font-size, and border-radius as the points pill (`visibility: hidden`, `aria-hidden`, `marginInlineStart: "auto"`), containing a non-breaking space "⭐ 0", so the pills row reserves the same height/width contribution.

## Out of scope
- No changes to points logic, colors, or the visible pill for tasks that do have points.
- No changes to grid layout on `tasks.tsx`.

## Verification
- On `/tasks`, cards with and without points sit at identical heights across the grid.
- Points pill still shows correctly for tasks that have points.
