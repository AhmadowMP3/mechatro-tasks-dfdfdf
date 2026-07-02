## Fix duplicated sidebar on Share Links page

**Cause:** `src/routes/_authenticated/route.tsx` already wraps every authenticated child in `<AppShell>`. `src/routes/_authenticated/share-links.tsx` wraps its own content in `<AppShell>` again, so the sidebar/header render twice.

**Fix:** Remove the redundant `<AppShell>` wrappers from `share-links.tsx` (both the loading state and the main return), leaving only the page content. No other files need to change.