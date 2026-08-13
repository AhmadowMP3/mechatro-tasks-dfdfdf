# Fix the live site (500) and publish everything

## What I verified

- `https://mechatro.hub4tech.net/` returns **HTTP 500** on every request, and the HTML it returns is the app's own server error page (`src/lib/error-page.ts`). So the published server build is running but throwing while handling the request.
- `https://mechatro-tasks.lovable.app/` just redirects to the custom domain, so it fails the same way.
- The preview here answers **200** on `/` and the dev server log shows no errors — the crash exists only in the production build/runtime, which is why it was invisible while we worked.
- No browser runtime errors are recorded, consistent with the page never reaching the browser app at all.

The exact cause is **not confirmed yet** — the production stack trace lives in the deployed server logs, not in preview. So step 1 is reproducing it, not guessing.

## Step 1 — Reproduce the production failure locally

Run a real production build and serve the built worker output locally, then request `/`. The wrapper in `src/server.ts` logs the original error, so the build+run will print the actual stack instead of the generic "This page didn't load" page.

Likely categories to check against the trace, in order:

1. Module-scope work that Cloudflare Workers forbid (random values, crypto, or I/O executed at module load) — dev on Node tolerates it, the deployed worker returns 500 on every request.
2. A module-scope statement referencing a route component that automatic code splitting removed (`ReferenceError` at route-module load; because the generated route tree imports every route file, this makes *all* paths 500, including `/`).
3. A non-serializable value returned from a route loader.
4. A server-side import that pulls a browser-only or Node-only module into the worker bundle.

## Step 2 — Fix the root cause

Apply the minimal fix that the trace points to (move the offending work into a lazy initializer / handler body, delete the dead module-scope statement, or make the loader payload serializable). No refactors beyond what the crash requires.

## Step 3 — Re-verify before publishing

- Rebuild and re-run the production output locally; confirm `/` returns 200 and the auth page renders.
- Confirm the finance vault gate still loads (the encryption work from this session ships in the same deploy).
- Typecheck.

## Step 4 — Publish everything

Publish the current code, which includes the finance end-to-end encryption vault. After the deploy, fetch the live URL once to confirm it returns 200.

Note for after the publish: on the live site you will be asked to create the **finance passphrase** the first time you open Finance, and the existing finance records will be encrypted in the browser at that moment. That passphrase cannot be recovered.

## Technical notes

- The five-layer SSR error handling (`vite.config.ts` entry override, `src/server.ts` wrapper, `src/start.ts` request middleware, `src/lib/error-capture.ts`, root `errorComponent`) is already wired, which is why we get a branded 500 page instead of a raw h3 error. It is masking the message in the browser but preserving it in the server log — the local production run is how we read it.
- Nothing in this plan changes the database. Today's migration is already applied and is not the suspected cause, but if the trace points at schema-dependent code, I will report that before changing anything.
