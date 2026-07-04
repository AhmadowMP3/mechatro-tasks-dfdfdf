// TEMPORARY: one-off seed endpoint to provision the two test users.
// Delete this file after use.
import { createFileRoute } from "@tanstack/react-router";

const SEEDS = [
  { email: "admin.test@mechatro.test", password: "Admin!2026", role: "admin" as const, full_name: "Admin Test" },
  { email: "member.test@mechatro.test", password: "Member!2026", role: "member" as const, full_name: "Member Test" },
];

const SEED_TOKEN = "mechatro-seed-2026-once";

export const Route = createFileRoute("/api/public/seed-test-users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== SEED_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const results: Array<{ email: string; action: string }> = [];

        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (listErr) return new Response(listErr.message, { status: 500 });

        for (const s of SEEDS) {
          const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === s.email.toLowerCase());
          let userId: string;
          let action: string;
          if (existing) {
            const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password: s.password,
              email_confirm: true,
              user_metadata: { full_name: s.full_name },
            });
            if (error) return new Response(error.message, { status: 500 });
            userId = existing.id;
            action = "updated";
          } else {
            const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
              email: s.email,
              password: s.password,
              email_confirm: true,
              user_metadata: { full_name: s.full_name },
            });
            if (error || !created.user) return new Response(error?.message ?? "create failed", { status: 500 });
            userId = created.user.id;
            action = "created";
          }

          await supabaseAdmin.from("profiles").delete().eq("email", s.email).neq("id", userId);

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
          if (upsertErr) return new Response(upsertErr.message, { status: 500 });

          results.push({ email: s.email, action });
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
