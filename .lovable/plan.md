## Make all task fields required

Enforce that every field in the New Task and Edit Task modals must be filled before submission. The Create/Save button stays disabled until the form is valid.

### Required fields (both create + edit)
- Title
- Description
- Project
- Assignee
- Due date
- Priority
- Points reward (admin only, must be > 0)

### Behavior
- **Submit button disabled** whenever any required field is empty/invalid.
- Button re-enables the moment the form becomes fully valid — no toast, no red inline errors (per your choice).
- Same rules apply to the Edit Task modal, so an existing task cannot be saved with a field cleared out.

### Files to change
- `src/components/NewTaskModal.tsx` — compute an `isValid` boolean from all fields; bind it to the submit button's `disabled`. Remove any "optional" hints in labels.
- Edit task modal (whichever component handles editing — likely `TaskDetailModal.tsx` edit mode or a dedicated edit modal) — same `isValid` gating.
- `src/i18n/dict.ts` — drop "(optional)" suffixes from EN/AR labels if present.

### Out of scope
- No DB schema changes (columns already nullable stay nullable; enforcement is client-side on these two forms only).
- No changes to task cards, filters, or other flows.
