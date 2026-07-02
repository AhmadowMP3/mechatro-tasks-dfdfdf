import { useState, useEffect } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Sidebar } from "./Sidebar";
import logo from "@/assets/mechatro-logo.png";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, theme, setTheme } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const langBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 14px", minHeight: 44, borderRadius: 999,
    background: active ? "var(--grad-blue)" : "transparent",
    color: active ? "#fff" : "var(--foreground)",
    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
    fontWeight: 700, fontSize: 13, cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", minHeight: "100dvh", width: "100%" }}>
      {!isMobile && <Sidebar />}

      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
            zIndex: 200, display: "flex",
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
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--card)",
            position: "sticky", top: 0, zIndex: 50,
            minHeight: 64,
          }}
        >
          {isMobile && (
            <>
              <button
                onClick={() => setMobileOpen(true)} aria-label="menu"
                style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", cursor: "pointer" }}
              ><Menu size={22} style={{ margin: "auto" }} /></button>
              <img src={logo} alt="Mechatro" style={{ height: 30 }} />
            </>
          )}
          <div style={{ flex: 1 }} />

          <div style={{ display: "inline-flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: 3 }}>
            <button onClick={() => setLang("ar")} style={langBtnStyle(lang === "ar")}>عربي</button>
            <button onClick={() => setLang("en")} style={langBtnStyle(lang === "en")}>English</button>
          </div>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="theme"
            style={{
              width: 48, height: 48, borderRadius: 999,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--foreground)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <main style={{ flex: 1, padding: isMobile ? "16px" : "28px 32px", overflow: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
