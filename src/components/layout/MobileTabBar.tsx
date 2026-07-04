import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  Trophy,
  Library,
  MoreHorizontal,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import type { DictKey } from "@/i18n/dict";
import { isShareMode, getShareLink } from "@/lib/share-mode";

type Tab = {
  to: string;
  icon: React.ComponentType<{ size?: number }>;
  key: DictKey;
  pageKey: string;
};

const ALL_TABS: Tab[] = [
  { to: "/",           icon: LayoutDashboard, key: "dashboard",  pageKey: "dashboard" },
  { to: "/tasks",      icon: CheckSquare,     key: "tasks",      pageKey: "tasks" },
  { to: "/projects",   icon: FolderKanban,    key: "projects",   pageKey: "projects" },
  { to: "/team",       icon: Users,           key: "team",       pageKey: "team" },
  { to: "/league",     icon: Trophy,          key: "league",     pageKey: "league" },
  { to: "/references", icon: Library,         key: "references", pageKey: "references" },
];

export function MobileTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const { t, lang } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const shareMode = isShareMode();
  const shareLink = getShareLink();

  let tabs = ALL_TABS.slice();
  if (shareMode && shareLink) {
    tabs = tabs.filter((tab) => shareLink.allowed_pages.includes(tab.pageKey));
  }
  const primary = tabs.slice(0, 4);

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  const cell = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    padding: "6px 4px",
    color: active ? "var(--primary)" : "var(--muted)",
    textDecoration: "none",
    fontSize: 10.5,
    fontWeight: 700,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    position: "relative",
  });

  const moreLabel = lang === "ar" ? "المزيد" : "More";

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        insetInline: 0,
        bottom: 0,
        zIndex: 60,
        background: "color-mix(in oklab, var(--card) 92%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {primary.map(({ to, icon: Icon, key }) => {
          const active = isActive(to);
          return (
            <Link key={to} to={to} style={cell(active)}>
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    insetInline: "22%",
                    height: 3,
                    borderRadius: "0 0 3px 3px",
                    background: "var(--primary)",
                  }}
                />
              )}
              <Icon size={22} />
              <span
                style={{
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t(key)}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onMoreClick}
          aria-label={moreLabel}
          style={cell(false)}
        >
          <MoreHorizontal size={22} />
          <span>{moreLabel}</span>
        </button>
      </div>
    </nav>
  );
}
