## Scope

Improve accessibility on the sidebar section chevrons and active nav items in `src/components/layout/Sidebar.tsx`. Presentation and behavior unchanged.

## Current state

- Section header buttons already have `aria-expanded` and a bilingual `aria-label`.
- The collapsible list of items below each header is **not linked** to its header (no `aria-controls` / `id`), so screen readers can't associate them.
- Active nav `<Link>` items are styled but have **no `aria-current="page"`**, so assistive tech can't announce the current route.
- The `<nav>` has no accessible name.
- Arrow-key roving between sidebar items isn't wired up; users must Tab through every item.

## Changes (single file: `src/components/layout/Sidebar.tsx`)

1. **Name the nav landmark**
   `<nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Main navigation"}>`.

2. **Wire chevron ↔ panel with ARIA**
   - Give each section's items container a stable `id`, e.g. `sidebar-section-${section.titleKey}`, and wrap the mapped `<Link>`s in a `<div id=... role="group" aria-label={sectionLabel}>` that is always rendered (use `hidden` when collapsed instead of conditional mount) so `aria-controls` targets a real node.
   - Add `aria-controls={panelId}` to the header `<button>`.
   - Keep existing `aria-expanded` (currently reflects `!isCollapsed`, correct).
   - Improve label wording: base label = section name; announce state via `aria-expanded` alone (screen readers already speak "expanded/collapsed"). Drop the redundant "expand/collapse" suffix from `aria-label` so it's not double-announced.

3. **Active item semantics**
   - On each nav `<Link>`, add `aria-current={active ? "page" : undefined}`.
   - Keep the existing visual active state; no style changes.

4. **Keyboard navigation on section headers and items**
   - On the header button `onKeyDown`:
     - `ArrowDown` → focus first item of this section (or first header if collapsed).
     - `ArrowUp` → focus last focusable item of previous section (or previous header if that section is collapsed).
     - `Home` / `End` → focus first / last section header.
     - `Enter` / `Space` → already toggle (native button behavior — no change).
   - On each item `<Link> onKeyDown`:
     - `ArrowDown` → next item in section, or next section's header if last.
     - `ArrowUp` → previous item in section, or this section's header if first.
   - Implement via `data-sidebar-nav` attributes on both headers and links plus a small `onKeyDown` handler that queries the sidebar for `[data-sidebar-nav]` in DOM order and moves focus. No route changes on arrow keys — only focus movement. `Tab` behavior is preserved.

5. **Focus visibility**
   - Add a `:focus-visible` outline (`outline: 2px solid var(--ring, #1D9BF0); outline-offset: 2px`) via inline `onFocus`/`onBlur` handlers or a small `<style>` block scoped by a class on the sidebar root, so keyboard focus is clearly visible on both headers and links (currently no explicit focus ring on the inline-styled elements).

## Out of scope

- No visual/layout redesign, no i18n dict additions beyond the two `aria-label` strings inlined above, no changes to the "Edit name" modal, mobile drawer, footer, or any other component.
- No routing changes: arrow keys only move focus, they never navigate.
- RTL: focus order follows DOM order, which already matches the visual reading order in both `ltr` and `rtl` (the header uses `flex-direction: row-reverse` only for visual layout).

## Verification

- Typecheck clean.
- Keyboard-only pass in the preview: Tab into the sidebar → arrow keys move between headers and items → Enter on a header toggles → Enter on a link navigates → active route announces as "current page".
- Screen-reader spot check (VoiceOver rotor / NVDA browse mode): each section header announces its name + expanded/collapsed state and controls its panel; each item announces as a link with "current page" on the active route.