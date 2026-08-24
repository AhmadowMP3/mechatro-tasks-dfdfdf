import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Moon, Sun, Eye, RefreshCw, Bell, Search } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { useIsCompact } from "@/hooks/use-compact";

import { Sidebar } from "./Sidebar";
import { MobileTabBar } from "./MobileTabBar";
import logo from "@/assets/mechatro-logo.png";
import { isShareMode, getShareLink } from "@/lib/share-mode";
import { CommandPalette, openCommandPalette } from "@/lib/command-palette";
import { GlobalShortcuts } from "@/lib/shortcuts";
import { BulkActionHost } from "@/lib/bulk-selection";
import { BackupIncomingBanner } from "./BackupIncomingBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <BulkActionHost>
      <AppShellInner>{children}</AppShellInner>
      <CommandPalette />
      <GlobalShortcuts />
    </BulkActionHost>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { lang, setLang, theme, setTheme, user } = useApp();
  const queryClient = useQueryClient();
  const isMobile = useIsCompact();
  const [mobileOpen, setMobileOpen] = useState(false);
  const shareMode = isShareMode();
  const shareLink = getShareLink();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close the drawer on route change.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);


  // Notifications bell — mobile top bar only, hidden in share mode
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifs-unread", user?.id],
    enabled: !!user && !shareMode,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      return count ?? 0;
    },
  });

  const langBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: isMobile ? "6px 10px" : "8px 14px",
    minHeight: isMobile ? 36 : 44,
    borderRadius: 999,
    background: active ? "var(--grad-blue, var(--primary))" : "transparent",
    color: active ? "#fff" : "var(--foreground)",
    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
    fontWeight: 700,
    fontSize: isMobile ? 12 : 13,
    cursor: "pointer",
  });

  const iconBtn: React.CSSProperties = {
    width: isMobile ? 40 : 44,
    height: isMobile ? 40 : 44,
    borderRadius: 999,
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  // Bottom chrome spacing is handled in CSS (--bottom-space).
  const notifsActive = pathname.startsWith("/notifications");

  return (
    <div style={{ display: "flex", minHeight: "100dvh", width: "100%" }}>
      {!isMobile && (
        <>
          <Sidebar />
          {/* Spacer reserving room for the fixed sidebar */}
          <div aria-hidden style={{ width: 260, flexShrink: 0 }} />
        </>
      )}


      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.5)",
            zIndex: 200,
            display: "flex",
            justifyContent: lang === "ar" ? "flex-end" : "flex-start",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ height: "100dvh" }}>
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 6 : 8,
            padding: isMobile ? "8px 12px" : "10px 14px",
            paddingTop: isMobile ? "calc(8px + env(safe-area-inset-top, 0px))" : 10,
            borderBottom: "1px solid var(--border)",
            background: "var(--card)",
            position: "sticky",
            top: 0,
            zIndex: 50,
            minHeight: isMobile ? 56 : 60,
          }}
        >
          {isMobile && (
            <>
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="menu"
                style={iconBtn}
              >
                <Menu size={20} />
              </button>
              <img src={logo} alt="Mechatro" style={{ height: 24, flexShrink: 0 }} />
            </>
          )}
          {shareMode && (
            <div
              style={{
                padding: isMobile ? "5px 8px" : "6px 12px",
                borderRadius: 999,
                fontSize: isMobile ? 10.5 : 11.5,
                fontWeight: 800,
                background: "linear-gradient(135deg,rgba(212,175,55,.15),rgba(212,175,55,.05))",
                color: "#D4AF37",
                border: "1px solid rgba(212,175,55,.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minWidth: 0,
                overflow: "hidden",
              }}
              title={shareLink?.label ?? ""}
            >
              <Eye size={13} style={{ flexShrink: 0 }} />
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {lang === "ar" ? "عرض للقراءة فقط" : "Read-only"}
                {shareLink?.label && !isMobile ? ` · ${shareLink.label}` : ""}
              </span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 4 }} />

          {shareMode && (
            <button
              onClick={() => queryClient.invalidateQueries()}
              aria-label="refresh"
              title={lang === "ar" ? "تحديث" : "Refresh"}
              style={iconBtn}
            >
              <RefreshCw size={18} />
            </button>
          )}

          {isMobile && !shareMode && user && (
            <Link
              to="/notifications"
              aria-label="notifications"
              style={{ ...iconBtn, textDecoration: "none", position: "relative" }}
            >
              <Bell size={20} color={notifsActive ? "var(--primary)" : undefined} />
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "var(--destructive)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          )}

          {!shareMode && (
            <button
              onClick={() => openCommandPalette()}
              aria-label={lang === "ar" ? "بحث شامل" : "Global search"}
              title={lang === "ar" ? "بحث (⌘K)" : "Search (⌘K)"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: isMobile ? 40 : 44,
                padding: isMobile ? "0 10px" : "0 14px",
                borderRadius: 999,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                cursor: "pointer",
                minWidth: isMobile ? 40 : 200,
                justifyContent: isMobile ? "center" : "flex-start",
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              <Search size={16} />
              {!isMobile && (
                <>
                  <span style={{ flex: 1, textAlign: lang === "ar" ? "right" : "left" }}>
                    {lang === "ar" ? "بحث…" : "Search…"}
                  </span>
                  <kbd
                    style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                      padding: "3px 6px", borderRadius: 5,
                      background: "var(--card)", border: "1px solid var(--border)",
                      color: "var(--foreground)", fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    ⌘K
                  </kbd>
                </>
              )}
            </button>
          )}

          {!isMobile && (
            <>
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: 3,
                  flexShrink: 0,
                }}
              >
                <button onClick={() => setLang("ar")} style={langBtnStyle(lang === "ar")}>
                  عربي
                </button>
                <button onClick={() => setLang("en")} style={langBtnStyle(lang === "en")}>
                  EN
                </button>
              </div>

              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="theme"
                style={iconBtn}
              >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </>
          )}
        </header>

        <main
          className="app-main"
          style={{
            flex: 1,
            overflow: "auto",
            minWidth: 0,
          }}
        >

          <BackupIncomingBanner />
          {children}
        </main>
      </div>

      {isMobile && <MobileTabBar onMoreClick={() => setMobileOpen(true)} />}
    </div>
  );
}
