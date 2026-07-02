## Goal

When an admin creates a task, the **start date is captured automatically in real time** (the moment of creation) and the admin only picks the **due date**. Make the creation experience feel polished and "alive."

## Changes

### 1. Auto start date on creation
- In `NewTaskModal.tsx`, drop the start-date input entirely and set `start_date: new Date().toISOString()` in the insert payload.
- Add a small live "clock chip" at the top of the modal showing the current date + time (updates every second) with a label like "Starts now / يبدأ الآن" — visual cue that the task begins the instant it's created.

### 2. Due-date experience (the "cool" part)
Replace the plain `<input type="date">` with a richer picker block:
- **Quick-pick chips** above the date field: Today, +1 day, +3 days, +1 week, +2 weeks, End of month. One click fills the due date.
- **Live duration readout** below the field: "Duration: 5 days • ends Sat, Jul 12" (bilingual, uses existing `formatDate`).
- **Color-coded urgency ring** around the date field: green (>7d), amber (3–7d), orange (1–2d), red (same day/overdue) — matches existing `PRIORITY_STYLES` gradients.
- Validation: due date must be ≥ today; disallow past dates in the picker (`min` attr).

### 3. Task detail modal
- Show `start_date` prominently as "Started: <relative time> ago" using existing `relativeTime` helper, alongside due date.

### 4. Timeline visual on task cards (small touch)
- On `TaskCard`, add a thin gradient progress bar underneath the title showing elapsed time between `start_date` and `due_date` (percent through the window). Purely visual, uses brand gradient tokens.

### 5. i18n
- Add keys to `src/i18n/dict.ts`: `startsNow`, `quickPick`, `today`, `plusDays`, `plusWeek`, `plusTwoWeeks`, `endOfMonth`, `duration`, `endsOn`, `startedAgo`.

## Out of scope
- No schema changes (`start_date` column already exists).
- No changes to Kanban/Table/Calendar views' business logic — they'll simply benefit from `start_date` being always populated.
- Edit-task flow unchanged (start_date stays immutable after creation).

## Technical notes
- All new UI uses existing design tokens (`var(--grad-*)`, `PRIORITY_STYLES`, `Field`, `inp`) — no new dependencies.
- Live clock uses a single `useEffect` + `setInterval(1000)` cleaned up on unmount.
- Duration math done client-side with plain `Date` diffs; formatted via existing `formatDate` / `toLocalDigits`.
