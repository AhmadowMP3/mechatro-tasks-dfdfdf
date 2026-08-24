// Global keyboard shortcuts + cheat-sheet overlay.
//
// - G, then a letter, jumps between sections (Linear-style two-key sequence)
// - N opens a new task
// - ? / Shift+/ opens the cheat sheet
// - Esc closes any open cheat sheet or bulk selection
//
// ⌘K / "/" for the command palette are handled inside CommandPalette itself.
//
// Per-page shortcuts (J/K navigate row, X toggle, E edit, Shift+Del bulk delete)
// dispatch window events that pages can subscribe to.

import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, Command as CmdIcon } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { isShareMode, isPathAllowed } from "@/lib/share-mode";

type Combo = { keys: string[]; label: [string, string] };
type Group = { title: [string, string]; items: Combo[] };

const GROUPS: Group[] = [
  {
    title: ["عام", "General"],
    items: [
      { keys: ["⌘", "K"], label: ["فتح البحث الشامل", "Open global search"] },
      { keys: ["/"], label: ["فتح البحث الشامل", "Focus search"] },
      { keys: ["?"], label: ["عرض الاختصارات", "Show this cheat sheet"] },
      { keys: ["Esc"], label: ["إغلاق النوافذ / إلغاء التحديد", "Close overlays / clear selection"] },
    ],
  },
  {
    title: ["التنقل (G ثم…)", "Navigate (G then…)"],
    items: [
      { keys: ["G", "H"], label: ["الرئيسية", "Home"] },
      { keys: ["G", "T"], label: ["المهام", "Tasks"] },
      { keys: ["G", "P"], label: ["المشاريع", "Projects"] },
      { keys: ["G", "M"], label: ["الفريق", "Team (Members)"] },
      { keys: ["G", "L"], label: ["الدوري", "League"] },
      { keys: ["G", "R"], label: ["المراجع", "References"] },
      { keys: ["G", "N"], label: ["الإشعارات", "Notifications"] },
      { keys: ["G", "S"], label: ["الإعدادات", "Settings"] },
      { keys: ["G", "A"], label: ["سجل النشاط", "Activity Log"] },
      { keys: ["G", "U"], label: ["المستخدمين والدعوات", "People & Invites"] },
    ],
  },
  {
    title: ["إجراءات", "Actions"],
    items: [
      { keys: ["N"], label: ["مهمة جديدة", "New task"] },
      { keys: ["J"], label: ["العنصر التالي", "Next row"] },
      { keys: ["K"], label: ["العنصر السابق", "Previous row"] },
      { keys: ["X"], label: ["تحديد العنصر الحالي", "Toggle selection on focused row"] },
      { keys: ["E"], label: ["تعديل العنصر الحالي", "Edit focused row"] },
      { keys: ["A"], label: ["تحديد الكل في القائمة", "Select all in current list"] },
      { keys: ["⇧", "Del"], label: ["حذف المحدد", "Bulk delete selected"] },
    ],
  },
];

const NAV_MAP: Record<string, string> = {
  h: "/",
  t: "/tasks",
  p: "/projects",
  m: "/team",
  l: "/league",
  r: "/references",
  n: "/notifications",
  s: "/settings",
  a: "/activity",
  u: "/access-control",
};

export function GlobalShortcuts() {
  const navigate = useNavigate();
  const { lang, isAdmin, user } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [cheatOpen, setCheatOpen] = useState(false);

  useEffect(() => {
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;
    const clearG = () => { pendingG = false; if (gTimer) clearTimeout(gTimer); gTimer = null; };

    const onKey = (e: KeyboardEvent) => {
      // Ignore when the user is typing anywhere.
      if (isTypingTarget(e.target)) return;
      // Ignore when a mod key that we don't handle is held.
      if (e.altKey) return;

      const k = e.key;

      // "?" or Shift+/ opens cheat sheet
      if (k === "?" || (k === "/" && e.shiftKey)) {
        e.preventDefault();
        setCheatOpen(true);
        clearG();
        return;
      }

      // Esc closes cheat sheet or clears bulk selection
      if (k === "Escape") {
        if (cheatOpen) { setCheatOpen(false); return; }
        window.dispatchEvent(new CustomEvent("bulk:clear", { detail: {} }));
        clearG();
        return;
      }

      // Command-palette handled elsewhere.
      if ((e.metaKey || e.ctrlKey) && (k === "k" || k === "K")) return;

      // Ignore all other combos with mod keys.
      if (e.metaKey || e.ctrlKey) {
        clearG();
        return;
      }

      // Two-key G sequence.
      if (pendingG) {
        const target = NAV_MAP[k.toLowerCase()];
        clearG();
        if (target) {
          // Respect share-mode allowed paths and admin gating.
          const adminOnly = ["/activity", "/access-control", "/reports", "/reports-history"];
          if (adminOnly.includes(target) && !isAdmin) return;
          if (isShareMode() && !isPathAllowed(target)) return;
          e.preventDefault();
          navigate({ to: target });
        }
        return;
      }
      if (k === "g" || k === "G") {
        e.preventDefault();
        pendingG = true;
        gTimer = setTimeout(clearG, 1200);
        return;
      }

      // Single-key actions
      if (k === "n" || k === "N") {
        if (isAdmin && (pathname === "/tasks" || pathname === "/")) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("app:new-task"));
        }
        return;
      }

      if (k === "j" || k === "J") { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:down")); return; }
      if (k === "k" || k === "K") { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:up")); return; }
      if (k === "x" || k === "X") { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:toggle-select")); return; }
      if (k === "e" || k === "E") { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:edit")); return; }
      if (k === "a" || k === "A") { e.preventDefault(); window.dispatchEvent(new CustomEvent("bulk:select-all", { detail: {} })); return; }
      if (e.shiftKey && (k === "Delete" || k === "Backspace")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("bulk:delete", { detail: {} }));
        return;
      }
    };

    // Explicit event to open cheat sheet (from palette / help buttons)
    const openCheat = () => setCheatOpen(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener("app:shortcuts", openCheat);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:shortcuts", openCheat);
      clearG();
    };
  }, [navigate, isAdmin, pathname, cheatOpen]);

  if (!user && !isShareMode()) return null;

  return (
    <ShortcutsCheatSheet open={cheatOpen} onClose={() => setCheatOpen(false)} lang={lang} />
  );
}

function ShortcutsCheatSheet({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: "ar" | "en" }) {
  if (!open) return null;
  const l = lang === "ar";
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(2,6,23,.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "88vh", overflow: "auto",
          borderRadius: 18, background: "var(--card)", border: "1px solid var(--border)",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "var(--grad-blue, #189FD1)", color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <CmdIcon size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{l ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {l ? "اضغط ؟ في أي وقت لعرض هذه القائمة" : "Press ? anywhere to reopen"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--foreground)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
          {GROUPS.map((g) => (
            <div key={g.title[0]}>
              <div style={{
                fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2,
                fontWeight: 800, color: "var(--muted)", marginBottom: 8,
              }}>
                {g.title[l ? 0 : 1]}
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 300px),1fr))",
                gap: 6,
              }}>
                {g.items.map((it) => (
                  <div key={it.label[1]} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 10,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                  }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{it.label[l ? 0 : 1]}</span>
                    <span style={{ display: "inline-flex", gap: 4 }}>
                      {it.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      minWidth: 24, height: 24, padding: "0 6px", borderRadius: 6,
      background: "var(--card)", border: "1px solid var(--border)",
      color: "var(--foreground)", fontSize: 11, fontWeight: 800,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      boxShadow: "inset 0 -1px 0 var(--border)",
    }}>
      {children}
    </kbd>
  );
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}
