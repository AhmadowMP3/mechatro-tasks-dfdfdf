## Goal

Full-app mobile polish pass at 390×844 (iPhone). Systematically find and fix every mobile-only issue, then screenshot each authenticated page before/after so you can see the pipeline results.

## Pipeline (executed in build mode)

### Phase 1 — Capture "before" baseline
Playwright at 390×844, signed in, capture every authenticated route:
Dashboard, Projects list, Project detail, Tasks, Team, League, References, Notifications, Activity, Reports, Reports history, Access control, Share links, Settings, plus Task detail modal and Sidebar drawer.

Save under `/tmp/browser/mobile-before/`.

### Phase 2 — Diagnose
For each screenshot, log every issue in one of these buckets:
- **Horizontal overflow** (page or card scrolls sideways)
- **Text overflow / clipping** (headings, badges, chips)
- **Tap targets < 44×44** (icon buttons, chevrons, tab pills)
- **Cramped headers** — grid+min-w-0+shrink-0 pattern missing
- **Tables** that need a horizontal-scroll wrapper or card-list swap
- **Modals/dialogs** that don't fit — need `max-h-[90dvh]` + inner scroll
- **Safe-area** — bottom tab bar / floating action buttons over iOS home indicator
- **Sticky header + drawer** — z-index / scroll-lock issues
- **RTL sanity** — Arabic direction still correct

### Phase 3 — Fix in a single pass
Apply targeted edits per file. Guardrails:
- Header rows → `grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex` + `min-w-0` on text col + `shrink-0` on avatars + `truncate` on titles
- Icon-only buttons → `min-h-11 min-w-11` + `aria-label`
- Wide tables → wrap in `overflow-x-auto` OR switch to a stacked card list under `sm:`
- Every dialog/sheet → `max-h-[90dvh] overflow-y-auto` on content, sticky footer
- Bottom-safe padding via `pb-[calc(72px+env(safe-area-inset-bottom))]` on scroll containers where the mobile tab bar overlaps
- Section cards → tighter mobile density (`p-3 sm:p-5`, `text-sm sm:text-base`)
- Sidebar drawer → make sure backdrop click closes, prevent body scroll while open
- Never change desktop behavior — mobile-only changes gated at `sm:` breakpoint or `useIsMobile()`

Files most likely touched (list is illustrative, not exhaustive — will only edit what actually needs fixing):
- `src/components/layout/AppShell.tsx`
- `src/components/layout/PageHeader.tsx`
- `src/components/layout/MobileTabBar.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/TaskDetailModal.tsx`
- `src/routes/_authenticated/{index,tasks,projects,projects.$id,team,league,references,notifications,activity,reports,reports-history,reports-history.compare,access-control,share-links,settings}.tsx`
- Small CSS additions in `src/styles.css` if a reusable utility is needed (safe-area helper, no-scroll body)

### Phase 4 — Verify
Playwright again at 390×844 across the same routes → `/tmp/browser/mobile-after/`. Diff visually. Fix any regressions. Confirm typecheck (`tsgo`) passes clean.

### Phase 5 — Deliver
Compose a single **before/after mobile audit** contact-sheet PNG (grid of thumbnails) into `/mnt/documents/mobile-audit.png`. Reply with the artifact and a short bullet list of the categories fixed.

## Out of scope

- No feature changes, no backend/RLS, no auth flow, no i18n additions unless a fix needs a new key.
- No visual redesign — this is polish/correctness. If a page needs a redesign (not just a fix), I'll flag it in the final report rather than silently overhauling it.
- No PWA / service worker changes (already handled).

## Verification bar

- Zero horizontal scroll on any authenticated route at 390×844
- All interactive icon buttons ≥ 44×44 with accessible names
- No text clipped on the primary headings, task/project cards, notification rows
- Task detail modal fully usable on mobile (scroll, close, share, save Drive link)
- Sidebar drawer opens, closes on backdrop click, doesn't leak body scroll
- Bottom tab bar clears the iOS home indicator via `env(safe-area-inset-bottom)`
- `bunx tsgo --noEmit` green
