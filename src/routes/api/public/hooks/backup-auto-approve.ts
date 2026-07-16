import { createFileRoute } from "@tanstack/react-router";

// Called hourly by pg_cron. Delegates to the `backup-snapshot` edge function
// with the service-role bearer so it can snapshot any pending backup_request
// older than 24h without a master admin decision.
export const Route = createFileRoute("/api/public/hooks/backup-auto-approve")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const url = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!url || !serviceKey) {
            return new Response(
              JSON.stringify({ ok: false, error: "backend not configured" }),
              { status: 500, headers: { "content-type": "application/json" } },
            );
          }
          const res = await fetch(`${url}/functions/v1/backup-snapshot`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
              "apikey": serviceKey,
            },
            body: JSON.stringify({ auto_approve_pending: true }),
          });
          const text = await res.text();
          return new Response(text, {
            status: res.status,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(
            JSON.stringify({ ok: false, error: msg }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
