import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { SuspendedScreen } from "@/components/SuspendedScreen";
import { useApp } from "@/lib/app-context";
import { isShareMode, isPathAllowed, firstAllowedPath } from "@/lib/share-mode";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Share Mode viewers may pass through this gate. Auth is not required
    // and access is instead constrained by the share link's page whitelist.
    if (isShareMode()) {
      if (!isPathAllowed(location.pathname)) {
        throw redirect({ to: firstAllowedPath() });
      }
      return { user: null };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: LayoutComponent,
});

function LayoutComponent() {
  const { user } = useApp();
  // In share mode we allow anonymous browsing; suspension screen is skipped.
  if (!isShareMode() && user?.status === "suspended") return <SuspendedScreen />;
  
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
