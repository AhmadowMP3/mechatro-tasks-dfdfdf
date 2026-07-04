## Goal

Do a full audit + polish pass on (1) Arabic/English translations across the app and (2) light/dark mode styling, so both feel consistent and premium.

## Part 1 — i18n audit (AR + EN)

Sweep every user-facing string and fix gaps:

- **Scan targets**: all routes under `src/routes/`, components under `src/components/`, dialogs/modals (Task, Member, Report, PdfWizard, ThemePicker), sidebar/nav, toasts, empty states, buttons, form labels/placeholders, table headers, badges (status/priority), report + Excel export labels.
- **Find hardcoded strings**: any literal English text in JSX or `toast(...)` calls that isn't going through the i18n dict.
- **Extend `src/i18n/dict.ts`**: add every missing key in both `en` and `ar`. Group by area (nav, tasks, members, reports, exports, wizard, toasts, common).
- **RTL correctness**:
  - `dir="rtl"` applied on `<html>` when lang is Arabic.
  - Fix icon/chevron directions, margins (`ms-*`/`me-*` instead of `ml-*`/`mr-*` where they flip meaning), text alignment, and flex ordering for RTL.
  - Numerals: keep Latin digits for stats (`ar-EG-u-nu-latn`) but Arabic labels.
- **Language switcher check**: make sure toggling instantly re-renders everything, persists choice, and applies `dir` + font swap.
- **Exports**: verify Excel sheet titles, headers, member sheet names, and PDF report sections all translate (including the 3 themes' cover pages, footers, KPI labels, chart captions).

Deliverable: no visible English text when AR is selected, no visible Arabic text when EN is selected, and RTL layout is clean.

## Part 2 — Light / dark mode polish

Audit both modes and elevate the weaker one:

- **Token audit in `src/styles.css`**: review `--background`, `--foreground`, `--card`, `--muted`, `--border`, `--primary`, `--accent`, ring, and shadow tokens for both `:root` and `.dark`. Ensure contrast ratios pass, and that the dark palette isn't just an inverted light mode — give it depth (layered surfaces, subtle gradient on top-level backgrounds, soft glow on primary).
- **Hunt hardcoded colors**: grep for `text-white`, `bg-black`, `bg-white`, `text-black`, `bg-[#…]`, `text-[#…]` in components and replace with semantic tokens.
- **Component sweep**: sidebar, top bar, cards (task/member/project), dialogs, dropdowns, tables, badges, buttons, inputs, toasts, empty states, tooltips, Reports hub, PdfWizard preview, ThemePicker cards. Check hover / focus / active / disabled states in both modes.
- **Theme toggle**: verify smooth transition (no flashes), persisted, and that system preference is respected on first load.
- **Charts + report previews**: ensure recharts + embedded PNG charts (Excel) read well in both modes when viewed inside the app preview.
- **Focus rings + selection**: consistent ring color per mode, visible on both.

Deliverable: both light and dark feel intentional and polished, no orphaned hardcoded colors, no low-contrast text.

## Technical notes

- Files likely touched: `src/i18n/dict.ts`, `src/i18n/*`, `src/styles.css`, `src/routes/_authenticated/*.tsx`, `src/components/**`, `src/lib/report/themes.ts` (label strings), `src/lib/export/xlsx-workbook.ts` (sheet/header labels), `src/lib/report/team-report.ts` + `report-html.ts` (section titles).
- No DB / backend / schema changes.
- No new dependencies expected.

## Out of scope

- Adding a third language.
- Rebuilding the theme system or introducing new named themes (the 3 report themes stay as-is).
- Redesigning components beyond color/spacing/direction fixes.
