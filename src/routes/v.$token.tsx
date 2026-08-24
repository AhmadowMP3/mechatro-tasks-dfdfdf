// Public read-only viewer opened by the QR code printed on every document.
// No sign-in required; the token is the capability. Printing and downloading
// are intentionally disabled — this copy is for reading only.
//
// Two viewing modes:
//  - "reflow": mobile-friendly reading mode; the document content is re-laid out
//    to the screen width instead of being shrunk down to an unreadable A4 sheet.
//  - "paper": the exact A4 sheet, fitted to width, with zoom (buttons, wheel and
//    two-finger pinch) and pan by scrolling.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Maximize2, Minus, Plus, ScanLine } from "lucide-react";
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
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const MODE_KEY = "mechatro:viewer-mode";

type Mode = "reflow" | "paper";

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

function baseCss(lang: "ar" | "en"): string {
  const tile = watermarkTile(lang);
  return `
  html, body {
    user-select: none !important; -webkit-user-select: none !important;
    overflow-x: hidden !important; margin: 0; padding: 0;
  }
  .doc-page { position: relative; break-after: auto !important; page-break-after: auto !important; }
  .doc-page::after,
  #print-root:not(:has(.doc-page))::after {
    content: ""; position: absolute; inset: 0; z-index: 900;
    pointer-events: none; background-image: ${tile}; background-repeat: repeat;
  }
  #print-root:not(:has(.doc-page)) { position: relative; }
  @media print { html, body { display: none !important; } }
`;
}

/** Exact A4 sheets, centered. */
function paperCss(): string {
  return `
  #print-root { width: ${A4_W}px; margin: 0 auto; }
  #print-root, .doc-page { box-shadow: 0 10px 40px rgba(0,0,0,.45); margin: 0 auto ${PAGE_GAP}px; }
`;
}

/** Mobile reading mode: let the document flow to the viewport width instead of
 *  keeping the rigid 794px A4 geometry (which pushed text off-screen). */
function reflowCss(): string {
  return `
  html, body { width: 100% !important; }
  #print-root {
    width: 100% !important; max-width: 100% !important; margin: 0 !important;
    box-shadow: none !important;
  }
  .doc-page {
    width: 100% !important; max-width: 100% !important;
    height: auto !important; min-height: 0 !important;
    margin: 0 0 14px !important; padding: 14px !important;
    box-sizing: border-box !important; box-shadow: none !important;
    transform: none !important; overflow: visible !important;
  }
  /* Absolutely-positioned letterhead chrome (headers / footers / QR rows) must
     join the normal flow, otherwise it stacks on top of the body text. */
  .doc-page [style*="position:absolute"],
  .doc-page [style*="position: absolute"],
  .doc-page [style*="position:fixed"],
  .doc-page [style*="position: fixed"] {
    position: static !important; inset: auto !important;
    left: auto !important; right: auto !important; top: auto !important; bottom: auto !important;
    width: auto !important; max-width: 100% !important;
  }
  .doc-page * { max-width: 100% !important; }
  img, svg, canvas { max-width: 100% !important; height: auto !important; }
  /* Wide tables scroll inside their own box, never the page. */
  table { width: 100% !important; max-width: 100% !important; table-layout: auto !important; }
  table, thead, tbody, tr, td, th { word-break: break-word !important; }
  td, th { padding: 6px !important; font-size: 12px !important; }
  /* Grid letterheads collapse to a single column on narrow screens. */
  @media (max-width: 700px) {
    .doc-page [style*="display:grid"],
    .doc-page [style*="display: grid"] {
      display: block !important;
    }
    body { font-size: 14px !important; }
  }
`;
}

function PublicDocView() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<PublicShareRow | null | "loading">("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(A4_H);
  const [shellWidth, setShellWidth] = useState(A4_W);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to width
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "paper";
    const saved = window.sessionStorage.getItem(MODE_KEY);
    if (saved === "paper" || saved === "reflow") return saved;
    return window.innerWidth < 820 ? "reflow" : "paper";
  });

  useEffect(() => {
    let alive = true;
    void fetchPublicShare(token).then((r) => { if (alive) setRow(r); });
    return () => { alive = false; };
  }, [token]);

  const setModePersist = useCallback((m: Mode) => {
    setMode(m);
    setZoom(null);
    try { window.sessionStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }, []);

  // Block the browser print shortcut / context menu on this page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault(); e.stopPropagation();
      }
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
    const modeCss = mode === "paper" ? paperCss() : reflowCss();
    return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${doc.payload.css ?? ""}</style><style>${baseCss(lang)}</style><style>${modeCss}</style></head>
<body><div id="print-root">${doc.payload.html}</div></body></html>`;
  }, [doc, lang, mode]);

  // Measure available width, the fit-to-width scale and the real content height.
  useEffect(() => {
    if (!srcDoc) return;
    let raf = 0;

    const contentHeight = (avail: number): number => {
      const d = frameRef.current?.contentDocument;
      if (!d) return A4_H;
      if (mode === "paper") {
        const pages = d.querySelectorAll(".doc-page").length;
        // Pre-paginated documents have an exact height — trust it over scrollHeight,
        // which overshoots inside a fixed-height iframe.
        if (pages > 0) return pages * A4_H + pages * PAGE_GAP;
      }
      const root = d.getElementById("print-root");
      const h = Math.max(root?.scrollHeight ?? 0, d.body?.scrollHeight ?? 0, d.documentElement?.scrollHeight ?? 0);
      return h > 200 ? h + PAGE_GAP : (mode === "paper" ? A4_H : Math.max(400, avail));
    };

    const measure = () => {
      const avail = Math.max(240, (shellRef.current?.clientWidth ?? window.innerWidth) - 8);
      setShellWidth(avail);
      setFitScale(Math.min(1, Math.max(MIN_ZOOM, avail / A4_W)));
      setFrameHeight(contentHeight(avail));
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
    const timers = [150, 400, 900, 1800, 3000].map((ms) => window.setTimeout(schedule, ms));
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    const mq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener?.("change", schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      innerRo?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      mq.removeEventListener?.("change", schedule);
    };
  }, [srcDoc, mode]);

  const scale = mode === "paper" ? (zoom ?? fitScale) : 1;
  const iframeWidth = mode === "paper" ? A4_W : shellWidth;

  // Wheel / trackpad-pinch zoom in paper mode (non-passive so the page never scrolls behind).
  useEffect(() => {
    if (mode !== "paper") return;
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling the document
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setZoom((z) => {
        const cur = z ?? fitScale;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur * Math.exp(-dy * 0.0015)));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode, fitScale]);

  // Two-finger pinch zoom on touch screens.
  useEffect(() => {
    if (mode !== "paper") return;
    const el = viewportRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDist = dist(e.touches);
      startZoom = zoom ?? fitScale;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const k = dist(e.touches) / startDist;
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom * k)));
    };
    const onEnd = () => { startDist = 0; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [mode, zoom, fitScale]);

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
    background: "rgba(30,58,87,.5)", color: "#E6EEF7", border: "1px solid #1E3A57",
    cursor: "pointer", whiteSpace: "nowrap",
  };
  const btnActive: React.CSSProperties = {
    ...btn, background: "rgba(212,160,23,.16)", color: "#F0C24B", borderColor: "rgba(212,160,23,.45)",
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#050C15", color: "#E6EEF7", direction: ar ? "rtl" : "ltr", overflowX: "hidden" }}>
      <style>{"@media print { body { display: none !important; } }"}</style>

      <header
        style={{
          position: "sticky", top: 0, zIndex: 20,
          display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10,
          padding: "10px clamp(10px, 3vw, 24px)", background: "rgba(8,19,32,.94)",
          borderBottom: "1px solid #1E3A57", backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <img src={logo} alt="Mechatro" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>mechatro</div>
            <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc?.title ?? (ar ? "مستند" : "Document")}
            </div>
          </div>
        </div>

        {srcDoc && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" style={mode === "reflow" ? btnActive : btn} onClick={() => setModePersist("reflow")}>
              <FileText size={14} /> {ar ? "قراءة" : "Read"}
            </button>
            <button type="button" style={mode === "paper" ? btnActive : btn} onClick={() => setModePersist("paper")}>
              <ScanLine size={14} /> {ar ? "الورقة" : "Paper"}
            </button>
            {mode === "paper" && (
              <>
                <button type="button" style={{ ...btn, padding: "0 9px" }} aria-label="zoom out"
                  onClick={() => setZoom((z) => Math.max(MIN_ZOOM, (z ?? fitScale) / 1.2))}>
                  <Minus size={14} />
                </button>
                <button type="button" style={{ ...btn, padding: "0 9px" }} aria-label="zoom in"
                  onClick={() => setZoom((z) => Math.min(MAX_ZOOM, (z ?? fitScale) * 1.2))}>
                  <Plus size={14} />
                </button>
                <button type="button" style={btn} onClick={() => setZoom(null)}>
                  <Maximize2 size={14} /> {ar ? "ملء العرض" : "Fit"}
                </button>
                <button type="button" style={btn} onClick={() => setZoom(1)}>100%</button>
              </>
            )}
          </div>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <span
            style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 999,
              background: "rgba(212,160,23,.14)", color: "#F0C24B", border: "1px solid rgba(212,160,23,.4)",
            }}
          >
            {ar ? "نسخة للقراءة فقط — غير مخصصة للطباعة" : "Read-only copy — not for printing"}
          </span>
        </div>
      </header>

      <main style={{ padding: "16px clamp(4px, 2vw, 16px) 44px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          ref={shellRef}
          style={{ width: "100%", maxWidth: mode === "paper" ? A4_W : 900, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}
        >
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
            <div
              ref={viewportRef}
              style={{
                width: "100%", maxWidth: "100%", overflowX: mode === "paper" ? "auto" : "hidden",
                direction: "ltr", WebkitOverflowScrolling: "touch",
              }}
            >
              <div style={{ width: iframeWidth * scale, height: frameHeight * scale, overflow: "hidden", margin: "0 auto" }}>
                <iframe
                  ref={frameRef}
                  title={doc?.title ?? "document"}
                  sandbox="allow-same-origin"
                  srcDoc={srcDoc}
                  scrolling="no"
                  style={{
                    width: iframeWidth, height: frameHeight, border: 0,
                    background: doc?.payload?.background ?? "#081320",
                    transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none",
                    display: "block",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
