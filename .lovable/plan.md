## Fix duplicate sidebar on Report History

**Root cause.** The `_authenticated` layout route already wraps every authenticated page in `<AppShell>` (which renders the Mechatro sidebar + top bar). Both `reports-history.tsx` and `reports-history.compare.tsx` also wrap their own content in `<AppShell>` — so the shell renders twice, producing the nested sidebar shown in the screenshot. Earlier turns stripped the wrappers on these files, but they were re-added.

**Fix.** Remove the redundant `<AppShell>` wrappers from both report-history route files so they render just their page content — matching every other page under `_authenticated/`.

### Changes

1. `src/routes/_authenticated/reports-history.tsx`
   - Drop the `import { AppShell } from "@/components/layout/AppShell"`.
   - Remove the `<AppShell>…</AppShell>` wrapping in the error boundary, not-found boundary, and main component (return `<div>…</div>` instead).

2. `src/routes/_authenticated/reports-history.compare.tsx`
   - Same treatment: drop the import and unwrap `errorComponent`, `notFoundComponent`, loading state, missing-reports state, and the main return.

### Verification

- Reload `/reports-history` and `/reports-history/compare` in the preview — sidebar and top bar should appear exactly once, matching Dashboard / Tasks / Team.
- Confirm no console errors and that the "No reports yet" empty state, filters, and back-navigation still work.
