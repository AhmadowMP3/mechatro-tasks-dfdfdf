import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dict, type DictKey, type Lang } from "@/i18n/dict";
import { logActivity } from "@/lib/activity";
import type { Session } from "@supabase/supabase-js";

// Legacy role kept for existing UI badges. New logic uses `permissions` array.
export type Role = "admin" | "manager" | "member" | "viewer";

export type PermissionKey =
  | "users.invite" | "users.suspend" | "users.delete" | "users.change_role"
  | "roles.manage"
  | "projects.view" | "projects.create" | "projects.edit" | "projects.delete" | "projects.archive"
  | "tasks.view" | "tasks.create" | "tasks.edit_any" | "tasks.edit_own" | "tasks.delete" | "tasks.comment"
  | "team.view" | "league.view" | "notifications.view"
  | "settings.view" | "settings.edit"
  | "backups.view" | "backups.run" | "backups.restore"
  | "activity.view";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  active: boolean;
  language_pref: string;
  theme_pref: string;
  status?: "pending" | "active" | "suspended";
  is_master_admin?: boolean;
};

// Legacy permission alias (kept so pre-existing pages compile).
export type Permission =
  | "manage_projects" | "manage_tasks" | "manage_users" | "manage_settings"
  | "edit_own_task" | "comment" | "view";

type Ctx = {
  lang: Lang;
  theme: "dark" | "light";
  setLang: (l: Lang) => void;
  setTheme: (t: "dark" | "light") => void;
  t: (k: DictKey, vars?: Record<string, string>) => string;
  user: Profile | null;
  session: Session | null;
  users: Profile[];
  refreshUsers: () => Promise<void>;
  can: (perm: Permission) => boolean;
  hasPerm: (key: PermissionKey) => boolean;
  isMasterAdmin: boolean;
  permissions: PermissionKey[];
  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

const LEGACY_PERMS: Record<Role, Permission[]> = {
  admin: ["manage_projects", "manage_tasks", "manage_users", "manage_settings", "edit_own_task", "comment", "view"],
  manager: ["manage_projects", "manage_tasks", "edit_own_task", "comment", "view"],
  member: ["edit_own_task", "comment", "view"],
  viewer: ["view"],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  const [users, setUsers] = useState<Profile[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);

  const setLang = (l: Lang) => { setLangState(l); if (typeof window !== "undefined") localStorage.setItem("lang", l); };
  const setTheme = (t: "dark" | "light") => { setThemeState(t); if (typeof window !== "undefined") localStorage.setItem("theme", t); };

  const refreshUsers = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    if (data) setUsers(data as Profile[]);
  };

  const loadUser = async (uid: string) => {
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (prof) setUser(prof as Profile);
    const { data: userRoles } = await supabase.from("user_roles").select("role_id").eq("user_id", uid);
    const roleIds = (userRoles ?? []).map((r) => r.role_id);
    if (roleIds.length) {
      const { data: rp } = await supabase
        .from("role_permissions")
        .select("permission")
        .in("role_id", roleIds);
      setPermissions(Array.from(new Set((rp ?? []).map((r) => r.permission as PermissionKey))));
    } else {
      setPermissions([]);
    }
  };

  const signOut = async () => {
    try {
      const { useQueryClient } = await import("@tanstack/react-query");
      void useQueryClient;
    } catch { /* noop */ }
    // Cache teardown before signing out to avoid 401 flashes from in-flight queries.
    if (typeof window !== "undefined") {
      const w = window as unknown as { __queryClient?: { cancelQueries: () => Promise<void>; clear: () => void } };
      if (w.__queryClient) {
        try { await w.__queryClient.cancelQueries(); w.__queryClient.clear(); } catch { /* noop */ }
      }
    }
    await supabase.auth.signOut();
    setUser(null); setSession(null); setUsers([]); setPermissions([]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedLang = (localStorage.getItem("lang") as Lang) || "ar";
    const storedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    setLangState(storedLang);
    setThemeState(storedTheme);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) { loadUser(data.session.user.id); refreshUsers(); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (s) {
          loadUser(s.user.id);
          refreshUsers();
          if (event === "SIGNED_IN") void logActivity(s.user.id, "signed_in", "auth", s.user.id, {});
        }
      }
      if (event === "SIGNED_OUT") {
        setUser(null); setUsers([]); setPermissions([]);
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    html.lang = lang;
    html.classList.remove("dark", "light");
    html.classList.add(theme);
  }, [lang, theme]);

  const t = (k: DictKey, vars?: Record<string, string>) => {
    const entry = dict[k];
    let s = entry ? entry[lang] : String(k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replaceAll(`{${key}}`, val);
    return s;
  };

  const isMasterAdmin = !!user?.is_master_admin;

  const can = (p: Permission) => {
    if (!user) return false;
    if (isMasterAdmin) return true;
    return LEGACY_PERMS[user.role].includes(p);
  };

  const hasPerm = (key: PermissionKey) => {
    if (!user) return false;
    if (isMasterAdmin) return true;
    return permissions.includes(key);
  };

  return (
    <AppCtx.Provider value={{
      lang, theme, setLang, setTheme, t, user, session, users, refreshUsers,
      can, hasPerm, isMasterAdmin, permissions, signOut,
    }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
