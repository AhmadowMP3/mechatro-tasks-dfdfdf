// A4 paper frame shared by the template editor preview and (later) the
// document editor + exporters. Renders the branded header band, the body
// (children), and the footer band, in light or dark theme, AR or EN.

import logo from "@/assets/mechatro-logo.png";
import { PAPER, type DocFooter, type DocHeader, type DocLang, type DocTheme } from "@/lib/docs/types";

export const A4 = { width: 794, height: 1123 } as const;

type Props = {
  header: DocHeader;
  footer: DocFooter;
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
  children?: React.ReactNode;
};

export function DocPaper({ header, footer, lang, theme, meta, page, scale = 1, bare = false, sizing = "grow", children }: Props) {
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
      {/* ── Header band ─────────────────────────────────────────── */}
      <div style={{ padding: "26px 40px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: "1 1 300px", overflowWrap: "anywhere", alignItems: header.logoAlign === "center" ? "center" : header.logoAlign === "end" ? "flex-end" : "flex-start" }}>
            {header.showLogo && (
              <img src={logo} alt="Mechatro" style={{ height: header.logoHeight, width: "auto", maxWidth: "100%", objectFit: "contain" }} />
            )}
            {company && <div style={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{company}</div>}
            {address && <div style={{ fontSize: 11, color: c.muted, overflowWrap: "anywhere" }}>{address}</div>}
            {contactBits.length > 0 && (
              <div style={{ fontSize: 10.5, color: c.muted, direction: "ltr", textAlign: align, overflowWrap: "anywhere" }}>
                {contactBits.join("  ·  ")}
              </div>
            )}
          </div>

          <div style={{ textAlign: ar ? "left" : "right", flex: "0 1 auto", minWidth: 200, maxWidth: 300, overflowWrap: "anywhere" }}>
            {title && (
              <div style={{ fontSize: 22, fontWeight: 800, color: header.accent, letterSpacing: ar ? 0 : 0.5, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                {title}
              </div>
            )}
            {header.showMetaBox && (
              <div
                style={{
                  marginTop: 10,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 11,
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
          <div style={{ marginTop: 14, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${header.accent}, ${header.accent}00)` }} />
        )}
      </div>


      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="pdf-flow" style={{ flex: 1, minHeight: 0, overflow: sizing === "fixed" ? "hidden" : undefined, padding: "6px 40px 22px", fontSize: 12.5, lineHeight: 1.7, overflowWrap: "anywhere" }}>
        {children}
      </div>

      {/* ── Footer band ─────────────────────────────────────────── */}
      <div style={{ padding: "12px 40px 22px", flexShrink: 0 }}>
        {footer.showRule && (
          <div style={{ height: 1.5, borderRadius: 2, background: `linear-gradient(90deg, ${footer.accent}00, ${footer.accent}, ${footer.accent}00)`, marginBottom: 10 }} />
        )}
        {(bank || signature) && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
            {bank ? <div style={{ fontSize: 10.5, color: c.muted, whiteSpace: "pre-wrap", flex: "1 1 240px", minWidth: 0, maxWidth: "60%", overflowWrap: "anywhere" }}>{bank}</div> : <span />}
            {signature && (
              <div style={{ textAlign: "center", width: 180, flexShrink: 0 }}>
                <div style={{ borderTop: `1px solid ${c.border}`, marginBottom: 4 }} />
                <div style={{ fontSize: 10.5, color: c.muted, overflowWrap: "anywhere" }}>{signature}</div>
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", fontSize: 10, color: c.muted }}>
          <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>{footer.contactLine}</span>
          {note && (
            <span style={{ flex: "2 1 200px", textAlign: "center", minWidth: 0, overflowWrap: "anywhere" }}>{note}</span>
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
