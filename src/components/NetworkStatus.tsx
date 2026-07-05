import React, { useEffect, useState } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { dict } from "@/i18n/dict";

type Status = "online" | "offline" | "slow" | "reconnecting";

export function NetworkStatus() {
  const { lang } = useApp();
  const t = (k: keyof typeof dict) => dict[k]?.[lang] ?? String(k);

  const [status, setStatus] = useState<Status>(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online",
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      setStatus("reconnecting");
      setVisible(true);
      setTimeout(() => {
        setStatus("online");
        setTimeout(() => setVisible(false), 1800);
      }, 700);
    };
    const onOffline = () => { setStatus("offline"); setVisible(true); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Detect "slow" via Network Information API when available.
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void } }).connection;
    const evaluate = () => {
      if (!navigator.onLine) return;
      const et = conn?.effectiveType;
      if (et === "slow-2g" || et === "2g") {
        setStatus("slow");
        setVisible(true);
      } else {
        setStatus((s) => (s === "slow" ? "online" : s));
      }
    };
    evaluate();
    conn?.addEventListener?.("change", evaluate);

    // Show offline pill immediately if we start offline
    if (!navigator.onLine) setVisible(true);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      conn?.removeEventListener?.("change", evaluate);
    };
  }, []);

  if (!visible) return null;

  const cfg: Record<Status, { bg: string; label: string; icon: React.ReactNode }> = {
    online: { bg: "linear-gradient(135deg,#16a34a,#22c55e)", label: t("online"), icon: <Wifi size={14} /> },
    reconnecting: { bg: "linear-gradient(135deg,#0284c7,#38bdf8)", label: t("reconnecting"), icon: <Loader2 size={14} className="spin" /> },
    slow: { bg: "linear-gradient(135deg,#b45309,#f59e0b)", label: t("slowConnection"), icon: <Wifi size={14} /> },
    offline: { bg: "linear-gradient(135deg,#991b1b,#ef4444)", label: t("offline"), icon: <WifiOff size={14} /> },
  };
  const c = cfg[status];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 12,
        insetInlineEnd: 12,
        zIndex: 1000,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        background: c.bg,
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        boxShadow: "0 6px 22px rgba(0,0,0,.25)",
        backdropFilter: "blur(6px)",
        transition: "opacity .3s ease",
      }}
    >
      {c.icon}
      <span>{c.label}</span>
      <style>{`.spin{animation:nsspin 1s linear infinite}@keyframes nsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
