# Standalone Dashboard Export for Client

Create a single self-contained HTML file the user can email to their client. Opens in any browser, no backend, no build step.

## Deliverable

`public/mechatro-dashboard-demo.html` — one file, inline CSS + JS, ~40KB. The user can download it from the preview at `/mechatro-dashboard-demo.html` or grab it directly from the project. No external requests except Google Fonts for Montserrat.

## What it renders

A faithful, static reproduction of the live Dashboard using believable mock data:

1. **Hero card** — greeting, current date, live ticking clock, and the four chips (Live Now, Hours Tracked, Streak, Time).
2. **Filter bar** — visual only (Today / 7d / 30d / 90d / All), styled with the active gradient state.
3. **Four stat cards** — Active Tasks, Done This Week (with sparkline), Overdue, Active Projects.
4. **Momentum bar chart** — 30 pre-seeded daily buckets, today highlighted in blue→green gradient.
5. **Task Distribution donut** — todo / in progress / paused / done with legend.
6. **Overdue list** — 4 mock rows with the red pill.
7. **Top Projects** — 5 rows with progress bars.
8. **Workload by Owner** — 6 teammates with avatars (initial circles) and counts.
9. **Recent Activity** — 10 mock entries with colored dots and relative times.

## Toggles (top-right of hero)

- **Language**: AR (RTL, default) ↔ EN (LTR). Flips `dir`, swaps every label from an inline dictionary, converts digits to Arabic-Indic when AR.
- **Theme**: Dark (default) ↔ Light. Toggles a `data-theme` attribute on `<html>`; CSS vars swap.

Both persist to `localStorage` so the client's next open remembers their choice.

## Design fidelity

- Colors: exact Mechatro tokens — `--brand-blue #42C2EE`, `--brand-green #73C94E`, `--brand-orange #E8A82C`, dark surfaces `#0B0F14 / #121821 / #1A2130`, light surfaces `#F7F8FA / #FFFFFF / #EEF1F5`, danger `#F0676A`.
- Fonts: Montserrat (Latin) + Montserrat Arabic via Google Fonts `<link>` in `<head>`.
- Gradients: `linear-gradient(135deg,#42C2EE,#73C94E)` for blue-green, plus the orange and red gradients used on stat cards.
- Custom scrollbars, branded radial glows, subtle card borders — all inline in a `<style>` block.
- Sparkline + donut + bars rendered inline as SVG (no chart libs).

## Technical notes

- Pure HTML/CSS/vanilla JS — no React, no bundler, no fetch calls.
- ~600 lines total, heavily commented in English so a developer can hand it off.
- File placed under `public/` so it's served verbatim by Vite and included in the published build; the user gets a shareable URL `https://mechatro-flow.lovable.app/mechatro-dashboard-demo.html` in addition to the raw file.

## Out of scope

- No login, no other pages (Projects/Tasks/Team/etc.), no real DB access, no PDF export. This is a visual demo of the Dashboard only, as requested.
