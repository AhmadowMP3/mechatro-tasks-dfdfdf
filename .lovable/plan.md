## Themed date picker for New Task modal

The native `<input type="date">` shows an almost-invisible white calendar glyph on the dark surface, and clicking it opens the browser's default (unstyled) calendar. Replace it with a branded picker that matches Mechatro's dark blue + gold theme.

### 1. New component `src/components/DatePickerField.tsx`
- Trigger button styled like the current input: dark `var(--surface-2)` fill, `var(--border)` outline, rounded 10px, min-height 42, brand-blue focus ring.
- Left side shows the selected date formatted via `formatDate(..., lang)` (falls back to placeholder in muted color); right side shows a **CalendarDays** lucide icon in `var(--brand-gold)` so it's clearly visible on dark.
- Clicking opens a popover (absolute-positioned, RTL-aware via `insetInlineStart/End`) with:
  - Header row: month/year label + prev/next chevrons + "Today" chip (uses `var(--grad-blue)` accent).
  - Weekday row (Sun–Sat or الأحد–السبت based on `lang`), muted small caps.
  - 6×7 day grid. Selected day: gradient blue pill with white text. Today: gold ring. Hover: `var(--surface-3)`. Disabled (before `min`): 30% opacity, not clickable.
  - Panel: `var(--surface-1)` bg, `var(--border)` 1px, 14px radius, soft shadow.
- Closes on outside click (fixed overlay), Escape, or day select.
- Props: `value: string` (YYYY-MM-DD), `onChange(v)`, `min?: string`, `lang`, `placeholder`.

### 2. Wire into `src/components/NewTaskModal.tsx`
- Replace the `<input type="date">` block (lines 167–173) with `<DatePickerField value={form.due_date} min={minDate} onChange={(v) => setForm({ ...form, due_date: v })} lang={lang} placeholder={t("pickDate")} />`.
- Keep the surrounding urgency ring wrapper, quick-pick chips, and duration readout untouched.
- Add `pickDate` string to `src/i18n/dict.ts` ("اختر التاريخ" / "Pick a date").

### Out of scope
- New Project modal, task edit modal, and filter date inputs — not mentioned. Can extend later if desired.