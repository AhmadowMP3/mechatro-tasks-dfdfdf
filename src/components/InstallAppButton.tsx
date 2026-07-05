import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X, Share, Plus, AppWindow } from "lucide-react";
import { useApp } from "@/lib/app-context";

// Chrome/Edge/etc. beforeinstallprompt event shape (not in lib.dom).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "chromium" | "ios" | "macSafari" | null;

function detect(): { platform: Platform; standalone: boolean } {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { platform: null, standalone: false };
  }
  const ua = navigator.userAgent || "";
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    !!nav.standalone;

  const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const isMac = /Macintosh/.test(ua);
  const isSafari =
    /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS/.test(ua);

  if (isIOS) return { platform: "ios", standalone };
  if (isMac && isSafari) return { platform: "macSafari", standalone };
  return { platform: "chromium", standalone };
}

export function InstallAppButton() {
  const { lang } = useApp();
  const l = lang === "ar";
  const [{ platform, standalone }, setEnv] = useState<{
    platform: Platform;
    standalone: boolean;
  }>({ platform: null, standalone: false });
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setEnv(detect());
    const onBIP = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed) return null;

  // Chromium without a captured prompt yet — hide until the browser offers it.
  const canChromiumPrompt = platform === "chromium" && !!promptEvt;
  const needsInstructions = platform === "ios" || platform === "macSafari";

  if (!canChromiumPrompt && !needsInstructions) return null;

  const label = l ? "تثبيت التطبيق" : "Install app";

  const onClick = async () => {
    if (canChromiumPrompt && promptEvt) {
      try {
        await promptEvt.prompt();
        const choice = await promptEvt.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        setPromptEvt(null);
      } catch {
        /* user dismissed / not supported — no-op */
      }
      return;
    }
    setSheetOpen(true);
  };

  return (
    <>
      <button
        onClick={onClick}
        aria-label={label}
        style={{
          width: "100%",
          minHeight: 44,
          borderRadius: 12,
          background:
            "linear-gradient(135deg,rgba(29,155,240,.18),rgba(29,155,240,.06))",
          color: "#EAF2F9",
          border: "1px solid rgba(29,155,240,.35)",
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 13,
          cursor: "pointer",
          padding: "8px 12px",
          marginBottom: 10,
          boxShadow: "0 6px 20px -8px rgba(29,155,240,.45)",
        }}
      >
        <Download size={16} />
        <span>{label}</span>
      </button>
      {sheetOpen && needsInstructions && (
        <InstallInstructionsSheet
          platform={platform}
          lang={lang}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

function InstallInstructionsSheet({
  platform,
  lang,
  onClose,
}: {
  platform: Platform;
  lang: "ar" | "en";
  onClose: () => void;
}) {
  const l = lang === "ar";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const title = l ? "تثبيت ميكاترو" : "Install Mechatro";
  const steps =
    platform === "ios"
      ? l
        ? [
            { icon: <Share size={18} />, text: 'اضغط زر "المشاركة" في شريط سفاري.' },
            { icon: <Plus size={18} />, text: 'اختر "إضافة إلى الشاشة الرئيسية".' },
            { icon: <AppWindow size={18} />, text: 'اضغط "إضافة" — سيظهر ميكاترو كتطبيق مستقل.' },
          ]
        : [
            { icon: <Share size={18} />, text: "Tap the Share button in Safari's toolbar." },
            { icon: <Plus size={18} />, text: 'Choose "Add to Home Screen".' },
            { icon: <AppWindow size={18} />, text: 'Tap "Add" — Mechatro will launch like a native app.' },
          ]
      : l
        ? [
            { icon: <AppWindow size={18} />, text: 'من قائمة "ملف" في سفاري، اختر "إضافة إلى Dock".' },
            { icon: <Plus size={18} />, text: 'أكّد الاسم واضغط "إضافة".' },
            { icon: <Download size={18} />, text: "شغّل ميكاترو من الـ Dock كأي تطبيق ماك." },
          ]
        : [
            { icon: <AppWindow size={18} />, text: 'In Safari, open the File menu and choose "Add to Dock".' },
            { icon: <Plus size={18} />, text: 'Confirm the name and click "Add".' },
            { icon: <Download size={18} />, text: "Launch Mechatro from the Dock like any Mac app." },
          ];

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir={l ? "rtl" : "ltr"}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--sidebar, #0F172A)",
          color: "var(--foreground, #EAF2F9)",
          borderRadius: 20,
          border: "1px solid var(--border, rgba(255,255,255,.08))",
          padding: 20,
          boxShadow: "0 30px 70px rgba(0,0,0,.55)",
          marginBottom: "max(env(safe-area-inset-bottom), 12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
              color: "#fff",
              boxShadow: "0 0 20px rgba(29,155,240,.4)",
            }}
          >
            <Download size={18} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, flex: 1 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label={l ? "إغلاق" : "Close"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "transparent",
              color: "var(--muted, #94A3B8)",
              border: "1px solid var(--border, rgba(255,255,255,.08))",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "rgba(255,255,255,.04)",
                border: "1px solid var(--border, rgba(255,255,255,.08))",
                borderRadius: 12,
                fontSize: 13.5,
                lineHeight: 1.5,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "linear-gradient(135deg,rgba(29,155,240,.25),rgba(29,155,240,.08))",
                  color: "#7CC7FA",
                  border: "1px solid rgba(29,155,240,.35)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 800, marginInlineEnd: 6, opacity: 0.7 }}>{i + 1}.</span>
                {s.text}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>,
    document.body,
  );
}
