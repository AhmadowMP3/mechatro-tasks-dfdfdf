import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SeedResult = {
  email: string;
  password: string;
  role: "admin" | "member";
  full_name: string;
  action: "created" | "updated";
};

const SEEDS: Array<Omit<SeedResult, "action">> = [
  { email: "admin.test@mechatro.test", password: "Admin!2026", role: "admin", full_name: "Admin Test" },
  { email: "member.test@mechatro.test", password: "Member!2026", role: "member", full_name: "Member Test" },
];

export const provisionTestUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ results: SeedResult[] }> => {
    // Only Master Admin may run this.
    const { data: me, error: meErr } = await context.supabase
      .from("profiles")
      .select("is_master_admin, role")
      .eq("id", context.userId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    if (!me?.is_master_admin) throw new Error("Forbidden: master admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: SeedResult[] = [];

    for (const s of SEEDS) {
      // Look up existing auth user by email
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1, perPage: 200,
      });
      if (listErr) throw new Error(listErr.message);
      const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === s.email.toLowerCase());

      let userId: string;
      let action: SeedResult["action"];
      if (existing) {
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: s.password,
          email_confirm: true,
          user_metadata: { full_name: s.full_name },
        });
        if (updErr) throw new Error(updErr.message);
        userId = existing.id;
        action = "updated";
      } else {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: s.email,
          password: s.password,
          email_confirm: true,
          user_metadata: { full_name: s.full_name },
        });
        if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");
        userId = created.user.id;
        action = "created";
      }

      // Delete orphan profile rows sharing this email but pointing to no auth user
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("email", s.email)
        .neq("id", userId);

      // Ensure profile row exists and has correct role/status
      const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          email: s.email,
          full_name: s.full_name,
          role: s.role,
          status: "active",
          active: true,
        },
        { onConflict: "id" },
      );
      if (upsertErr) throw new Error(upsertErr.message);

      results.push({ ...s, action });
    }

    return { results };
  });
