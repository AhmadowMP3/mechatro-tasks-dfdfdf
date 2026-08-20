import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Starts the Google Drive OAuth consent flow for the master admin.
 * Returns the Google consent URL; the browser navigates there and Google
 * redirects back to /api/public/google/drive-callback.
 */
export const startDriveOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => ({ origin: String(input?.origin ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles").select("id, is_master_admin").eq("id", context.userId).maybeSingle();
    if (!me?.is_master_admin) throw new Error("master admin only");

    const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
    if (!clientId) throw new Error("oauth_not_configured");

    const origin = /^https?:\/\/[^\s/]+$/.test(data.origin) ? data.origin : "";
    if (!origin) throw new Error("bad_origin");
    const redirectUri = `${origin}/api/public/google/drive-callback`;

    const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("drive_config" as never).upsert(
      {
        id: true,
        oauth_state: state,
        oauth_state_exp: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      } as never,
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.email",
    );
    return { url: url.toString() };
  });
