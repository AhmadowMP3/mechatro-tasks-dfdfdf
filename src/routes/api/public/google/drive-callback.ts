import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Google OAuth callback for the backup → Drive integration.
// Validates the one-time state stored by startDriveOAuth, exchanges the code
// for a refresh token, then hands it to the backup-snapshot function (which
// owns the at-rest encryption) using the service-role bearer.
export const Route = createFileRoute("/api/public/google/drive-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (status: string, detail?: string) =>
          new Response(null, {
            status: 302,
            headers: {
              location: `/settings?drive=${status}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 200))}` : ""}`,
            },
          });

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.get("error")) return back("error", url.searchParams.get("error")!);
        if (!code || !state) return back("error", "missing code/state");

        const supabaseUrl = process.env["SUPABASE_URL"];
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
        const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
        if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
          return back("error", "server not configured");
        }

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: cfg } = await admin
          .from("drive_config")
          .select("oauth_state, oauth_state_exp")
          .eq("id", true)
          .maybeSingle();
        const row = cfg as { oauth_state?: string; oauth_state_exp?: string } | null;
        if (!row?.oauth_state || row.oauth_state !== state) return back("error", "invalid state");
        if (row.oauth_state_exp && new Date(row.oauth_state_exp).getTime() < Date.now()) {
          return back("error", "state expired");
        }

        const redirectUri = `${url.origin}/api/public/google/drive-callback`;
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        const tokenText = await tokenRes.text();
        if (!tokenRes.ok) return back("error", tokenText);
        const tokens = JSON.parse(tokenText) as { access_token?: string; refresh_token?: string };
        if (!tokens.refresh_token) return back("error", "no refresh token returned");

        let email: string | null = null;
        try {
          const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { authorization: `Bearer ${tokens.access_token}` },
          });
          if (me.ok) email = ((await me.json()) as { email?: string }).email ?? null;
        } catch {
          /* optional */
        }

        const saveRes = await fetch(`${supabaseUrl}/functions/v1/backup-snapshot`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            drive_oauth_save: true,
            refresh_token: tokens.refresh_token,
            account_email: email,
          }),
        });
        if (!saveRes.ok) return back("error", await saveRes.text());

        return back("connected");
      },
    },
  },
});
