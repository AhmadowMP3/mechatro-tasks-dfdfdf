## Custom Mechatro Cursor

Replace the default OS cursor site-wide with a branded, animated cursor that matches the Mechatro identity (blue + gold, dark surface).

### Design
- **Default cursor**: a small solid gold dot (Mechatro Gold, 6px) with a larger outlined ring (blue, 22px) trailing it smoothly. Ring uses `var(--grad-blue)` border tint, dot uses `var(--grad-gold)`.
- **Hover state** (over links, buttons, `[role=button]`, `.brand-btn`, kanban cards, inputs): ring expands to 34px, becomes a subtle blue glow, dot stays gold and centers.
- **Active/click state**: ring contracts (18px) with a quick pulse.
- **Text inputs / textareas**: cursor switches to a themed I-beam (thin gold vertical bar) so typing still feels natural.
- **Disabled elements**: ring turns muted gray, dot hides.
- **RTL**: cursor is direction-agnostic — no changes needed.
- **Mobile / touch**: fully disabled via `@media (hover: none) and (pointer: coarse)` so touch devices keep native behavior.
- **Reduced motion**: trailing lerp is removed; ring snaps to pointer without smoothing.

### Implementation
1. **New component** `src/components/CustomCursor.tsx`
   - Two fixed-position divs (`.cursor-dot`, `.cursor-ring`) appended to body.
   - `requestAnimationFrame` loop lerps ring position toward mouse (dot follows 1:1).
   - Listens to `mousemove`, `mousedown`, `mouseup`, `mouseover`/`mouseout` to toggle `is-hover`, `is-active`, `is-text`, `is-disabled` classes based on `event.target.closest(...)`.
   - Skips render if `matchMedia('(hover: none)')` matches or `prefers-reduced-motion` limits animation.
   - Hides on `mouseleave` of window; shows on re-enter.

2. **Global styles** in `src/styles.css`
   - Add `html, body, * { cursor: none; }` (with fallback `cursor: auto` inside the touch media query).
   - Keep `cursor: text` fallback for inputs so users without JS still see the caret.
   - Style `.cursor-dot` and `.cursor-ring` with brand tokens, `mix-blend-mode: normal`, `pointer-events: none`, `z-index: 9999`, transform-based positioning, and `transition` for size/opacity only (position handled by rAF).

3. **Mount** in `src/routes/__root.tsx` inside the root layout so it appears on every route (auth pages included).

### Guardrails
- No changes to routing, data, or business logic.
- No new dependencies — plain React + CSS.
- Fully removable by unmounting `<CustomCursor />` and reverting the `cursor: none` rule.

### Technical notes
Files touched:
- `src/components/CustomCursor.tsx` (new)
- `src/styles.css` (add cursor styles + hide native cursor)
- `src/routes/__root.tsx` (mount component once globally)
