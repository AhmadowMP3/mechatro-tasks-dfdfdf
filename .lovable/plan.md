## Goal
Replace `public/mechatro-dashboard-demo.html` with a standalone HTML file that visually matches the **real** Mechatro Tasks dashboard, dashboard content only (no sidebar/topbar).

## Approach
1. Log into the live preview via Playwright with the seeded tester account, open the dashboard in AR/dark and EN/light, and capture full screenshots + the rendered DOM/CSS of the dashboard region.
2. Read the source of the dashboard route and its child components (hero, filter bar, KPI cards, Task Flow, momentum chart, distribution donuts, overdue list, projects panel, team pulse) to get exact copy, tokens, gradients, and structure.
3. Rebuild `public/mechatro-dashboard-demo.html` as ONE self-contained file that mirrors the real layout section-for-section, using the same:
   - Brand tokens (bg, surface, gold gradient, text hierarchy) pulled from `src/styles.css`.
   - Montserrat / Montserrat Arabic fonts.
   - Section order, headings, icons, chip styles, card shapes, and spacing seen in the screenshots.
   - Mock data that looks realistic (same shape as what's on screen).
4. Keep the existing AR/EN + Dark/Light toggles (persisted in localStorage), RTL flip, and no external JS deps beyond Google Fonts.
5. Verify by opening the new file in Playwright in all 4 combinations (AR-dark, AR-light, EN-dark, EN-light) and comparing side-by-side with the live dashboard screenshots.

## Out of scope
- Sidebar, top user chip, and app shell (user chose "dashboard content only").
- Any behavior beyond the two toggles (no real filtering, no live data).
- Changes to the real app.

## Deliverable
Updated `public/mechatro-dashboard-demo.html` — one file, opens offline, pixel-close to the live dashboard, still served at `/mechatro-dashboard-demo.html`.
