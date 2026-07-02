import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/provision-test-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = new URL(request.url).searchParams.get("secret");
        if (secret !== "mechatro-bootstrap") return new Response("forbidden", { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = "tester@mechatro.test";
        const password = "Mechatro@2026!";
        const full_name = "Test User";

        const created = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name },
        });
        if (created.error && !/already|registered|exists/i.test(created.error.message)) {
          return new Response(JSON.stringify({ error: created.error.message }), { status: 500 });
        }
        if (created.error) {
          const list = await supabaseAdmin.auth.admin.listUsers();
          const existing = list.data.users.find((u) => u.email?.toLowerCase() === email);
          if (existing) {
            await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password, email_confirm: true, user_metadata: { full_name },
            });
          }
        }
        return new Response(JSON.stringify({ email, password, ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
