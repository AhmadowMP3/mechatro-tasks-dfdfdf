import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Trophy, Bell, Settings, LogOut, X, ShieldCheck, ScrollText, Library, FileText, Share2, Eye, Pencil, Crown, UserPlus, ChevronDown, KeyRound, Compass, Briefcase, UsersRound, BarChart3, UserCog, Wallet, Receipt, TrendingDown, TrendingUp, Building2, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { RoleBadge } from "@/components/Pills";
import { Avatar } from "@/components/Avatar";
import logo from "@/assets/mechatro-logo.png";
import type { DictKey } from "@/i18n/dict";
import { isShareMode, getShareLink } from "@/lib/share-mode";
import { InstallAppButton } from "@/components/InstallAppButton";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";


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
  financeOnly?: boolean;
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
      { to: "/notes",      icon: StickyNote,   key: null, label: { ar: "الملاحظات", en: "Notes" } },
    ],
  },
  {
    titleKey: "teamSection",
    icon: UsersRound,
    items: [
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
    titleKey: "financeSection",
    icon: Wallet,
    masterOnly: true,
    items: [
      { to: "/finance",           icon: BarChart3,    key: null, label: { ar: "لوحة مالية", en: "Finance" } },
      { to: "/finance/invoices",  icon: FileText,     key: null, label: { ar: "الفواتير", en: "Invoices" } },
      { to: "/finance/customers", icon: Building2,    key: null, label: { ar: "العملاء", en: "Customers" } },
      { to: "/finance/expenses",  icon: TrendingDown, key: null, label: { ar: "المصاريف", en: "Expenses" } },
      { to: "/finance/income",    icon: TrendingUp,   key: null, label: { ar: "الدخل", en: "Income" } },
      { to: "/finance/payroll",   icon: Wallet,       key: null, label: { ar: "الرواتب", en: "Payroll" } },
      { to: "/finance/subscriptions", icon: Receipt,  key: null, label: { ar: "الاشتراكات", en: "Subscriptions" } },
    ],
  },
  {
    titleKey: "adminSection",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { to: "/team",           icon: Users,    key: "team" },
      { to: "/access-control", icon: UserPlus, key: null, label: { ar: "الأعضاء والدعوات", en: "People & Invites" } },
      { to: "/documents",      icon: FileText, key: null, label: { ar: "المستندات التجارية", en: "Business Documents" } },
      { to: "/doc-templates",  icon: FileText, key: null, label: { ar: "قوالب المستندات", en: "Document Templates" } },
      
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
  const { t, user, session, lang, signOut, isMasterAdmin, isAdmin, isFinanceAdmin, refreshSelf } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const shareMode = isShareMode();
  const shareLink = getShareLink();
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const email = user?.email ?? session?.user?.email ?? "";

  // Per-section collapse state, persisted to localStorage.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);
  const toggleSection = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const PAGE_TO_KEY: Record<string, string> = {
    "/": "dashboard", "/projects": "projects", "/tasks": "tasks",
    "/team": "team", "/league": "league", "/references": "references",
    "/activity": "activity",
  };

  // Build visible sections based on role + share mode.
  const sections: NavSection[] = NAV_SECTIONS
    .map((section) => {
      let items = section.items;

      // "doc-templates" and "documents" are master-only within the admin section
      if (section.titleKey === "adminSection") {
        items = items.filter(
          (i) => (i.to !== "/doc-templates" && i.to !== "/documents") || isMasterAdmin,
        );
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
      if (section.financeOnly && !isFinanceAdmin) return { ...section, items: [] };
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
              {!shareMode && (
                <button
                  onClick={() => setPwOpen(true)}
                  aria-label={lang === "ar" ? "تغيير كلمة المرور" : "Change password"}
                  title={lang === "ar" ? "تغيير كلمة المرور" : "Change password"}
                  style={{
                    background: "transparent", border: "none", color: "var(--muted)",
                    cursor: "pointer", padding: 4, borderRadius: 6, display: "inline-flex",
                  }}
                >
                  <KeyRound size={14} />
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

      {pwOpen && user && (
        <ChangePasswordModal lang={lang} onClose={() => setPwOpen(false)} />
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

      <nav
        aria-label={lang === "ar" ? "التنقل الرئيسي" : "Main navigation"}
        style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}
        onKeyDown={(e) => {
          const key = e.key;
          if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
          const target = e.target as HTMLElement;
          if (!target.matches("[data-sidebar-nav]")) return;
          const nav = e.currentTarget;
          const nodes = Array.from(
            nav.querySelectorAll<HTMLElement>("[data-sidebar-nav]"),
          ).filter((el) => !el.closest("[hidden]"));
          if (nodes.length === 0) return;
          const idx = nodes.indexOf(target);
          let next = idx;
          if (key === "ArrowDown") next = Math.min(nodes.length - 1, idx + 1);
          else if (key === "ArrowUp") next = Math.max(0, idx - 1);
          else if (key === "Home") next = 0;
          else if (key === "End") next = nodes.length - 1;
          if (next !== idx) {
            e.preventDefault();
            nodes[next]?.focus();
          }
        }}
      >
        {sections.map((section, sIdx) => {
          const SectionIcon = section.icon;
          const hasDeeperSibling = (to: string) =>
            section.items.some((it) => it.to !== to && it.to.startsWith(to + "/"));
          const isItemActive = (to: string) =>
            to === "/"
              ? pathname === "/"
              : hasDeeperSibling(to)
                ? pathname === to
                : pathname === to || pathname.startsWith(to + "/");
          const hasActive = section.items.some(({ to }) => isItemActive(to));
          const isCollapsed = !!collapsed[section.titleKey] && !hasActive;

          const sectionLabel = t(section.titleKey);
          const panelId = `sidebar-section-${section.titleKey}`;
          return (
            <div key={section.titleKey} style={{ marginBottom: 10 }}>
              <button
                type="button"
                data-sidebar-nav
                onClick={() => toggleSection(section.titleKey)}
                aria-expanded={!isCollapsed}
                aria-controls={panelId}
                aria-label={sectionLabel}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                  marginTop: sIdx === 0 ? 0 : 2,
                  marginBottom: 4,
                  background: "transparent",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  color: hasActive ? "var(--foreground)" : "var(--muted)",
                  flexDirection: lang === "ar" ? "row-reverse" : "row",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: 7,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: hasActive
                      ? "var(--grad-blue)"
                      : "linear-gradient(135deg,rgba(29,155,240,.14),rgba(29,155,240,.05))",
                    color: hasActive ? "#fff" : "rgba(29,155,240,.9)",
                    border: hasActive ? "1px solid transparent" : "1px solid rgba(29,155,240,.25)",
                    flexShrink: 0,
                    boxShadow: hasActive ? "0 0 12px rgba(29,155,240,.35)" : "none",
                  }}
                >
                  <SectionIcon size={12} />
                </span>
                <span
                  style={{
                    fontSize: 10.5, fontWeight: 800,
                    letterSpacing: ".14em", textTransform: "uppercase",
                    flex: 1,
                    textAlign: lang === "ar" ? "right" : "left",
                  }}
                >
                  {sectionLabel}
                </span>
                <ChevronDown
                  size={14}
                  aria-hidden
                  style={{
                    transition: "transform .2s ease",
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    opacity: 0.7,
                    flexShrink: 0,
                  }}
                />
              </button>

              <div
                id={panelId}
                role="group"
                aria-label={sectionLabel}
                hidden={isCollapsed}
              >
                {section.items.map((item) => {
                  const { to, icon: Icon } = item;
                  const active = isItemActive(to);
                  const label = "label" in item && item.label
                    ? item.label[lang]
                    : t(item.key as DictKey);
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={onClose}
                      data-sidebar-nav
                      aria-current={active ? "page" : undefined}
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
                        boxShadow: active ? "0 6px 20px rgba(29,155,240,.35)" : "none",
                        border: active ? "1px solid rgba(255,255,255,.08)" : "1px solid transparent",
                        transition: "background .15s ease, color .15s ease",
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
            </div>
          );
        })}
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
          <>
            <InstallAppButton />
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
          </>
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

  if (typeof document === "undefined") return null;

  return createPortal(
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
    </div>,
    document.body
  );
}
