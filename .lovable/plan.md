# Fix "Failed to fetch dynamically imported module" on /references

## What's happening

After a new deploy, the browser is holding an old HTML shell that references JS chunk filenames from the previous build (e.g. `references-BB7qtu7v.js`). Those files no longer exist on the CDN, so when TanStack Router tries to lazy-load the References route chunk, `import()` throws `TypeError: Failed to fetch dynamically imported module`. The root `errorComponent` catches it and shows "Something went wrong".

This is not a bug in the References page itself — every code-split route is vulnerable after any redeploy until the user hard-refreshes.

## Fix

Two small, safe additions:

### 1. Auto-recover in `src/routes/__root.tsx` `ErrorComponent`

Detect chunk-load / dynamic-import errors and force a one-time hard reload with a cache-buster query param, using `sessionStorage` to prevent an infinite reload loop if the error is real.

```ts
const isChunkLoadError = (e: unknown) => {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed|error loading dynamically imported module/i.test(msg);
};
```

If matched and `sessionStorage.getItem("chunk-reload") !== "1"`:
- Set the flag.
- `location.replace(location.pathname + location.search + (has ? "&" : "?") + "_v=" + Date.now())`.

Clear the flag on successful mount of `RootComponent` (i.e. via a `useEffect` that runs once).

### 2. Global catch for lazy imports triggered outside a route boundary

Add a `window` listener in the same `useEffect` (client-only) for `unhandledrejection` that runs `isChunkLoadError` on `event.reason` and does the same reload. This covers cases where the error surfaces via `React.lazy` inside `<ClientOnly>` etc. before the router's error boundary sees it.

Both live in `src/routes/__root.tsx` only. No other files change.

## Why this is the right fix

- Standard Vite / TanStack SPA recovery pattern for stale chunks after deploy.
- Guarded by `sessionStorage` so a genuine broken build won't reload-loop.
- No changes to routing, code splitting, or the References route itself.
- Ships alongside the existing `reportLovableError` call so we still capture the incident.

## Out of scope

- Service worker precaching or long-term cache-busting strategy.
- Any change to the References page or its data.
- Backend / SSR changes.
