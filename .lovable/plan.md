## Fix: Dark/Light mode contrast bugs

### Root cause
The theme system works (CSS tokens on `:root` / `.light` in `src/styles.css`), but many route/component files use **hardcoded dark hex colors** in inline `style={{ ... }}` instead of the CSS variables. They stay dark navy even after `.light` is applied to `<html>`. Screenshot shows this on the People & Invites card (unreadable dark card + dark text on light background).

### Scope
Highest offenders (by count of hardcoded dark hex literals):
```
access-control.tsx : 49   ← the visible bug
Sidebar.tsx        : 18
auth.tsx           : 13
accept-invite.tsx  : 13
share.$token       :  6
SuspendedScreen    :  6
reset-password     :  4
DatePickerField    :  4
+ smaller (1-3 each): index, activity, team, tasks, reports, reports-history.compare, __root, GenerateReportDialog, KanbanView, FilterBar
```

### Fix approach (mechanical token swap)
Replace hardcoded dark colors with existing CSS tokens so they respond to `.light`:

| Hardcoded | Replace with |
|---|---|
| `#081320`, `#0A1A2B` (bg) | `var(--background)` |
| `#0F2031` (card) | `var(--card)` |
| `#0B1A2A` | `var(--surface-2)` |
| `#13283D` (inputs, tags) | `var(--surface-3)` |
| `#1E364D` (border) | `var(--border)` |
| `#274560` | `var(--border-2)` |
| `#EAF2F9` (text) | `var(--foreground)` |
| `#9FB7C9`, `#86A1B7`, `#8AA3B8`, `#B9CBDA` (muted text) | `var(--muted)` |
| `#189FD1` | `var(--primary)` |
| `#E8732E` | `var(--accent)` |

Also normalize `rgba(255,255,255,.04)` style washes to `var(--surface-2)` or a token that flips in light mode.

### Files edited
Priority order (all in one pass):
1. `src/routes/_authenticated/access-control.tsx` — invite cards, modals, buttons (fixes the screenshot)
2. `src/components/layout/Sidebar.tsx` — user card, badges, edit-name modal
3. `src/routes/auth.tsx`, `src/routes/accept-invite.tsx`, `src/routes/reset-password.tsx` — public auth pages
4. `src/routes/share.$token.index.tsx`, `src/components/SuspendedScreen.tsx`
5. `src/components/DatePickerField.tsx`
6. Remaining files with 1-3 hits (quick pass)

### Verification
- Toggle theme, visit each page, confirm text + card + input contrast in both modes.
- Playwright screenshot of `/access-control` in `.light` + `.dark` to verify the invite card matches theme.
- No functional changes; pure visual token swap.

Estimated 120-160 targeted line replacements, no logic changes.
