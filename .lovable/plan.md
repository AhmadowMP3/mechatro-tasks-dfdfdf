## Goal

Make the app usable on flaky/slow internet without breaking the Lovable preview or adding a full PWA/service-worker (per PWA guidance — user didn't ask for installability/offline install, just resilience).

## What to build

### 1. Network status indicator (top of app)
- New `src/components/NetworkStatus.tsx`: listens to `navigator.onLine` + `online`/`offline` events, plus a lightweight periodic ping to Supabase health.
- Renders a small pill top-right:
  - green dot "Online" (auto-hides after 2s when things are fine)
  - amber "Slow connection" when a request takes >3s
  - red "Offline — changes will retry" when offline
- Uses existing i18n dict (add `online`, `offline`, `slowConnection`, `reconnecting`, `changesQueued` keys, ar+en).
- Mounted once in `src/routes/_authenticated/route.tsx`.

### 2. TanStack Query defaults tuned for low bandwidth
In `src/router.tsx`, configure the `QueryClient`:
- `retry: 3` with exponential backoff (`retryDelay: attempt => Math.min(1000 * 2**attempt, 15000)`)
- `staleTime: 60_000`, `gcTime: 5 * 60_000` — reuse cached data on navigation, avoid refetch storms
- `refetchOnWindowFocus: false`, `refetchOnReconnect: true` — auto-refresh once the network returns
- `networkMode: "offlineFirst"` for queries and mutations — serve cache offline, resume when back

### 3. Persist query cache to localStorage
- Add dep `@tanstack/query-sync-storage-persister` + `@tanstack/react-query-persist-client`
- Wrap the app in `PersistQueryClientProvider` inside `__root.tsx` (or a small client-only wrapper), key `mechatro-cache-v1`, max age 24h, buster tied to app version
- Effect: opening the app offline shows the last-seen tasks/projects instead of blank screen

### 4. Mutation-friendly toasts
- Small helper `src/lib/withRetryToast.ts` used by places that already call Supabase mutations (share, save Drive link, task edits): if the mutation fails with a network error, show toast "Offline — will retry when back online" and re-fire the mutation on the next `online` event (single retry, no queue persistence — keeps scope tight).
- Wire it into the two hot paths the user actually touches: Drive-link save (`TaskDetailModal.addLink`) and task share (already synchronous, no change needed).

### 5. Fetch timeout wrapper
- `src/lib/fetchWithTimeout.ts`: 15s AbortController-based timeout, used by any raw `fetch` calls (Telegram/WhatsApp share links don't fetch — skip; only wrap places that already use `fetch`).

## Out of scope
- No service worker, no `vite-plugin-pwa`, no installability (per PWA guidance — user didn't ask, and Lovable preview must not register SW).
- No offline write queue with IndexedDB — one-shot retry-on-reconnect only.
- No changes to auth flow, RLS, or backend.

## Files touched
- new: `src/components/NetworkStatus.tsx`, `src/lib/withRetryToast.ts`, `src/lib/fetchWithTimeout.ts`
- edited: `src/router.tsx` (QueryClient defaults), `src/routes/__root.tsx` (persister provider), `src/routes/_authenticated/route.tsx` (mount NetworkStatus), `src/i18n/dict.ts` (5 keys), `src/components/TaskDetailModal.tsx` (wrap `addLink` with retry helper), `package.json` (2 deps)

## Verification
- Build passes
- DevTools → Network → "Offline": app still renders last-cached tasks; red pill shows
- DevTools → "Slow 3G": amber pill appears on slow requests; mutations retry instead of erroring out
