## Fix "Redirecting..." hang on share links

**Cause:** File-based routing nests `share.$token.$page.tsx` **under** `share.$token.tsx`. The parent's `component` renders the entry card, not `<Outlet />`, so after a successful resolve the router matches the child route but has nowhere to render it — the parent stays on screen forever showing "Redirecting...".

**Fix:** Split the parent into a layout + index:

1. Rename `src/routes/share.$token.tsx` → `src/routes/share.$token.index.tsx` and change `createFileRoute("/share/$token")` to `createFileRoute("/share/$token/")` (index route). Component body stays the same (the password/entry card).
2. Create a new bare parent `src/routes/share.$token.tsx` whose component is `() => <Outlet />`. This lets both the index (entry card) and the `$page` child mount correctly.

No other files change. Verify by opening a share link — after password/resolve it should land on `/share/<token>/dashboard` (or the first allowed page) with the read-only viewer.