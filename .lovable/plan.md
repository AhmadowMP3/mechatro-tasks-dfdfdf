## Fix build + make selected filter pills clearly stand out

### 1. Fix build failure in `src/styles.css`
Line 106 is missing a closing `}` after `background: transparent;`, so every rule below it (`.light`, `@layer base`, …) is swallowed. Close the `*::-webkit-scrollbar-corner` rule properly.

### 2. Stronger selected state — `src/components/dashboard/FilterBar.tsx`
Right now the selected chip is a faint tinted background with blue text — hard to tell apart from unselected. Make it a solid gradient pill so it visibly pops (matches the screenshot request).

For the range pills (loop starting line 85), when `selected` is true, replace the subtle style with:
- `background: var(--grad-blue)` (solid Mechatro blue gradient)
- `color: #fff`
- `border: 1px solid transparent`
- `box-shadow: 0 4px 14px color-mix(in oklab, var(--brand-blue) 35%, transparent)`
- `transform: translateY(-1px)`

Apply the same solid-gradient treatment to the `MultiSelect` trigger button (around line 230) when `active` is true, and inside the dropdown to items where `on` is true — use gradient background + white text + a white ✓ checkbox instead of the current 12% tint.

Unselected pills stay as they are (`var(--surface-2)` + `var(--border)`).

No other files or logic change.