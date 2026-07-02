import { supabase } from "@/integrations/supabase/client";

export async function logActivity(actor_id: string | null, action: string, entity_type: string, entity_id: string, meta: Record<string, unknown> = {}) {
  await supabase.from("activity_log").insert({ actor_id, action, entity_type, entity_id, meta });
}

export async function notify(user_id: string, type: string, title_ar: string, title_en: string, body?: string, entity_id?: string) {
  if (!user_id) return;
  await supabase.from("notifications").insert({ user_id, type, title_ar, title_en, body: body ?? null, entity_id: entity_id ?? null });
}
