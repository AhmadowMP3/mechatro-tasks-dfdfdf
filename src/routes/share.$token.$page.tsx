// Backwards-compat redirect: the old share viewer lived at
// /share/$token/$page and rendered a bespoke clone of each page. The share
// system now bootstraps Share Mode (see `src/lib/share-mode.ts`) and renders
// the REAL routes (/, /tasks, ...). Any legacy link that lands here is sent
// back to the resolver, which will boot share mode and redirect to the
// matching real page.
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/share/$token/$page")({
  component: LegacyShareRedirect,
});

function LegacyShareRedirect() {
  const { token } = Route.useParams();
  return <Navigate to="/share/$token" params={{ token }} replace />;
}
