## Remove progress slider from Task Detail modal

Delete the "Progress: X%" label and its range slider from `src/components/TaskDetailModal.tsx` (the block around lines 278-287, currently rendered between the fields grid and the description).

### Scope
- Remove only the progress UI (label + `<input type="range" />`).
- Keep the underlying `progress` column and any auto-progress logic (status changes, etc.) untouched — this is a UI-only removal.
- No changes to task cards, dashboard, or other places that display progress.
