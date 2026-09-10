// Public read-only viewer opened by the QR code printed on every document.
// No sign-in required; the token is the capability. Printing and downloading
// are intentionally disabled — this copy is for reading only.
//
// The viewer always renders the exact same A4 sheet as the PDF (no reflow),
// fitted to the screen width, with zoom (buttons, ctrl+wheel, two-finger pinch).

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { fetchPublicShare, type PublicShareRow } from "@/lib/share/public-share";
import { logoFor } from "@/lib/brand/logo";
import { A4_SIZE } from "@/lib/docs/geometry";

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
const A4_H = A4_SIZE.height;
const PAGE_GAP = 18;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const MAX_HEIGHT = 60000; // hard stop so a runaway measurement can never scroll forever

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

function sheetCss(lang: "ar" | "en", width: number): string {
  const tile = watermarkTile(lang);
  return `
  html, body {
    user-select: none !important; -webkit-user-select: none !important;
    overflow: hidden !important; margin: 0; padding: 0;
  }
  #print-root { width: ${width}px; margin: 0 auto; }
  #print-root, .doc-page { box-shadow: 0 10px 40px rgba(0,0,0,.45); margin: 0 auto ${PAGE_GAP}px; }
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

function PublicDocView() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<PublicShareRow | null | "loading">("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef(false);
  const renderWidthRef = useRef(A4_W);
  const [frameHeight, setFrameHeight] = useState(A4_H);
  const [renderWidth, setRenderWidth] = useState(A4_W);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to width

  useEffect(() => {
    let alive = true;
    void fetchPublicShare(token).then((r) => { if (alive) setRow(r); });
    return () => { alive = false; };
  }, [token]);

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

  const pageW = doc?.payload?.width && doc.payload.width > 200 ? doc.payload.width : A4_W;
  const pageH = doc?.payload?.pageHeight && doc.payload.pageHeight > 200 ? doc.payload.pageHeight : A4_H;

  const srcDoc = useMemo(() => {
    if (!doc?.payload?.html) return null;
    const dir = lang === "ar" ? "rtl" : "ltr";
    return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${doc.payload.css ?? ""}</style><style>${sheetCss(lang, pageW)}</style></head>
<body><div id="print-root">${doc.payload.html}</div></body></html>`;
  }, [doc, lang, pageW]);

  useEffect(() => {
    renderWidthRef.current = pageW;
    setRenderWidth(pageW);
    setFrameHeight(pageH);
    setZoom(null);
  }, [pageW, pageH, srcDoc]);

  // Fit-to-width scale + one decisive content-height measurement.
  useEffect(() => {
    if (!srcDoc) return;
    settledRef.current = false;
    let raf = 0;

    const fit = (measuredWidth = renderWidthRef.current) => {
      const screenWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
      const pagePadding = Math.max(4, Math.min(16, screenWidth * 0.02));
      const available = Math.max(1, Math.min(measuredWidth, screenWidth - (pagePadding * 2) - 2));
      setFitScale(Math.min(1, Math.max(0.05, available / Math.max(1, measuredWidth))));
    };

    const measureHeight = () => {
      const d = frameRef.current?.contentDocument;
      if (!d) return false;
      const pageElements = Array.from(d.querySelectorAll<HTMLElement>(".doc-page"));
      const root = d.getElementById("print-root");
      const measuredWidth = Math.max(
        pageW,
        root?.scrollWidth ?? 0,
        Math.ceil(root?.getBoundingClientRect().width ?? 0),
        ...pageElements.map((page) => Math.ceil(Math.max(page.scrollWidth, page.getBoundingClientRect().width))),
      );
      renderWidthRef.current = measuredWidth;
      setRenderWidth(measuredWidth);
      fit(measuredWidth);
      const pages = pageElements.length;
      if (pages > 0) {
        setFrameHeight(pages * (pageH + PAGE_GAP));
        settledRef.current = true;
        return true;
      }
      const h = root?.scrollHeight ?? 0;
      if (h > 200) {
        setFrameHeight(Math.min(MAX_HEIGHT, h + PAGE_GAP));
        settledRef.current = true;
        return true;
      }
      return false;
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fit();
        if (!settledRef.current) measureHeight();
      });
    };

    schedule();
    const onLoad = () => {
      const d = frameRef.current?.contentDocument;
      const done = () => { settledRef.current = false; measureHeight(); };
      // Wait for fonts/images so the un-paginated case measures once, correctly.
      const fonts = (d as Document & { fonts?: FontFaceSet })?.fonts;
      if (fonts?.ready) void fonts.ready.then(done);
      else done();
      window.setTimeout(done, 600);
    };
    frameRef.current?.addEventListener("load", onLoad);

    // Only viewport changes trigger a re-fit; the height never grows on its own.
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fit()); });
    if (shellRef.current) ro.observe(shellRef.current);
    const refit = () => fit();
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", refit);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      frameRef.current?.removeEventListener("load", onLoad);
      window.removeEventListener("resize", refit);
      window.removeEventListener("orientationchange", refit);
    };
  }, [srcDoc, pageW, pageH]);

  const scale = zoom ?? fitScale;

  const bump = useCallback((k: number) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (z ?? fitScale) * k)));
  }, [fitScale]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zoom — non-passive so the page never scrolls behind.
  useEffect(() => {
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
  }, [fitScale, srcDoc]);

  // Two-finger pinch zoom on touch screens.
  useEffect(() => {
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
  }, [zoom, fitScale, srcDoc]);

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
    background: "rgba(30,58,87,.5)", color: "#E6EEF7", border: "1px solid #1E3A57",
    cursor: "pointer", whiteSpace: "nowrap",
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
          <img src={logoFor(lang)} alt="Mechatro" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>mechatro</div>
            <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc?.title ?? (ar ? "مستند" : "Document")}
            </div>
          </div>
        </div>

        {srcDoc && (
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
            <button type="button" style={{ ...btn, padding: "0 9px" }} aria-label="zoom out" onClick={() => bump(1 / 1.2)}>
              <Minus size={14} />
            </button>
            <button type="button" style={{ ...btn, padding: "0 9px" }} aria-label="zoom in" onClick={() => bump(1.2)}>
              <Plus size={14} />
            </button>
            <button type="button" style={btn} onClick={() => setZoom(null)}>
              <Maximize2 size={14} /> {ar ? "ملء العرض" : "Fit"}
            </button>
            <button type="button" style={btn} onClick={() => setZoom(1)}>100%</button>
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
          style={{ width: "100%", maxWidth: renderWidth, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}
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
              style={{ width: "100%", maxWidth: "100%", overflowX: zoom === null ? "hidden" : "auto", direction: "ltr", WebkitOverflowScrolling: "touch" }}
            >
              <div style={{ width: renderWidth * scale, height: frameHeight * scale, overflow: "hidden", margin: "0 auto", maxWidth: zoom === null ? "100%" : undefined }}>
                <iframe
                  ref={frameRef}
                  title={doc?.title ?? "document"}
                  sandbox="allow-same-origin"
                  srcDoc={srcDoc}
                  scrolling="no"
                  style={{
                    width: renderWidth, minWidth: renderWidth, maxWidth: "none", height: frameHeight, border: 0,
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
