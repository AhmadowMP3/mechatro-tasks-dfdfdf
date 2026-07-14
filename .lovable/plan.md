## Fix Finance KPI number overflow

**Problem**: On the finance dashboard, large numbers (e.g. `520,000,000.00 SYP`) overflow the KPI card and get visually clipped at the right edge.

**Root cause**:
- `.kpi-value` has `font-size: 28px` and no wrapping rules, so long money strings render on a single line and overflow the card.
- The grid uses `minmax(200px, 1fr)` — too narrow for 9–12-digit currency strings at 28px.

**Changes** (presentation only, no logic touched):

1. `src/styles/finance.css` — `.finance-root .kpi-value` (base, ~line 94):
   - Reduce `font-size` from `28px` to `24px`.
   - Add `overflow-wrap: anywhere;` and `word-break: break-word;` so the number+currency can wrap gracefully inside the card instead of clipping.
   - Add `font-variant-numeric: tabular-nums;` for cleaner digit alignment.

2. `src/routes/_authenticated/finance.index.tsx` (line 201) — widen the KPI grid track:
   - Change `minmax(200px, 1fr)` → `minmax(240px, 1fr)` so each card has more room before wrapping and layout stays balanced.

No changes to KPI calculations, formatting, currency conversion, or card structure.
