## One-Style "Dashboard Card" Report — Clean, No Overlap, Side-by-Side AR/EN

### The Direction (locked, no more theme picker)
Editorial dashboard aesthetic: light-grey page background (`#F5F6F8`), pure white rounded cards with soft shadows, cyan `#42C2EE` + gold `#D4A017` accents, big display numbers, section titles with a colored icon tile. Feels like a Notion / Linear export.

### Fixes for the issues in your screenshots
1. **Overlapping "MECHATRO · REPORT" and empty square** → replace with a real page header: 24px Mechatro wordmark on the left, small logo mark on the right (embedded as a base64 SVG so it always renders, no missing-image square).
2. **Truncated Arabic titles** like `الرسوم الب...` → give card titles `overflow: visible`, `line-height: 1.4`, and enough vertical padding.
3. **Duplicated repeating rows in activity log** → cap at **last 25 entries**; single unified list (no more re-drawing the same 25 rows on continuation pages).
4. **Activity log bleeding into footer / "Activate Windows" bleed** → the OS watermark is on the user's screen, not the PDF, but the actual footer overlap is real. Fix: activity log rendered as chunked table blocks in the block packer with a proper reserved footer band.
5. **Chart labels overlapping bars** → bar chart gets fixed 240pt height, min 32px gap between label and bar, category labels rotated only when > 6 items.
6. **Bilingual duplication** → new **side-by-side layout**: each section renders as a two-column card, Arabic (RTL) on the right, English on the left, separated by a hairline. One physical page per section instead of two full docs.

### PDF Structure (executive length — 3 pages)
```
┌────────────────────────────────────────────┐
│ Page 1 — Cover                             │
│  ▪ Header: mechatro wordmark + logo mark   │
│  ▪ Big member name (72pt) + AR name below │
│  ▪ Role / status chips                     │
│  ▪ Period range                            │
│  ▪ 4 KPI cards: TOTAL / DONE / ON-TIME / HRS │
│  ▪ Footer: page 1/3 · mechatro@…           │
├────────────────────────────────────────────┤
│ Page 2 — Performance                       │
│  ▪ Activity-over-time card (line)          │
│  ▪ Status breakdown card (donut)           │
│  ▪ Projects card (top 5, per-project bars) │
├────────────────────────────────────────────┤
│ Page 3 — Detail                            │
│  ▪ Tasks card (compact table, ≤14 rows)   │
│  ▪ Sessions card (compact table, ≤10 rows)│
│  ▪ Activity log card (last 25 entries)    │
└────────────────────────────────────────────┘
```
When content overflows a page, the block packer flows into a page 4 without breaking a card mid-row. Header + footer painted natively by jsPDF on every page.

### Bilingual on the same page — how it renders
Every card body is a 2-column grid inside the card:
```
┌─────────── card ───────────┐
│ 🎯 STATUS BREAKDOWN        │
│ ─────────────────────────  │
│ [EN column]  │  [AR column]│
│ On-time 100% │ في الموعد 100% │
│ Done      1  │ منجزة     ١  │
└────────────────────────────┘
```
Numbers/data render once (center); labels are bilingual under each. Long text sections (tasks list) get a language column each side of a divider.

### What changes in code

**Delete:**
- `src/lib/report/themes.ts` — no more themes.
- Theme picker in `src/components/team/GenerateReportDialog.tsx` (the 4-card grid + `theme` state).
- The old dual-doc `buildBilingualHtml` else-branch in `report-html.ts`.

**Rewrite:**
- `src/lib/report/report-html.ts` → single `buildDashboardBlocks(data)` returning `{ cover: string; blocks: { html: string; keepWithNext?: boolean }[] }`. All cards use the fixed dashboard style. Each content card is a bilingual 2-column card.
- `src/lib/report/generator.ts` → keep the block-packer + native header/footer approach from the last pass. Header: 56pt band with base64 logo + "MECHATRO · Member Report / تقرير العضو". Footer: 44pt band with `mechatro @ mechatro.hub4tech.net` + `page X / Y` + hairline. Activity log capped to 25 rows in the block builder.

**Untouched:**
- `src/lib/report/data.ts`, `snapshot.ts`, `team-report.ts`, `comparison-html.ts` — data collection unchanged.
- The `Bilingual (AR+EN)` / `Arabic only` / `English only` language picker is kept.

### Order of operations (all in build mode)
1. Rewrite `report-html.ts` as single-style bilingual side-by-side.
2. Update `generator.ts` header/footer to native jsPDF paint with embedded logo.
3. Simplify `GenerateReportDialog.tsx` — remove theme grid + state, delete i18n keys `themeCreative`/`themeAurora`/`themeExecutive`/`themeMinimal` and their `*Desc` counterparts.
4. Delete `themes.ts`.
5. Typecheck.
6. Generate a sample PDF via Playwright against localhost, rasterize each page, view every image, and iterate until no overlap / no cut text / no missing logo.

### Out of scope
- Editing the app's Team page UI (dialog copy stays the same minus the theme grid).
- Changing what data is collected (`data.ts`).
- New fonts (keep the Arabic web font already loaded).

Awaiting approval to switch to build mode.