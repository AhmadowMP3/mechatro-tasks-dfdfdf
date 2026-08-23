# Full responsive pass — CSS-first, phased

Goal: the whole app works cleanly from 320px to 1920px+ with zero horizontal page scroll, without changing the design language, colors, fonts, or content. No Tailwind is introduced. No redesign.

## Method

- **CSS-first.** All sizing, spacing, and typography scaling happens through media queries and `clamp()` in `src/styles.css`, applied via a small set of shared class names. This works before JS runs, so there is no layout flash.
- **Hooks only for structure.** `useIsMobile` / `useBreakpoint` stay reserved for genuine conditional rendering (dialog → bottom sheet, table → cards). They stop being used to compute style values where a media query can do the job.
- **Inline styles stay.** Markup is only restructured when an element cannot be made responsive with CSS alone. Every such case is reported at the end of its phase.

## Breakpoints and foundation tokens

Mobile-first, matching the requested scale: base (320–639), 640, 768, 1024, 1280, 1536.

Foundation pieces added to `styles.css`:

- Page container class: centered, `max-width` capped, padding 16px → 24px (768) → 32px (1024).
- Fluid type scale via `clamp()` for page titles, section titles, body, and small text — tuned so nothing overflows at 320px.
- Fluid vertical rhythm variables for section padding (tighter on mobile, roomier from 1024).
- Global overflow guard: `html, body { overflow-x: hidden; max-width: 100% }`, plus `min-width: 0` defaults for flex/grid children and `max-width: 100%` on media.
- Image base rule: full width, auto height, no layout shift.
- Safe-area variables for bottom (tab bar), top (sticky header), and left/right in landscape on notched devices.
- 44×44px minimum hit area utility for icon buttons and tab items.
- `prefers-reduced-motion` already exists and is extended to also drop heavy transitions/parallax under 768px.

## Phases

Each phase ends with a stop-and-review, plus a list of every file changed and every element that needed a structural change instead of a CSS-only fix.

**Phase 1a — Foundation only.** `src/styles.css` alone: breakpoints, container, clamp typography, spacing scale, overflow guards, image rules, safe areas, touch-target utility. No page work.

**Phase 1b — App shell, nav, dialogs, table wrappers.**
- `AppShell`: sticky header height/padding via CSS, content bottom padding always equals tab bar height + safe area, scroll containers account for it.
- Sidebar drawer on mobile: body scroll lock while open, close on route change, correct RTL side.
- `MobileTabBar` polish (keeping the bottom tab bar; no hamburger Sheet, no second nav pattern): 44×44 minimum per tab with icon and label inside the tap area, clear route-tied active state, safe-area padding verified in portrait and landscape, centered ~480px rounded bar at 768–1023px, hidden from 1024px up where the desktop sidebar takes over.
- "More" sheet: closes on route change, locks body scroll while open.
- Shared dialog behavior: full-width bottom-sheet presentation below 768px, centered dialog from 768px — implemented once in the shared dialog/modal styling so every modal inherits it.
- Two shared table wrappers built once here and reused later: a scroll container (see Phase 3) and a stacked-card list container.
- Inputs: 16px minimum font size app-wide to stop iOS auto-zoom; `inputMode`/`type` corrected on numeric, tel, email, and date fields as they are touched.

**Phase 2 — Dashboard, tasks, projects, team.**
- Multi-column grids collapse to 1 column base, 2 at 640, 3–4 from 1024.
- Cards go full width on mobile with a consistent gap and uncramped inner padding.
- Header rows with text + widgets use the grid + `min-w-0` + `shrink-0` pattern so titles truncate rather than clip.
- **Tasks table view → stacked cards below 768px**: title as heading, status badge + assignee on one line, due date, primary action; tapping the card opens the task. Sorting, filtering, and row selection keep working. If bulk-select or inline editing cannot survive the card layout, I stop and tell you before changing that table.
- Kanban / member board: horizontal column scroll contained so it never causes page-level overflow.
- Hover-only reveals (assignee hovercards, row action menus) become visible or tappable on touch devices.

**Phase 3 — Finance.**
- Finance lists and payroll keep table shape below 768px inside a horizontal scroll container: `overflow-x: auto`, touch momentum scrolling, sticky first identifier column with a subtle right edge shadow, right-aligned numeric columns using `tabular-nums`, and a right-edge fade affordance that disappears at scroll end. The container scrolls independently and never pushes the page wide.
- Finance summary cards, filter bars, and the invoice detail page reflow to single column on mobile.
- Anything that genuinely reads better as cards below 768px gets flagged to you rather than converted unilaterally.

**Phase 4 — Notes, references, settings, admin.**
- Notes editor: sidebar collapses above content on mobile; toolbar wraps and scrolls instead of clipping.
- References grid and settings sections reflow to single column.
- **Access control → stacked cards below 768px**: user name, role, permissions summary, edit action.
- Long settings forms: labels above inputs on mobile, full-width primary buttons on mobile and auto width from 640px.

## Verification

Every phase is checked with a headless browser at 320, 375, 390, 414, 768, 1024, 1280, 1440, and 1920px, asserting `document.documentElement.scrollWidth <= clientWidth` on each page plus screenshots of the pages touched in that phase.

## Out of scope

PDF/Excel export layouts (print documents, not screen layouts), and any change to colors, fonts, copy, or business logic.
