import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dict, type DictKey, type Lang } from "@/i18n/dict";
import type { Session } from "@supabase/supabase-js";

export type Role = "admin" | "manager" | "member" | "viewer";
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
};

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
  signOut: () => Promise<void>;
};

export type Permission =
  | "manage_projects"
  | "manage_tasks"
  | "manage_users"
  | "manage_settings"
  | "edit_own_task"
  | "comment"
  | "view";

const AppCtx = createContext<Ctx | null>(null);

const PERMS: Record<Role, Permission[]> = {
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

  const setLang = (l: Lang) => { setLangState(l); if (typeof window !== "undefined") localStorage.setItem("lang", l); };
  const setTheme = (t: "dark" | "light") => { setThemeState(t); if (typeof window !== "undefined") localStorage.setItem("theme", t); };

  const refreshUsers = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    if (data) setUsers(data as Profile[]);
  };

  const loadUser = async (uid: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) setUser(data as Profile);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setSession(null); setUsers([]);
  };

  // Load client-only preferences
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedLang = (localStorage.getItem("lang") as Lang) || "ar";
    const storedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    setLangState(storedLang);
    setThemeState(storedTheme);
  }, []);

  // Auth session listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadUser(data.session.user.id);
        refreshUsers();
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (s) { loadUser(s.user.id); refreshUsers(); }
      }
      if (event === "SIGNED_OUT") {
        setUser(null); setUsers([]);
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // apply html attrs
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

  const can = (p: Permission) => (user ? PERMS[user.role].includes(p) : false);

  return (
    <AppCtx.Provider value={{ lang, theme, setLang, setTheme, t, user, session, users, refreshUsers, can, signOut }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
