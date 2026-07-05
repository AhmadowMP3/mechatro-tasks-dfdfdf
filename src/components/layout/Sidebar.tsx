import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Trophy, Bell, Settings, LogOut, X, ShieldCheck, ScrollText, Library, FileText, Share2, Eye, Pencil, Crown, UserPlus, ChevronDown, Compass, Briefcase, UsersRound, BarChart3, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { RoleBadge } from "@/components/Pills";
import { Avatar } from "@/components/Avatar";
import logo from "@/assets/mechatro-logo.png";
import type { DictKey } from "@/i18n/dict";
import { isShareMode, getShareLink } from "@/lib/share-mode";


type NavItem = {
  to: string;
  icon: React.ComponentType<{ size?: number }>;
  key: DictKey | null;
  label?: { ar: string; en: string };
};

type NavSection = {
  titleKey: DictKey;
  icon: React.ComponentType<{ size?: number }>;
  items: NavItem[];
  adminOnly?: boolean;
  masterOnly?: boolean;
};

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "overviewSection",
    icon: Compass,
    items: [
      { to: "/", icon: LayoutDashboard, key: "dashboard" },
    ],
  },
  {
    titleKey: "workSection",
    icon: Briefcase,
    items: [
      { to: "/projects",   icon: FolderKanban, key: "projects" },
      { to: "/tasks",      icon: CheckSquare,  key: "tasks" },
      { to: "/references", icon: Library,      key: "references" },
    ],
  },
  {
    titleKey: "teamSection",
    icon: UsersRound,
    items: [
      { to: "/team",   icon: Users,   key: "team" },
      { to: "/league", icon: Trophy,  key: "league" },
    ],
  },
  {
    titleKey: "insightsSection",
    icon: BarChart3,
    adminOnly: true,
    items: [
      { to: "/activity",         icon: ScrollText, key: "activityLog" },
      { to: "/reports",          icon: FileText,   key: "reports" },
      { to: "/reports-history",  icon: ScrollText, key: "reportHistory" },
    ],
  },
  {
    titleKey: "adminSection",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { to: "/access-control", icon: UserPlus, key: null, label: { ar: "الأعضاء والدعوات", en: "People & Invites" } },
      { to: "/share-links",    icon: Share2,   key: null, label: { ar: "روابط المشاركة", en: "Share Links" } },
    ],
  },
  {
    titleKey: "personalSection",
    icon: UserCog,
    items: [
      { to: "/notifications", icon: Bell,     key: "notifications" },
      { to: "/settings",      icon: Settings, key: "settings" },
    ],
  },
];

const COLLAPSED_STORAGE_KEY = "mechatro-sidebar-collapsed-v1";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t, user, session, lang, signOut, isMasterAdmin, isAdmin, refreshSelf } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const shareMode = isShareMode();
  const shareLink = getShareLink();
  const [editOpen, setEditOpen] = useState(false);
  const email = user?.email ?? session?.user?.email ?? "";

  const PAGE_TO_KEY: Record<string, string> = {
    "/": "dashboard", "/projects": "projects", "/tasks": "tasks",
    "/team": "team", "/league": "league", "/references": "references",
    "/activity": "activity",
  };

  // Build visible sections based on role + share mode.
  const sections: NavSection[] = NAV_SECTIONS
    .map((section) => {
      let items = section.items;

      // "share-links" is master-only within the admin section
      if (section.titleKey === "adminSection") {
        items = items.filter((i) => i.to !== "/share-links" || isMasterAdmin);
      }

      if (shareMode) {
        if (!shareLink) return { ...section, items: [] };
        // Inject /activity as a visible item when whitelisted (for share viewers only)
        if (section.titleKey === "insightsSection" && shareLink.allowed_pages.includes("activity")) {
          // keep only activity for share viewers
          items = items.filter((i) => i.to === "/activity");
        }
        items = items.filter((i) => shareLink.allowed_pages.includes(PAGE_TO_KEY[i.to]));
        return { ...section, items };
      }

      if (section.adminOnly && !isAdmin) return { ...section, items: [] };
      if (section.masterOnly && !isMasterAdmin) return { ...section, items: [] };
      return { ...section, items };
    })
    .filter((s) => s.items.length > 0);


  return (
    <aside
      style={{
        width: onClose ? "min(300px, 88vw)" : 260,
        background: "linear-gradient(180deg,var(--sidebar),var(--sidebar))",
        color: "var(--foreground)",
        display: "flex", flexDirection: "column",
        borderInlineEnd: "1px solid var(--border)",
        height: "100dvh",
        position: onClose ? "relative" : "sticky",
        top: 0,
        alignSelf: "flex-start",
        flexShrink: 0,
        overflowY: "auto",
      }}
    >

      <div style={{ padding: "22px 18px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" }}>
        {onClose && (
          <button onClick={onClose} aria-label="close" style={{
            position: "absolute", insetInlineEnd: 8, top: 8, width: 44, height: 44,
            background: "transparent", color: "var(--foreground)", borderRadius: 10, cursor: "pointer", border: "none",
          }}><X size={20} /></button>
        )}
        <img src={logo} alt="Mechatro" style={{ width: 172, maxWidth: "100%", filter: "drop-shadow(0 2px 8px rgba(0,0,0,.4))" }} />
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, letterSpacing: 0.5 }}>
          {t("appName")}
        </div>
      </div>

      {user && (
        <div style={{
          margin: "8px 14px 10px", padding: "12px",
          background: "rgba(255,255,255,.04)", border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex", alignItems: "center", gap: 10,
          position: "relative",
        }}>
          <Avatar id={user.id} name={user.full_name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                {user.full_name}
              </div>
              {!shareMode && (
                <button
                  onClick={() => setEditOpen(true)}
                  aria-label={lang === "ar" ? "تعديل الاسم" : "Edit name"}
                  title={lang === "ar" ? "تعديل الاسم" : "Edit name"}
                  style={{
                    background: "transparent", border: "none", color: "var(--muted)",
                    cursor: "pointer", padding: 4, borderRadius: 6, display: "inline-flex",
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {email && (
              <div dir="ltr" style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                {email}
              </div>
            )}
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <RoleBadge role={user.role} />
              {isMasterAdmin && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                  background: "linear-gradient(135deg,rgba(212,175,55,.2),rgba(212,175,55,.08))",
                  color: "#D4AF37", border: "1px solid rgba(212,175,55,.4)",
                }}>
                  <Crown size={11} /> {lang === "ar" ? "المدير الأعلى" : "Master"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {editOpen && user && (
        <EditNameModal
          currentName={user.full_name}
          userId={user.id}
          lang={lang}
          onClose={() => setEditOpen(false)}
          onSaved={async () => { await refreshSelf(); setEditOpen(false); }}
        />
      )}

      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {sections.map((section, sIdx) => (
          <div key={section.titleKey} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px 6px",
                marginTop: sIdx === 0 ? 0 : 2,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18, height: 2, borderRadius: 2,
                  background: "var(--grad-blue)",
                  boxShadow: "0 0 10px rgba(29,155,240,.5)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 10.5, fontWeight: 800,
                  letterSpacing: ".14em", textTransform: "uppercase",
                  color: "var(--muted)",
                  flex: 1,
                  textAlign: lang === "ar" ? "right" : "left",
                }}
              >
                {t(section.titleKey)}
              </span>
            </div>

            {section.items.map((item) => {
              const { to, icon: Icon } = item;
              const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
              const label = "label" in item && item.label
                ? item.label[lang]
                : t(item.key as DictKey);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={`side-item ${active ? "is-active" : ""}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", marginBottom: 4,
                    borderRadius: 12,
                    minHeight: 48,
                    background: active ? "var(--grad-blue)" : "transparent",
                    color: active ? "#fff" : "var(--muted)",
                    fontWeight: 700, fontSize: 14.5,
                    textDecoration: "none",
                    flexDirection: lang === "ar" ? "row-reverse" : "row",
                    justifyContent: "flex-end",
                  }}
                >
                  <span style={{ flex: 1, textAlign: lang === "ar" ? "right" : "left" }}>{label}</span>
                  <span
                    className={`icon-tile icon-tile-sm ${active ? "is-active" : ""}`}
                    style={active ? { background: "rgba(255,255,255,0.18)", color: "#fff", borderColor: "transparent", boxShadow: "none" } : undefined}
                  >
                    <Icon size={16} />
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        {shareMode ? (
          <div style={{
            width: "100%", minHeight: 48, borderRadius: 12, padding: "8px 12px",
            background: "linear-gradient(135deg,rgba(212,175,55,.15),rgba(212,175,55,.05))",
            border: "1px solid rgba(212,175,55,.35)",
            color: "#D4AF37", fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12.5,
          }}>
            <Eye size={16} /> {lang === "ar" ? "عرض للقراءة فقط" : "READ-ONLY PREVIEW"}
          </div>
        ) : (
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
        )}
      </div>

    </aside>
  );
}

function EditNameModal({
  currentName, userId, lang, onClose, onSaved,
}: {
  currentName: string;
  userId: string;
  lang: "ar" | "en";
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const l = lang === "ar";

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      toast.error(l ? "الاسم يجب أن يكون بين 2 و 80 حرفًا." : "Name must be between 2 and 80 characters.");
      return;
    }
    if (trimmed === currentName) { onClose(); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", userId);
      if (error) throw error;
      toast.success(l ? "تم تحديث الاسم" : "Name updated");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir={l ? "rtl" : "ltr"}
        style={{
          width: "100%", maxWidth: 400,
          background: "var(--sidebar)", border: "1px solid var(--border)", borderRadius: 16,
          padding: 20, color: "var(--foreground)",
          boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
          {l ? "تعديل الاسم" : "Edit name"}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
            {l ? "الاسم الكامل" : "Full name"}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              background: "var(--surface-3)", color: "var(--foreground)",
              border: "1px solid var(--border)", fontSize: 14, minHeight: 44, outline: "none",
            }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={save}
            disabled={busy}
            style={{
              flex: 1, minHeight: 44, borderRadius: 10,
              background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
              color: "#fff", border: "none", fontWeight: 800, cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >{busy ? "…" : (l ? "حفظ" : "Save")}</button>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1, minHeight: 44, borderRadius: 10,
              background: "transparent", color: "var(--foreground)",
              border: "1px solid var(--border)", fontWeight: 700, cursor: "pointer",
            }}
          >{l ? "إلغاء" : "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}
