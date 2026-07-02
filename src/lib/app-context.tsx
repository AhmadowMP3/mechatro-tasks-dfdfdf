import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dict, type DictKey, type Lang } from "@/i18n/dict";
import { logActivity } from "@/lib/activity";
import type { Session } from "@supabase/supabase-js";

// Fixed 3-role model. `manager` and `viewer` remain in the enum for backward
// compatibility with legacy UI badges, but only `admin` and `member` are used.
export type Role = "admin" | "manager" | "member" | "viewer";

// Legacy alias kept so pre-existing pages compile; use `isAdmin` / `isMasterAdmin` now.
export type Permission =
  | "manage_projects" | "manage_tasks" | "manage_users" | "manage_settings"
  | "edit_own_task" | "comment" | "view";

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
  suspended_by?: string | null;
  suspended_at?: string | null;
  suspend_reason?: string | null;
  is_master_admin?: boolean;
};

// Public teammate directory row — no PII exposed to Members.
export type DirectoryEntry = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

type Ctx = {
  lang: Lang;
  theme: "dark" | "light";
  setLang: (l: Lang) => void;
  setTheme: (t: "dark" | "light") => void;
  t: (k: DictKey, vars?: Record<string, string>) => string;
  user: Profile | null;
  session: Session | null;
  users: Profile[];              // full profiles — populated for admins only
  directory: DirectoryEntry[];   // name + avatar for everyone (safe for members)
  refreshUsers: () => Promise<void>;
  can: (perm: Permission) => boolean;
  isMasterAdmin: boolean;
  isAdmin: boolean;              // true for both Master Admin and Admin
  isMember: boolean;             // true when not admin
  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [lang, setLangState] = useState<Lang>("ar");
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  const [users, setUsers] = useState<Profile[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const setLang = (l: Lang) => { setLangState(l); if (typeof window !== "undefined") localStorage.setItem("lang", l); };
  const setTheme = (t: "dark" | "light") => { setThemeState(t); if (typeof window !== "undefined") localStorage.setItem("theme", t); };

  const loadDirectory = async () => {
    const { data } = await supabase.from("team_directory").select("id,full_name,avatar_url").order("full_name");
    if (data) setDirectory(data as DirectoryEntry[]);
  };

  const refreshUsers = async () => {
    // Admins get full profile rows; members are limited by RLS and get an empty result here.
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    if (data) setUsers(data as Profile[]);
    await loadDirectory();
  };

  const loadUser = async (uid: string) => {
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (prof) setUser(prof as Profile);
  };

  const signOut = async () => {
    try {
      const uid = session?.user?.id ?? user?.id ?? null;
      if (uid) await logActivity(uid, "signed_out", "auth", uid, {});
    } catch { /* noop */ }
    try { await queryClient.cancelQueries(); queryClient.clear(); } catch { /* noop */ }
    await supabase.auth.signOut();
    setUser(null); setSession(null); setUsers([]); setDirectory([]);
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
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        if (s) {
          loadUser(s.user.id);
          refreshUsers();
        }
      }
      if (event === "SIGNED_OUT") {
        setUser(null); setUsers([]); setDirectory([]);
      }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // Realtime: react to changes on the signed-in user's own profile row
  // (suspension, role change, etc.) so the UI updates instantly.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const ch = supabase
      .channel(`self-profile-${uid}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => { setUser((prev) => ({ ...(prev ?? {} as Profile), ...(payload.new as Profile) })); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.user?.id]);

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
  const isAdmin = isMasterAdmin || user?.role === "admin";
  const isMember = !!user && !isAdmin;

  // Legacy shim — mapped to the fixed 3-role model.
  const can = (p: Permission) => {
    if (!user) return false;
    if (isAdmin) return true;
    // Members
    return p === "view" || p === "comment" || p === "edit_own_task";
  };

  return (
    <AppCtx.Provider value={{
      lang, theme, setLang, setTheme, t, user, session, users, directory, refreshUsers,
      can, isMasterAdmin, isAdmin, isMember, signOut,
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
