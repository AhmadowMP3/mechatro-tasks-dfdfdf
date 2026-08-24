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

const A4_W = 794;
const A4_H = 1123;
const PAGE_GAP = 18;

/** Repeated diagonal "not for printing" watermark, drawn as an inline SVG tile
 *  so it works inside the sandboxed iframe with no external fonts. */
function watermarkTile(lang: "ar" | "en"): string {
  const ar = "غير مخصص للطباعة";
  const en = "NOT FOR PRINTING";
  const primary = lang === "ar" ? ar : en;
  const secondary = lang === "ar" ? en : ar;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="270" viewBox="0 0 430 270">
  <g transform="rotate(-30 215 135)" text-anchor="middle" font-family="'Cairo','Montserrat Arabic','Segoe UI',sans-serif" font-weight="700">
    <text x="215" y="128" font-size="34" fill="rgba(212,160,23,0.16)">${primary}</text>
    <text x="215" y="160" font-size="17" letter-spacing="3" fill="rgba(148,163,184,0.16)">${secondary}</text>
  </g>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function readonlyCss(lang: "ar" | "en"): string {
  const tile = watermarkTile(lang);
  return `
  html, body {
    user-select: none !important; -webkit-user-select: none !important;
    overflow-x: hidden !important; margin: 0; padding: 0;
  }
  #print-root { width: ${A4_W}px; margin: 0 auto; }
  #print-root, .doc-page { box-shadow: 0 10px 40px rgba(0,0,0,.45); margin: 0 auto ${PAGE_GAP}px; }
  .doc-page { break-after: auto !important; page-break-after: auto !important; position: relative; }
  .doc-page::after,
  #print-root:not(:has(.doc-page))::after {
    content: ""; position: absolute; inset: 0; z-index: 900;
    pointer-events: none; background-image: ${tile}; background-repeat: repeat;
  }
  #print-root:not(:has(.doc-page)) { position: relative; }
  @media print { html, body { display: none !important; } }
`;
}

function PublicDocView() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<PublicShareRow | null | "loading">("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(A4_H);
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
<style>${doc.payload.css ?? ""}</style><style>${readonlyCss(lang)}</style></head>
<body><div id="print-root">${doc.payload.html}</div></body></html>`;
  }, [doc, lang]);

  // Fit the A4 sheet to the available width and follow the real content height.
  useEffect(() => {
    if (!srcDoc) return;
    let raf = 0;

    const contentHeight = (): number => {
      const d = frameRef.current?.contentDocument;
      if (!d) return A4_H;
      const pages = d.querySelectorAll(".doc-page").length;
      // Pre-paginated documents have an exact height — trust it over scrollHeight,
      // which overshoots inside a fixed-height iframe.
      if (pages > 0) return pages * A4_H + pages * PAGE_GAP;
      const root = d.getElementById("print-root");
      const h = Math.max(root?.scrollHeight ?? 0, d.body?.scrollHeight ?? 0);
      return h > 200 ? h + PAGE_GAP : A4_H;
    };

    const measure = () => {
      const avail = (shellRef.current?.clientWidth ?? window.innerWidth) - 8;
      setScale(Math.min(1, Math.max(0.2, avail / A4_W)));
      setFrameHeight(contentHeight());
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    if (shellRef.current) ro.observe(shellRef.current);

    // Watch the iframe document (fonts/images settle after load).
    let innerRo: ResizeObserver | null = null;
    const attach = () => {
      const body = frameRef.current?.contentDocument?.body;
      if (!body) return false;
      innerRo = new ResizeObserver(schedule);
      innerRo.observe(body);
      return true;
    };
    if (!attach()) frameRef.current?.addEventListener("load", attach, { once: true });
    const timers = [150, 400, 900, 1800].map((ms) => window.setTimeout(schedule, ms));
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      innerRo?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", schedule);
    };
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

      <main style={{ padding: "18px 4px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div ref={shellRef} style={{ width: "100%", maxWidth: A4_W, display: "flex", flexDirection: "column", alignItems: "center" }}>
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
          <div style={{ width: A4_W * scale, height: frameHeight * scale, overflow: "hidden", direction: "ltr" }}>
            <iframe
              ref={frameRef}
              title={doc?.title ?? "document"}
              sandbox="allow-same-origin"
              srcDoc={srcDoc}
              scrolling="no"
              style={{
                width: A4_W, height: frameHeight, border: 0, background: doc?.payload?.background ?? "#081320",
                transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none",
                display: "block",
              }}
            />
          </div>
        )}
        </div>
      </main>

    </div>
  );
}
