## Goal
Replace the plain category `<input list>` in the References add/edit modal with a **cool creative CategoryCombobox** — pick an existing category as a chip, or freely type a custom one. Works for both create and edit flows.

## What changes (frontend only, References page)

### New component: `CategoryCombobox`
Local to `src/routes/_authenticated/references.tsx` (no new files needed).

**Behavior**
- Single text input that doubles as filter + custom-entry.
- Below/inside the field: a horizontal **chip cloud** of existing categories (from the current `categories` prop). Clicking a chip selects it.
- As the user types:
  - Chips filter live to matches.
  - If no exact match exists, a highlighted **"Create '{typed}'"** chip appears with a `Plus` icon and gold gradient — pressing Enter or clicking it commits the custom value.
- Selected category shows as a **big pill at the top of the field** with a gradient border, a category icon (`Tag` lucide), and an `X` to clear.
- Keyboard: Enter creates/selects, Backspace on empty input clears the selected pill, Escape closes suggestions.
- Each existing chip gets a **deterministic accent color** derived from a hash of its name (cycled through the brand palette: blue, gold, purple, green, coral) so the cloud looks alive but stable.

**Visual polish**
- Rounded 14px container, `var(--surface-2)` background, 1px border that shifts to `var(--brand-blue)` on focus with a soft glow (`box-shadow: 0 0 0 3px color-mix(...)`).
- Chips: 999px radius, 11px font, subtle scale on hover, tinted background from the derived accent.
- Selected pill: gradient background (`var(--grad-gold)` when custom / new, `var(--grad-blue)` when picked from existing), 13px bold.
- Small helper line under the field: "اختر أو اكتب فئة جديدة" / "Pick one or type your own".
- Fully RTL-safe (uses `insetInlineStart/End`, flex gaps, no hard left/right).

### Wiring
- Replace lines 536–541 (the `<Field label={tt("category")}>` block) with `<CategoryCombobox value={category} onChange={setCategory} options={categories} lang={lang} t={tt} />`.
- Keep `category.trim().slice(0, 60) || null` normalization on save — no schema/DB changes.
- Add two dict keys used by the helper text: `categoryHint`, `createCategory` (AR + EN) in `src/i18n/dict.ts`.

## Non-goals
- No DB migrations, no new tables, no changes to filtering on the main page (the top-of-page category filter stays as-is unless you want it upgraded too — say the word).
- No changes outside the References route + one dict addition.

## Files touched
- `src/routes/_authenticated/references.tsx` — add `CategoryCombobox` component, swap the field.
- `src/i18n/dict.ts` — 2 new keys (AR + EN).