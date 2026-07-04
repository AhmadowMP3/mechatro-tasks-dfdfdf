# Fix Activity Log filters

## Issues found in `src/routes/_authenticated/activity.tsx`

1. **Action & Entity use `ChipMultiSelect` but store only one value.**
   `onChange={(v) => patchSearch({ action: v[v.length - 1] ?? "" })}` — selecting a second chip silently replaces the first, and the schema only supports a single value. Users expect multi-select on chips.

2. **"Custom" date preset is broken.**
   `datePreset` maps `custom → all` and `DateRangeControl` is called with empty `from`/`to`. Picking Custom does nothing.

3. **Filter drawer "Reset" behaves as "Clear all"** but does not close the drawer or reset `range` back to the default (`7d`) consistently with the top-level reset.

4. **Search `q` runs only on already-fetched page** — subsequent pages via load-more aren't re-filtered when `q` changes mid-scroll (rows reset effect covers it, so this is minor; verify).

5. **User filter cannot be cleared from inside the drawer** — `FilterSelect` has no explicit "All users" clear affordance beyond the placeholder; confirm the empty option resets to `""`.

## Plan

### A. Multi-select for Action and Entity
- Extend URL schema: `action` and `entity` become comma-separated strings (kept as `string` in the URL, parsed to `string[]`).
- Query: use `.in("action", arr)` / `.in("entity_type", arr)` when array non-empty.
- Chips row: render one chip per selected value with individual remove.
- `ChipMultiSelect` bound to full array (not last-only).

### B. Fix Custom date range
- Add `from` and `to` (ISO date) to the search schema.
- `datePreset` returns `"custom"` when `from`/`to` present; otherwise the existing mapping.
- On `DateRangeControl` change, patch `{ range: "all", from, to }` for custom; clear `from`/`to` when a preset is chosen.
- Query uses `from`/`to` when present, else `rangeSince(range)`.

### C. Reset polish
- Drawer Reset → clears filters AND sets `range: "7d"`, `from/to: ""`, then closes drawer.
- Top-bar Reset unchanged (already resets to defaults).

### D. Guardrails
- Keep the existing free-text `q` client-side filter.
- Keep RTL/i18n strings; add no new dict keys (reuse existing).
- No schema/DB changes. Frontend-only.

## Files touched
- `src/routes/_authenticated/activity.tsx` (only)

## Verification
- Typecheck.
- Manually: pick 2 actions + 2 entities → both applied; pick Custom date → results honor range; individual chip remove works; Reset restores defaults.
