import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dict, type DictKey, type Lang } from "@/i18n/dict";

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
  setUserId: (id: string) => void;
  users: Profile[];
  refreshUsers: () => Promise<void>;
  can: (perm: Permission) => boolean;
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
  const [userId, setUserIdState] = useState<string | null>(null);

  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem("lang", l); };
  const setTheme = (t: "dark" | "light") => { setThemeState(t); localStorage.setItem("theme", t); };
  const setUserId = (id: string) => { setUserIdState(id); localStorage.setItem("uid", id); };

  const refreshUsers = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    if (data) setUsers(data as Profile[]);
  };

  // init
  useEffect(() => {
    const storedLang = (localStorage.getItem("lang") as Lang) || "ar";
    const storedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    const storedUid = localStorage.getItem("uid");
    setLangState(storedLang);
    setThemeState(storedTheme);
    refreshUsers().then(() => {
      if (storedUid) setUserIdState(storedUid);
    });
  }, []);

  // pick default user after load
  useEffect(() => {
    if (!userId && users.length > 0) {
      const admin = users.find((u) => u.role === "admin") ?? users[0];
      setUserIdState(admin.id);
      localStorage.setItem("uid", admin.id);
    }
  }, [users, userId]);

  // apply html attrs
  useEffect(() => {
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

  const user = users.find((u) => u.id === userId) ?? null;
  const can = (p: Permission) => (user ? PERMS[user.role].includes(p) : false);

  return (
    <AppCtx.Provider value={{ lang, theme, setLang, setTheme, t, user, setUserId, users, refreshUsers, can }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
