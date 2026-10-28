// Public read-only viewer opened by the QR code printed on every document.
// No sign-in required; the token is the capability. Printing and downloading
// are intentionally disabled — this copy is for reading only.
//
// The viewer always renders the exact same A4 sheet as the PDF (no reflow),
// fitted to the screen width, with zoom (buttons, ctrl+wheel, two-finger pinch).

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Maximize2, Minus, Plus, ShieldCheck } from "lucide-react";
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

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Who/when stamp of this viewing: a leaked screenshot shows where it came from. */
type ViewStamp = { title: string; viewedAt: string; ref: string };

/** Repeated diagonal watermark, drawn as an inline SVG tile so it works inside
 *  the sandboxed iframe with no external fonts: "not for printing" plus the
 *  document, the time of this viewing and the link reference. */
function watermarkTile(lang: "ar" | "en", stamp: ViewStamp): string {
  const ar = "غير مخصص للطباعة";
  const en = "NOT FOR PRINTING";
  const primary = lang === "ar" ? ar : en;
  const secondary = lang === "ar" ? en : ar;
  const viewed = lang === "ar" ? `عُرض ${stamp.viewedAt}` : `Viewed ${stamp.viewedAt}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="300" viewBox="0 0 460 300">
  <g transform="rotate(-30 230 150)" text-anchor="middle" font-family="'Cairo','Montserrat Arabic','Segoe UI',sans-serif" font-weight="700">
    <text x="230" y="118" font-size="32" fill="rgba(212,160,23,0.17)">${primary}</text>
    <text x="230" y="146" font-size="15" letter-spacing="3" fill="rgba(148,163,184,0.17)">${secondary}</text>
    <text x="230" y="172" font-size="12" fill="rgba(100,116,139,0.2)">MECHATRO · ${escapeXml(stamp.title)}</text>
    <text x="230" y="190" font-size="11" fill="rgba(100,116,139,0.2)">${escapeXml(viewed)} · #${escapeXml(stamp.ref)}</text>
  </g>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function sheetCss(lang: "ar" | "en", width: number, stamp: ViewStamp): string {
  const tile = watermarkTile(lang, stamp);
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
  img { -webkit-user-drag: none; user-drag: none; -webkit-touch-callout: none; }
  @media print { html, body { display: none !important; } }
`;
}

/** Shortcuts that print, save, copy, select all or view the source. */
const BLOCKED_KEYS = new Set(["p", "s", "c", "x", "a", "u"]);

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

  // Block print / save / copy shortcuts, the context menu, copying and dragging.
  // Screenshots can't be blocked by any web page: the page blurs whenever it
  // loses focus (snipping tools, screen recorders, app switching) or Print
  // Screen is pressed, and every page carries the personal watermark.
  const [shielded, setShielded] = useState(false);
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const shield = () => setShielded(true);
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "printscreen" || e.code === "PrintScreen") {
        shield();
        // Best effort: replace what Print Screen just put on the clipboard.
        void navigator.clipboard?.writeText("").catch(() => undefined);
        return;
      }
      // macOS screenshot shortcuts (⌘⇧3 / ⌘⇧4 / ⌘⇧5) start with ⌘⇧.
      if (e.metaKey && e.shiftKey) shield();
      if ((e.ctrlKey || e.metaKey) && BLOCKED_KEYS.has(key)) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") shield(); };
    const onFocus = () => setShielded(false);

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("contextmenu", block);
    for (const ev of ["copy", "cut", "dragstart", "selectstart"]) document.addEventListener(ev, block);
    window.addEventListener("blur", shield);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("contextmenu", block);
      for (const ev of ["copy", "cut", "dragstart", "selectstart"]) document.removeEventListener(ev, block);
      window.removeEventListener("blur", shield);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Fixed for this viewing, so the watermark doesn't change while reading.
  const [viewedAt] = useState(() =>
    new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  );

  const doc = row !== "loading" && row ? row : null;
  const lang = (doc?.lang === "en" ? "en" : "ar") as "ar" | "en";
  const ar = lang === "ar";

  const pageW = doc?.payload?.width && doc.payload.width > 200 ? doc.payload.width : A4_W;
  const pageH = doc?.payload?.pageHeight && doc.payload.pageHeight > 200 ? doc.payload.pageHeight : A4_H;

  const srcDoc = useMemo(() => {
    if (!doc?.payload?.html) return null;
    const dir = lang === "ar" ? "rtl" : "ltr";
    const stamp: ViewStamp = {
      title: doc.title ?? doc.payload.title ?? "",
      viewedAt,
      ref: token.slice(-6).toUpperCase(),
    };
    return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${doc.payload.css ?? ""}</style><style>${sheetCss(lang, pageW, stamp)}</style></head>
<body><div id="print-root">${doc.payload.html}</div></body></html>`;
  }, [doc, lang, pageW, viewedAt, token]);

  const issuedOn = doc?.created_at ? new Date(doc.created_at).toLocaleDateString("en-GB") : null;

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

        <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {doc && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 999,
                background: "rgba(16,185,129,.12)", color: "#34D399", border: "1px solid rgba(16,185,129,.4)",
              }}
            >
              <ShieldCheck size={13} />
              {ar ? "مستند موثّق صادر عن ميكاترو" : "Verified document issued by Mechatro"}
              {issuedOn && <span style={{ fontWeight: 500, opacity: 0.85 }}>· {issuedOn}</span>}
            </span>
          )}
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

          {srcDoc && shielded && (
            <button
              type="button"
              onClick={() => setShielded(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 10, padding: 24, background: "rgba(5,12,21,.55)", color: "#E6EEF7", border: 0, cursor: "pointer", textAlign: "center",
              }}
            >
              <Lock size={30} color="#F0C24B" />
              <span style={{ fontSize: 15, fontWeight: 800 }}>{ar ? "المستند محمي" : "Protected document"}</span>
              <span style={{ fontSize: 12, color: "#94A3B8", maxWidth: 320, lineHeight: 1.7 }}>
                {ar ? "يُخفى المحتوى عند مغادرة الصفحة أو محاولة التقاط الشاشة. اضغط للمتابعة." : "The content is hidden when you leave the page or try to capture the screen. Tap to continue."}
              </span>
            </button>
          )}

          {srcDoc && (
            <div
              ref={viewportRef}
              style={{
                width: "100%", maxWidth: "100%", overflowX: zoom === null ? "hidden" : "auto", direction: "ltr", WebkitOverflowScrolling: "touch",
                filter: shielded ? "blur(28px)" : undefined, transition: "filter .12s",
              }}
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
