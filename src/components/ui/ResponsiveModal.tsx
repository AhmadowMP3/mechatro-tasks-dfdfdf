import * as React from "react";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * ResponsiveModal
 * - Desktop: centered card overlay (matches previous ModalShell look).
 * - Mobile:  bottom sheet with drag handle, rounded top corners, safe-area padding,
 *            and slide-up animation.
 *
 * Backdrop click closes. Content click is stopped from bubbling.
 * ESC key closes. Body scroll is locked while open.
 */
export function ResponsiveModal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const isMobile = useIsMobile();
  const maxWidth = size === "lg" ? 820 : 520;

  // ESC to close + body scroll lock.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (isMobile) {
    return (
      <div
        onClick={onClose}
        className="rm-backdrop"
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
          zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center",
          animation: "rm-fade 180ms ease-out",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="brand-card"
          style={{
            width: "100%",
            maxHeight: "92dvh",
            borderRadius: "20px 20px 0 0",
            padding: "8px 16px calc(16px + env(safe-area-inset-bottom)) 16px",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 -12px 40px rgba(0,0,0,.35)",
            animation: "rm-slide-up 220ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 8px" }}>
            <span style={{ width: 44, height: 5, borderRadius: 999, background: "var(--border)" }} />
          </div>

          {title != null && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "0 2px 10px", borderBottom: "1px solid var(--border)", marginBottom: 12,
            }}>
              <h2 style={{ margin: 0, fontSize: 18, flex: 1, minWidth: 0 }}>{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 36, height: 36, display: "grid", placeItems: "center",
                  borderRadius: 10, background: "var(--surface-2)",
                  border: "1px solid var(--border)", color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
            {children}
          </div>
        </div>

        <style>{`
          @keyframes rm-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes rm-fade { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // Desktop: centered card.
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
        zIndex: 300, display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: 12, overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="brand-card"
        style={{
          maxWidth, width: "100%",
          padding: "clamp(16px, 3vw, 24px)",
          marginTop: "max(12px, 4vh)", marginBottom: 12,
          maxHeight: "calc(100dvh - 24px)", overflowY: "auto",
        }}
      >
        {title != null && <h2 style={{ margin: 0, marginBottom: 16 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
