// Public read-only viewer opened by the QR code printed on every document.
// No sign-in required; the token is the capability. Printing and downloading
// are intentionally disabled — this copy is for reading only.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPublicShare, type PublicShareRow } from "@/lib/share/public-share";
import logo from "@/assets/mechatro-logo.png";

export const Route = createFileRoute("/v/$token")({
  ssr: false,
  component: PublicDocView,
  head: () => ({
    meta: [
      { title: "نسخة للقراءة فقط · Mechatro" },
      { name: "description", content: "Read-only copy of a Mechatro document. Not intended for printing." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Read-only document · Mechatro" },
      { property: "og:description", content: "Read-only copy of a Mechatro document." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const READONLY_CSS = `
  html, body { user-select: none !important; -webkit-user-select: none !important; }
  #print-root, .doc-page { box-shadow: 0 10px 40px rgba(0,0,0,.45); margin: 0 auto 18px; }
  .doc-page { break-after: auto !important; page-break-after: auto !important; }
  body::before {
    content: "";
    position: fixed; inset: 0; pointer-events: none; z-index: 999;
    background: repeating-linear-gradient(45deg, rgba(255,255,255,.012) 0 120px, rgba(255,255,255,0) 120px 240px);
  }
  @media print { html, body { display: none !important; } }
`;

function PublicDocView() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<PublicShareRow | null | "loading">("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(1200);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let alive = true;
    void fetchPublicShare(token).then((r) => { if (alive) setRow(r); });
    return () => { alive = false; };
  }, [token]);

  // Block the browser print shortcut / context menu on this page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); e.stopPropagation(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); }
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, []);

  const doc = row !== "loading" && row ? row : null;
  const lang = (doc?.lang === "en" ? "en" : "ar") as "ar" | "en";
  const ar = lang === "ar";

  const srcDoc = useMemo(() => {
    if (!doc?.payload?.html) return null;
    const dir = lang === "ar" ? "rtl" : "ltr";
    return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/>
<style>${doc.payload.css ?? ""}</style><style>${READONLY_CSS}</style></head>
<body><div id="print-root">${doc.payload.html}</div></body></html>`;
  }, [doc, lang]);

  // Fit the 794px A4 sheet into the viewport and follow the content height.
  useEffect(() => {
    const measure = () => {
      const w = Math.min(window.innerWidth - 24, 794);
      setScale(Math.min(1, w / 794));
      const f = frameRef.current;
      const h = f?.contentDocument?.body?.scrollHeight;
      if (h && h > 200) setFrameHeight(h + 40);
    };
    measure();
    const id = window.setInterval(measure, 600);
    window.addEventListener("resize", measure);
    return () => { window.clearInterval(id); window.removeEventListener("resize", measure); };
  }, [srcDoc]);

  return (
    <div style={{ minHeight: "100dvh", background: "#050C15", color: "#E6EEF7", direction: ar ? "rtl" : "ltr" }}>
      <style>{"@media print { body { display: none !important; } }"}</style>

      <header
        style={{
          position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 12,
          padding: "10px clamp(12px, 4vw, 28px)", background: "rgba(8,19,32,.92)",
          borderBottom: "1px solid #1E3A57", backdropFilter: "blur(8px)", flexWrap: "wrap",
        }}
      >
        <img src={logo} alt="Mechatro" style={{ width: 30, height: 30, objectFit: "contain" }} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>mechatro</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{doc?.title ?? (ar ? "مستند" : "Document")}</div>
        </div>
        <span
          style={{
            fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
            background: "rgba(212,160,23,.14)", color: "#F0C24B", border: "1px solid rgba(212,160,23,.4)",
          }}
        >
          {ar ? "نسخة للقراءة فقط — غير مخصصة للطباعة" : "Read-only copy — not for printing"}
        </span>
      </header>

      <main style={{ padding: "18px 0 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {row === "loading" && <div style={{ color: "#94A3B8", fontSize: 13, padding: 40 }}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>}

        {row !== "loading" && !doc && (
          <div style={{ maxWidth: 460, textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{ar ? "الرابط غير صالح" : "Invalid link"}</h1>
            <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.7 }}>
              {ar
                ? "هذا الرابط منتهي أو تم إبطاله. اطلب رمز QR جديداً من مُصدِر المستند."
                : "This link has expired or was revoked. Ask the document issuer for a fresh QR code."}
            </p>
          </div>
        )}

        {doc && !srcDoc && (
          <div style={{ maxWidth: 460, textAlign: "center", padding: 40, fontSize: 13, color: "#94A3B8" }}>
            {ar ? "لم تُحفظ نسخة القراءة لهذا المستند بعد. أعد تصدير الملف ثم امسح الرمز مرة أخرى." : "The read-only copy is not stored yet. Re-export the file and scan again."}
          </div>
        )}

        {srcDoc && (
          <div style={{ width: 794 * scale, height: frameHeight * scale, overflow: "hidden" }}>
            <iframe
              ref={frameRef}
              title={doc?.title ?? "document"}
              sandbox="allow-same-origin"
              srcDoc={srcDoc}
              style={{
                width: 794, height: frameHeight, border: 0, background: doc?.payload?.background ?? "#081320",
                transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none",
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
