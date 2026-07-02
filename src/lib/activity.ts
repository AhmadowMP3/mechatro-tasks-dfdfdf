import { supabase } from "@/integrations/supabase/client";

// Canonical action vocabulary used across the app + Activity Log filters.
export type ActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "deleted"
  | "archived"
  | "commented"
  | "file_added"
  | "assigned"
  | "signed_in";

// Legacy strings still exist in a few call sites; map them to canonical names
// so the Activity Log filters and i18n keys stay consistent.
const ACTION_ALIASES: Record<string, ActivityAction> = {
  act_create: "created",
  act_update: "updated",
  act_status: "status_changed",
  status: "status_changed",
  act_delete: "deleted",
  act_archive: "archived",
  act_comment: "commented",
  act_file: "file_added",
  act_assign: "assigned",
  act_signin: "signed_in",
};

export function normalizeAction(a: string): string {
  return ACTION_ALIASES[a] ?? a;
}

export async function logActivity(
  actor_id: string | null,
  action: string,
  entity_type: string,
  entity_id: string | null,
  meta: Record<string, string | number | boolean | null> = {},
) {
  await supabase.from("activity_log").insert({
    actor_id,
    action: normalizeAction(action),
    entity_type,
    entity_id,
    meta: meta as never,
  });
}

export async function notify(
  user_id: string,
  type: string,
  title_ar: string,
  title_en: string,
  body?: string,
  entity_id?: string,
) {
  if (!user_id) return;
  await supabase.from("notifications").insert({
    user_id,
    type,
    title_ar,
    title_en,
    body: body ?? null,
    entity_id: entity_id ?? null,
  });
}
