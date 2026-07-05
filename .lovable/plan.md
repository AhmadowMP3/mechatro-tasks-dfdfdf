# Fix: Project card URL changes but detail page doesn't render

## Root cause

TanStack Router's file-based routing treats `src/routes/_authenticated/projects.tsx` and `src/routes/_authenticated/projects.$id.tsx` as **parent + child** (same filename prefix). The generated route tree confirms this — `AuthenticatedProjectsRouteWithChildren` wraps `projects.$id`.

A parent route must render `<Outlet />` for its children to appear. But `projects.tsx` currently renders `<ProjectsPage />` (the full list page) with no `<Outlet />`. Result: navigating to `/projects/:id` matches correctly, the URL updates, but the child detail has nowhere to mount — so the list stays visible or nothing new appears. This matches the "layout routes: never gate `<Outlet />`" guidance in the TanStack route-architecture card.

## Fix

Split `projects.tsx` into a real layout + an index leaf:

1. **Rename** `src/routes/_authenticated/projects.tsx` → `src/routes/_authenticated/projects.index.tsx`
   - Change `createFileRoute("/_authenticated/projects")` → `createFileRoute("/_authenticated/projects/")`
   - Everything else in that file stays the same (still the full `ProjectsPage` list).

2. **Create** `src/routes/_authenticated/projects.tsx` as a minimal pathless layout:
   ```tsx
   import { createFileRoute, Outlet } from "@tanstack/react-router";
   export const Route = createFileRoute("/_authenticated/projects")({
     component: () => <Outlet />,
   });
   ```

After this:
- `/projects` → renders `projects.index.tsx` (list)
- `/projects/:id` → renders `projects.$id.tsx` (detail) inside the layout's `<Outlet />`

`routeTree.gen.ts` regenerates automatically — no manual edits.

## Out of scope

No changes to auth, RLS, data fetching, or the detail page itself. No visual changes to the list.

## Verification

- Click a project card → URL changes AND detail page renders.
- Direct load of `/projects/:id` renders the detail.
- `/projects` still shows the full list with filters intact.
