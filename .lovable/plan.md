## Problem

Opening the Filters drawer on `/activity` (or changing a date preset) leaves the browser at `/_authenticated/activity?...` — which is the route **ID**, not a real URL. There is no page at `/_authenticated/*`, so the root `notFoundComponent` renders the "404 — page not found" screen.

Root cause is in `src/routes/_authenticated/activity.tsx`:

```ts
const navigate = useNavigate({ from: "/_authenticated/activity" });
// …
const patchSearch = (partial) => navigate({ search: (prev) => ({ ...prev, ...partial }) });
const resetFilters  = () => navigate({ search: { q:"", user:"", action:"", entity:"", range:"7d", from:"", to:"" } });
```

Both calls pass **no `to`**. With a `from` that points at the underscore-prefixed route ID, TanStack resolves the destination pathname to that ID string, so the URL becomes `/_authenticated/activity?…` on the first filter change. Every subsequent filter click keeps navigating within that non-existent path.

## Fix (single file: `src/routes/_authenticated/activity.tsx`)

Anchor every navigate call to the real URL and drop the ID-shaped `from`:

1. Change `const navigate = useNavigate({ from: "/_authenticated/activity" });` → `const navigate = useNavigate();`
2. `patchSearch`: `navigate({ to: "/activity", search: (prev) => ({ ...prev, ...partial }), replace: true })`.
3. `resetFilters`: `navigate({ to: "/activity", search: { q:"", user:"", action:"", entity:"", range:"7d", from:"", to:"" }, replace: true })`.

`replace: true` avoids polluting history with every filter tweak; matches typical filter-page UX.

No other code paths change. All existing filter logic, chips, drawer, export, and RLS/data code stay identical.

## Verification

- Navigate to `/activity`, open the Filters drawer, pick a date preset / user / action / entity — URL stays on `/activity?...` and the drawer works.
- Click "Reset" — URL becomes `/activity?range=7d` (with empty extras) and rows reload.
- Refresh the page with filters applied — still `/activity`, no 404.
- Typecheck stays clean (`useNavigate()` with an explicit `to: "/activity"` is fully typed).

## Out of scope

- No changes to `FilterDrawer`, sidebar links, RLS, or any other route.
- No visual/style changes.
- Not touching the pre-existing hydration-mismatch warning from `__root.tsx` (unrelated to the 404).