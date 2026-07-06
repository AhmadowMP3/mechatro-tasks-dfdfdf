## Simpler payroll wizard — manual by default

Rebuild the payroll creation flow as a **3-step wizard** with big buttons, defaulting to **Manual** mode (no auto-compute from points/tasks unless the admin opts in).

### Steps (down from the current scattered flow)

```text
[1] Period          →  [2] Mode              →  [3] Entries
    Year + Month        MANUAL (default)         Big rows, one per member
    Big month grid      Auto from points         Base / Bonus / Deduct / Net
                        (opt-in)                 Save → creates period + entries
```

- **Step 1 — Period**: 12 large month buttons + year stepper. One tap picks the month.
- **Step 2 — Mode**: two big cards side-by-side.
  - **Manual** (pre-selected, blue highlight, checkmark) — start every row at the member's saved base salary; admin edits freely.
  - **Auto from points** — same behavior as today's Generate (points × rate + allowances).
- **Step 3 — Entries**: one large row per active member with 4 fat inputs (Base, Bonus, Deductions, Net auto). Big **Save payroll** button at the bottom creates the `payroll_periods` row + all `payroll_entries` in one go.

### UX polish

- Sticky footer with **Back** / **Next** / **Save** buttons at ~52px height, brand-blue primary.
- Progress dots (1·2·3) at the top.
- Skips the current two-step flow (create period → open card → click Generate → edit each row in a modal). The admin lands directly on editable rows.
- Existing period cards, entries table, pay-slip PDF, salary settings, finalize/reopen/mark-paid — **untouched**.

### Files

- **Replace** `NewPeriodModal` in `src/routes/_authenticated/finance.payroll.tsx` with a new `NewPayrollWizard` component (same file, keeps imports simple).
- Wizard reuses existing supabase writes: `payroll_periods.insert` then `payroll_entries.insert(rows)`. Manual mode seeds rows from `member_salary_settings` with `points_bonus = 0`; auto mode reuses the current aggregation logic (extracted into a small helper in the same file).
- Add i18n keys to `src/i18n/dict.ts`: `payrollWizardStep1/2/3`, `pickMonth`, `chooseMode`, `manualEntry`, `autoFromPoints`, `manualEntryHint`, `autoFromPointsHint`, `next`, `back`, `savePayroll` — English + Arabic.

### Out of scope

- No DB schema changes.
- Salary settings modal, pay-slip PDF, finalize/paid workflows unchanged.
- No changes outside `finance.payroll.tsx` + `dict.ts`.