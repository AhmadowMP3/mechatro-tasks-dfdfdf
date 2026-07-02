import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Trophy, Bell, Settings, LogOut, X, ShieldCheck, ScrollText, Library } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { RoleBadge } from "@/components/Pills";
import { Avatar } from "@/components/Avatar";
import logo from "@/assets/mechatro-logo.png";
import type { DictKey } from "@/i18n/dict";

type NavItem = {
  to: string;
  icon: React.ComponentType<{ size?: number }>;
  key: DictKey | null;
  label?: { ar: string; en: string };
};

const NAV: NavItem[] = [
  { to: "/",              icon: LayoutDashboard, key: "dashboard" },
  { to: "/projects",      icon: FolderKanban,    key: "projects" },
  { to: "/tasks",         icon: CheckSquare,     key: "tasks" },
  { to: "/team",          icon: Users,           key: "team" },
  { to: "/league",        icon: Trophy,          key: "league" },
  { to: "/notifications", icon: Bell,            key: "notifications" },
  { to: "/settings",      icon: Settings,        key: "settings" },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t, user, lang, signOut, isMasterAdmin } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = isMasterAdmin || user?.role === "admin";
  const nav: NavItem[] = [...NAV];
  if (isAdmin) {
    nav.push({ to: "/activity", icon: ScrollText, key: "activityLog" });
  }
  if (isMasterAdmin) {
    nav.push({ to: "/access-control", icon: ShieldCheck, key: null, label: { ar: "التحكم بالصلاحيات", en: "Access Control" } });
  }

  return (
    <aside
      style={{
        width: 260,
        background: "linear-gradient(180deg,#050D17,#0A1A2B)",
        color: "#EAF2F9",
        display: "flex", flexDirection: "column",
        borderInlineEnd: "1px solid #1E364D",
        height: "100dvh",
      }}
    >
      <div style={{ padding: "22px 18px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" }}>
        {onClose && (
          <button onClick={onClose} aria-label="close" style={{
            position: "absolute", insetInlineEnd: 8, top: 8, width: 44, height: 44,
            background: "transparent", color: "#EAF2F9", borderRadius: 10, cursor: "pointer", border: "none",
          }}><X size={20} /></button>
        )}
        <img src={logo} alt="Mechatro" style={{ width: 172, maxWidth: "100%", filter: "drop-shadow(0 2px 8px rgba(0,0,0,.4))" }} />
        <div style={{ fontSize: 12, color: "#9FB7C9", fontWeight: 700, letterSpacing: 0.5 }}>
          {t("appName")}
        </div>
      </div>

      {user && (
        <div style={{
          margin: "8px 14px 10px", padding: "12px",
          background: "rgba(255,255,255,.04)", border: "1px solid #1E364D",
          borderRadius: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Avatar id={user.id} name={user.full_name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#EAF2F9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.full_name}
            </div>
            <div style={{ marginTop: 4 }}><RoleBadge role={user.role} /></div>
          </div>
        </div>
      )}

      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {nav.map((item) => {
          const { to, icon: Icon } = item;
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          const label = "label" in item && item.label
            ? item.label[lang]
            : t(item.key as DictKey);
          return (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", marginBottom: 4,
                borderRadius: 12,
                minHeight: 48,
                background: active ? "var(--grad-blue)" : "transparent",
                color: active ? "#fff" : "#B9CBDA",
                fontWeight: 700, fontSize: 14.5,
                textDecoration: "none",
                flexDirection: lang === "ar" ? "row-reverse" : "row",
                justifyContent: "flex-end",
              }}
            >
              <span style={{ flex: 1, textAlign: lang === "ar" ? "right" : "left" }}>{label}</span>
              <Icon size={20} />
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: "1px solid #1E364D" }}>
        <button
          onClick={async () => { await signOut(); window.location.href = "/auth"; }}
          style={{
            width: "100%", minHeight: 48, borderRadius: 12,
            background: "rgba(240,103,106,.12)", color: "#F0676A",
            border: "1px solid rgba(240,103,106,.3)", fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            cursor: "pointer",
          }}
        >
          <LogOut size={18} /> {t("logout")}
        </button>
      </div>
    </aside>
  );
}
