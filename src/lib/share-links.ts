import { supabase } from "@/integrations/supabase/client";

const FUNCTION_URL = `https://hxzttehtfnxpnfyeclzj.functions.supabase.co/share-access`;

async function call<T = unknown>(payload: Record<string, unknown>, authed: boolean): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authed) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    (err as unknown as { code?: string }).code = body.error;
    throw err;
  }
  return body as T;
}

export type ShareLinkRow = {
  id: string;
  token: string;
  label: string;
  allowed_pages: string[];
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  password_hash: string | null;
  revoked: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export const shareApi = {
  list: () => call<{ links: ShareLinkRow[] }>({ action: "list" }, true),
  create: (input: {
    label: string; allowed_pages: string[]; expires_at?: string | null;
    max_uses?: number | null; password?: string | null;
  }) => call<{ link: ShareLinkRow }>({ action: "create", ...input }, true),
  update: (id: string, patch: Partial<{
    label: string; allowed_pages: string[]; expires_at: string | null;
    max_uses: number | null; password: string | null; revoked: boolean; reset_uses: boolean;
  }>) => call<{ link: ShareLinkRow }>({ action: "update", id, ...patch }, true),
  revoke: (id: string) => call<{ link: ShareLinkRow }>({ action: "revoke", id }, true),
  remove: (id: string) => call<{ ok: true }>({ action: "delete", id }, true),
  resolve: (token: string, password?: string) =>
    call<{ link: { label: string; allowed_pages: string[]; expires_at: string | null } }>(
      { action: "resolve", token, password: password ?? null }, false,
    ),
  data: <T = unknown>(token: string, resource: string) =>
    call<T>({ action: "data", token, resource }, false),
  bootstrap: (token: string, password?: string) =>
    call<{
      link: { label: string; allowed_pages: string[]; expires_at: string | null };
      bootstrap: import("./share-mode").ShareBootstrap;
    }>({ action: "bootstrap", token, password: password ?? null }, false),
};

export const SHARE_FUNCTION_URL = FUNCTION_URL;

export const SHARE_PAGES: { key: string; ar: string; en: string }[] = [
  { key: "dashboard", ar: "لوحة التحكم", en: "Dashboard" },
  { key: "projects", ar: "المشاريع", en: "Projects" },
  { key: "tasks", ar: "المهام", en: "Tasks" },
  { key: "team", ar: "الفريق", en: "Team" },
  { key: "league", ar: "الدوري", en: "League" },
  { key: "references", ar: "المراجع", en: "References" },
  { key: "activity", ar: "سجل النشاط", en: "Activity Log" },
];
