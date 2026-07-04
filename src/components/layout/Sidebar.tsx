import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Trophy, Bell, Settings, LogOut, X, ShieldCheck, ScrollText, Library, FileText, Share2, Eye, Pencil, Crown } from "lucide-react";
import { useState } from "react";
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

const NAV: NavItem[] = [
  { to: "/",              icon: LayoutDashboard, key: "dashboard" },
  { to: "/projects",      icon: FolderKanban,    key: "projects" },
  { to: "/tasks",         icon: CheckSquare,     key: "tasks" },
  { to: "/team",          icon: Users,           key: "team" },
  { to: "/league",        icon: Trophy,          key: "league" },
  { to: "/references",    icon: Library,         key: "references" },
  { to: "/notifications", icon: Bell,            key: "notifications" },
  { to: "/settings",      icon: Settings,        key: "settings" },
];

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

  let nav: NavItem[] = [...NAV];
  if (!shareMode) {
    if (isAdmin) {
      nav.push({ to: "/activity", icon: ScrollText, key: "activityLog" });
      nav.push({ to: "/reports-history", icon: FileText, key: "reportHistory" });
    }
    if (isMasterAdmin) {
      nav.push({ to: "/access-control", icon: ShieldCheck, key: null, label: { ar: "التحكم بالصلاحيات", en: "Access Control" } });
      nav.push({ to: "/share-links", icon: Share2, key: null, label: { ar: "روابط المشاركة", en: "Share Links" } });
    }
  } else if (shareLink) {
    // Share viewers see only the pages included in the link. Dashboard is
    // added first; activity is added if whitelisted.
    if (shareLink.allowed_pages.includes("activity")) {
      nav.push({ to: "/activity", icon: ScrollText, key: "activityLog" });
    }
    nav = nav.filter((n) => shareLink.allowed_pages.includes(PAGE_TO_KEY[n.to]));
  }


  return (
    <aside
      style={{
        width: onClose ? "min(300px, 88vw)" : 260,
        background: "linear-gradient(180deg,#050D17,#0A1A2B)",
        color: "#EAF2F9",
        display: "flex", flexDirection: "column",
        borderInlineEnd: "1px solid #1E364D",
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
          position: "relative",
        }}>
          <Avatar id={user.id} name={user.full_name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#EAF2F9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                {user.full_name}
              </div>
              {!shareMode && (
                <button
                  onClick={() => setEditOpen(true)}
                  aria-label={lang === "ar" ? "تعديل الاسم" : "Edit name"}
                  title={lang === "ar" ? "تعديل الاسم" : "Edit name"}
                  style={{
                    background: "transparent", border: "none", color: "#9FB7C9",
                    cursor: "pointer", padding: 4, borderRadius: 6, display: "inline-flex",
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {email && (
              <div dir="ltr" style={{ fontSize: 11.5, color: "#8AA3B8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
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
          background: "#0A1A2B", border: "1px solid #1E364D", borderRadius: 16,
          padding: 20, color: "#EAF2F9",
          boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
          {l ? "تعديل الاسم" : "Edit name"}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#9FB7C9", fontWeight: 700 }}>
            {l ? "الاسم الكامل" : "Full name"}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              background: "#13283D", color: "#EAF2F9",
              border: "1px solid #1E364D", fontSize: 14, minHeight: 44, outline: "none",
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
              background: "transparent", color: "#EAF2F9",
              border: "1px solid #1E364D", fontWeight: 700, cursor: "pointer",
            }}
          >{l ? "إلغاء" : "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}
