// A4 paper frame shared by the template editor preview and (later) the
// document editor + exporters. Renders the branded header band, the body
// (children), and the footer band, in light or dark theme, AR or EN.

import { useRef, useState } from "react";

import { logoFor } from "@/lib/brand/logo";
import { PAPER, resolveMargins, type DocFooter, type DocHeader, type DocLang, type DocLogoMode, type DocSection, type DocTheme } from "@/lib/docs/types";
import { QR_ROW_H } from "@/lib/share/qr-stamp";
import type { LogoVariant } from "@/lib/docs/model";

/** CSS filter that renders the brand logo light or dark on any paper. */
export function logoFilter(variant: LogoVariant | undefined, theme: DocTheme): string | undefined {
  const v = variant && variant !== "auto" ? variant : theme === "dark" ? "light" : "dark";
  return v === "light" ? "brightness(0) invert(1)" : undefined;
}

/** 1% grid with magnetic snapping at the edges and the centre. */
function snap(v: number): number {
  const clamped = Math.min(100, Math.max(0, v));
  for (const anchor of [0, 25, 50, 75, 100]) {
    if (Math.abs(clamped - anchor) <= 2.5) return anchor;
  }
  return Math.round(clamped);
}

export const A4 = { width: 794, height: 1123 } as const;

type Props = {
  header: DocHeader;
  footer: DocFooter;
  /** Page setup imported from the original Word file (wins over the template). */
  section?: DocSection | null;
  lang: DocLang;
  theme: DocTheme;
  /** Sample meta shown in the header box (number / dates). */
  meta?: { number?: string; date?: string; validUntil?: string; client?: string };
  page?: { current: number; total: number };
  scale?: number;
  /** Drop the on-screen shadow / rounded corners (used by the exporters). */
  bare?: boolean;
  /**
   * grow  — one elastic sheet (legacy behaviour), at least A4 tall.
   * fixed — exactly one A4 page (used by the paginated preview / exporters).
   * auto  — hug the content (used to measure the header + footer chrome).
   */
  sizing?: "grow" | "fixed" | "auto";
  /** Letterhead logo rendering (auto follows the theme). */
  logoVariant?: LogoVariant;
  /** Template editor only — lets the admin drag the logo inside the header. */
  draggableLogo?: boolean;
  onLogoMove?: (x: number, y: number) => void;
  children?: React.ReactNode;
};

export function DocPaper({ header, footer, lang, theme, meta, page, scale = 1, bare = false, sizing = "grow", logoVariant, draggableLogo = false, onLogoMove, children }: Props) {
  const ar = lang === "ar";
  const c = PAPER[theme];
  const dir = ar ? "rtl" : "ltr";
  const align = ar ? "right" : "left";
  const title = ar ? header.titleAr : header.titleEn;
  const company = ar ? header.companyAr : header.companyEn;
  const address = ar ? header.addressAr : header.addressEn;
  const extra = ar ? header.extraAr : header.extraEn;
  const note = ar ? footer.noteAr : footer.noteEn;
  const bank = ar ? footer.bankAr : footer.bankEn;
  const signature = ar ? footer.signatureAr : footer.signatureEn;

  const contactBits = [header.phone, header.email, header.website, header.taxNumber ? (ar ? `الرقم الضريبي: ${header.taxNumber}` : `Tax No: ${header.taxNumber}`) : ""]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  const mode: DocLogoMode = header.logoMode ?? "inline";
  const mg = pageMarginsPx(header);
  // Header/footer bands keep a modest inset so the title and meta box never
  // get squeezed by a wide body margin; the body itself uses the real margin.
  const chromeSide = Math.min(mg.side, 40);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const logoImg = (
    <img
      src={logoFor(lang)}
      alt="Mechatro"
      draggable={false}
      style={{ height: header.logoHeight, width: "auto", maxWidth: mode === "inline" ? 300 : "100%", objectFit: "contain", filter: logoFilter(logoVariant, theme), userSelect: "none", pointerEvents: "none" }}
    />
  );

  const startDrag = (e: React.PointerEvent) => {
    if (!draggableLogo || !onLogoMove) return;
    e.preventDefault();
    const box = headerRef.current;
    if (!box) return;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const r = box.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const rawX = ((ev.clientX - r.left) / r.width) * 100;
      const x = snap(ar ? 100 - rawX : rawX);
      const y = snap(((ev.clientY - r.top) / r.height) * 100);
      onLogoMove(x, y);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      style={{
        width: A4.width,
        minHeight: sizing === "auto" ? undefined : A4.height,
        height: sizing === "fixed" ? A4.height : undefined,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: ar ? "top right" : "top left",
        background: c.bg,
        color: c.ink,
        direction: dir,
        textAlign: align,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Montserrat Arabic', 'Almarai', 'Montserrat', system-ui, sans-serif",
        boxShadow: bare ? undefined : "0 18px 50px rgba(0,0,0,.35)",
        borderRadius: bare ? 0 : 4,
        overflow: sizing === "fixed" || !bare ? "hidden" : undefined,
      }}
    >
      {/* ── Header band (identical on every template) ───────────── */}
      <div ref={headerRef} style={{ padding: `${mg.top}px ${chromeSide}px 0`, flexShrink: 0, position: "relative" }}>
        {/* Logo band — full width so a tall logo never squeezes the title */}
        {header.showLogo && mode === "band" && (
          <div style={{ display: "flex", justifyContent: header.logoAlign === "center" ? "center" : header.logoAlign === "end" ? (ar ? "flex-start" : "flex-end") : (ar ? "flex-end" : "flex-start"), marginBottom: 10 }}>
            {logoImg}
          </div>
        )}
        {/* Free mode — the logo floats, so reserve its band to avoid overlap */}
        {header.showLogo && mode === "free" && <div style={{ height: header.logoHeight + 8 }} />}
        {header.showLogo && mode === "free" && (
          <div
            onPointerDown={startDrag}
            style={{
              position: "absolute",
              insetInlineStart: `${header.logoX}%`,
              top: `${header.logoY}%`,
              transform: `translate(${ar ? "" : "-"}${header.logoX}%, -${header.logoY}%)`,
              cursor: draggableLogo ? (dragging ? "grabbing" : "grab") : undefined,
              touchAction: draggableLogo ? "none" : undefined,
              outline: draggableLogo ? `1px dashed ${header.accent}66` : undefined,
              outlineOffset: 4,
              zIndex: 2,
            }}
          >
            {logoImg}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: mode === "inline" ? "auto minmax(0, 1fr) minmax(0, 232px)" : "minmax(0, 232px) minmax(0, 1fr) minmax(0, 232px)", alignItems: mode === "inline" ? "center" : "start", justifyItems: "stretch", gap: 18 }}>
          {/* Brand block (with the logo beside it in inline mode) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, maxWidth: mode === "inline" ? 300 : undefined, overflowWrap: "anywhere", alignItems: "flex-start" }}>
            {header.showLogo && mode === "inline" && (
              <div style={{ marginBottom: 6, alignSelf: header.logoAlign === "center" ? "center" : header.logoAlign === "end" ? "flex-end" : "flex-start" }}>{logoImg}</div>
            )}
            {company && <div style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: "anywhere" }}>{company}</div>}
            {address && <div style={{ fontSize: 10.5, color: c.muted, overflowWrap: "anywhere" }}>{address}</div>}
            {contactBits.length > 0 && (
              <div style={{ fontSize: 10, color: c.muted, direction: "ltr", textAlign: align, overflowWrap: "anywhere" }}>
                {contactBits.join("  ·  ")}
              </div>
            )}
          </div>


          {/* Centered document title */}
          <div style={{ textAlign: "center", paddingTop: 6, minWidth: 0 }}>
            {title && (
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 800,
                  color: header.accent,
                  letterSpacing: ar ? 0 : 1.2,
                  textTransform: ar ? "none" : "uppercase",
                  lineHeight: 1.25,
                  overflowWrap: "anywhere",
                }}
              >
                {title}
              </div>
            )}
          </div>

          {/* Meta box */}
          <div style={{ textAlign: ar ? "left" : "right", minWidth: 0, overflowWrap: "anywhere" }}>
            {header.showMetaBox && (
              <div
                style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 10.5,
                  display: "grid",
                  gap: 4,
                  textAlign: ar ? "left" : "right",
                }}
              >
                <MetaRow c={c} label={ar ? "الرقم" : "No."} value={meta?.number ?? "—"} />
                <MetaRow c={c} label={ar ? "التاريخ" : "Date"} value={meta?.date ?? "—"} />
                {meta?.validUntil && <MetaRow c={c} label={ar ? "صالح حتى" : "Valid until"} value={meta.validUntil} />}
                {meta?.client && <MetaRow c={c} label={ar ? "العميل" : "Client"} value={meta.client} />}
              </div>
            )}
          </div>
        </div>

        {extra && <div style={{ marginTop: 10, fontSize: 11, color: c.muted, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{extra}</div>}

        {header.showRule && (
          <div style={{ marginTop: 12, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${header.accent}, ${header.accent}00)` }} />
        )}
      </div>


      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="pdf-flow doc-page-body" style={{ flex: 1, minHeight: 0, overflow: sizing === "fixed" ? "hidden" : undefined, padding: `0 ${mg.side}px 18px`, fontSize: 12.5, lineHeight: 1.7, overflowWrap: "anywhere", display: "flex", flexDirection: "column" }}>
        {/* Padding-free content box — the editor measures this exact rect. */}
        <div data-doc-body-content style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          {children}
        </div>
      </div>


      {/* ── QR row (reserved on every page, filled on the last one) ─ */}
      <div
        data-qr-slot
        style={{ height: QR_ROW_H, padding: `0 ${chromeSide}px`, display: "flex", alignItems: "flex-end", flexShrink: 0, overflow: "hidden" }}
      />

      {/* ── Footer band (identical on every template) ───────────── */}
      <div data-doc-footer style={{ padding: `10px ${chromeSide}px ${mg.bottom}px`, flexShrink: 0 }}>
        {(bank || signature) && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 8, flexWrap: "wrap" }}>
            {bank ? <div style={{ fontSize: 10.5, color: c.muted, whiteSpace: "pre-wrap", flex: "1 1 240px", minWidth: 0, maxWidth: "60%", overflowWrap: "anywhere" }}>{bank}</div> : <span />}
            {signature && (
              <div style={{ textAlign: "center", width: 180, flexShrink: 0 }}>
                <div style={{ borderTop: `1px solid ${c.border}`, marginBottom: 4 }} />
                <div style={{ fontSize: 10.5, color: c.muted, overflowWrap: "anywhere" }}>{signature}</div>
              </div>
            )}
          </div>
        )}

        {footer.showRule && (
          <div style={{ height: 1.5, borderRadius: 2, background: `linear-gradient(90deg, ${footer.accent}00, ${footer.accent}, ${footer.accent}00)`, marginBottom: 8 }} />
        )}

        {/* Contact block — document language only (AR or EN, never both) */}
        {footer.contactRows.length > 0 && (
          <div style={{ display: "grid", gap: 2.5, marginBottom: 6 }}>
            {footer.contactRows.map((row, i) => {
              const text = ((ar ? row.ar : row.en) || (ar ? row.en : row.ar) || "").trim();
              if (!text) return null;
              return (
                <div
                  key={i}
                  style={{
                    fontSize: 9.5,
                    color: c.muted,
                    direction: dir,
                    textAlign: align,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {text}
                </div>
              );
            })}
          </div>
        )}


        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "nowrap", fontSize: 9.5, color: c.muted }}>
          <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>{note}</span>
          {footer.showGeneratedAt && (
            <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
              {ar ? "أُنشئ في" : "Generated"}:{" "}
              <span style={{ direction: "ltr", display: "inline-block" }}>
                {new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          )}
          <span style={{ direction: "ltr", flexShrink: 0, whiteSpace: "nowrap" }}>
            {footer.showPageNumbers ? (ar ? `الصفحة ${page?.current ?? 1} / ${page?.total ?? 1}` : `Page ${page?.current ?? 1} / ${page?.total ?? 1}`) : ""}
          </span>
        </div>

      </div>


    </div>
  );
}

function MetaRow({ c, label, value }: { c: { muted: string }; label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
      <span style={{ color: c.muted }}>{label}</span>
      <span style={{ fontWeight: 600, direction: "ltr" }}>{value}</span>
    </div>
  );
}
