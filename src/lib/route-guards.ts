import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isShareMode } from "@/lib/share-mode";

async function loadRoleFlags() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw redirect({ to: "/auth" });
  const { data: prof } = await supabase
    .from("profiles")
    .select("role, is_master_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  const isMaster = !!prof?.is_master_admin;
  const isAdmin = isMaster || prof?.role === "admin";
  return { isAdmin, isMaster };
}

/** Redirect to "/" unless the caller is Admin or Master. Share-mode passes through. */
export async function requireAdmin() {
  if (isShareMode()) return;
  const { isAdmin } = await loadRoleFlags();
  if (!isAdmin) throw redirect({ to: "/" });
}

/** Redirect to "/" unless the caller is the Master Admin. Share-mode passes through. */
export async function requireMaster() {
  if (isShareMode()) return;
  const { isMaster } = await loadRoleFlags();
  if (!isMaster) throw redirect({ to: "/" });
}
