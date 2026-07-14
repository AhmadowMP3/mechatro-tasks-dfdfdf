/**
 * Shared design tokens + primitives for every Mechatro PDF report.
 * One style, one palette, one card shape — imported by member / team / comparison.
 */

// Locked palette — the "Dashboard Card" look.
export const P = {
  page: "#F5F6F8",
  card: "#FFFFFF",
  ink: "#0B1220",
  ink2: "#334155",
  muted: "#64748B",
  line: "#E4E7EC",
  soft: "#F1F5F9",
  cyan: "#42C2EE",
  cyanDark: "#0EA5E9",
  gold: "#D4A017",
  green: "#16A34A",
  orange: "#F59E0B",
  red: "#DC2626",
  purple: "#8B5CF6",
  shadow: "0 1px 2px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.06)",
} as const;

export const STATUS_COLOR: Record<string, string> = {
  todo: P.muted, in_progress: P.cyan, paused: P.orange, in_review: P.purple, done: P.green,
};
export const PRIO_COLOR: Record<string, string> = {
  low: P.muted, normal: P.cyan, high: P.orange, urgent: P.red,
};

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const fmtDate = (iso: string | null | Date, lang: "en" | "ar" = "en") => {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
};

export const fmtDT = (iso: string | null, lang: "en" | "ar" = "en") => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Card container. */
export const CARD_STYLE = `background:${P.card};border:1px solid ${P.line};border-radius:16px;box-shadow:${P.shadow};padding:20px 22px;overflow:visible`;

export function card(inner: string): string {
  return `<div style="${CARD_STYLE}">${inner}</div>`;
}

/** Card header with icon + bilingual title. */
export function cardHeader(iconBg: string, icon: string, titleEn: string, titleAr: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;overflow:visible">
    <div style="width:34px;height:34px;border-radius:10px;background:${iconBg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;flex:0 0 auto">${icon}</div>
    <div style="flex:1;min-width:0;line-height:1.35">
      <div style="font-size:14px;font-weight:800;color:${P.ink};letter-spacing:.5px;text-transform:uppercase">${esc(titleEn)}</div>
      <div dir="rtl" style="font-size:12.5px;color:${P.muted};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(titleAr)}</div>
    </div>
  </div>`;
}

/** Two-column bilingual body: EN left, hairline, AR right. */
export function bilingualBody(enHtml: string, arHtml: string): string {
  return `<div style="display:grid;grid-template-columns:1fr 1px 1fr;gap:20px;align-items:stretch">
    <div dir="ltr" lang="en" style="font-size:12.5px;color:${P.ink2};line-height:1.6">${enHtml}</div>
    <div style="background:${P.line};width:1px"></div>
    <div dir="rtl" lang="ar" style="font-size:12.5px;color:${P.ink2};line-height:1.7;font-family:'Montserrat Arabic','Cairo',sans-serif">${arHtml}</div>
  </div>`;
}

/** Wrap block-level HTML in a .pdf-block div so the generator packer can measure & paginate it. */
export function block(html: string): string {
  if (!html) return "";
  return `<div class="pdf-block" style="background:transparent;color:${P.ink};font-family:'Montserrat','Montserrat Arabic',sans-serif;padding:0 0 14px 0">${html}</div>`;
}

/** Small KPI tile used across covers. */
export function kpiTile(valueEn: string, labelEn: string, labelAr: string, accent: string): string {
  return `<div style="${CARD_STYLE};padding:22px 18px;border-top:4px solid ${accent}">
    <div style="font-size:38px;font-weight:900;color:${P.ink};line-height:1;letter-spacing:-1.2px">${esc(valueEn)}</div>
    <div style="font-size:10px;color:${P.muted};margin-top:12px;letter-spacing:2px;font-weight:800">${esc(labelEn)}</div>
    <div dir="rtl" style="font-size:11px;color:${P.ink2};margin-top:3px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(labelAr)}</div>
  </div>`;
}

/** Compact KPI tile used inside cards. */
export function miniKpi(valueEn: string, labelEn: string, labelAr: string, accent: string): string {
  return `<div style="background:${P.soft};border:1px solid ${P.line};border-radius:12px;padding:14px;border-top:3px solid ${accent}">
    <div style="font-size:22px;font-weight:900;color:${P.ink};line-height:1;letter-spacing:-.5px">${esc(valueEn)}</div>
    <div style="font-size:9.5px;color:${P.muted};margin-top:8px;letter-spacing:1px;font-weight:700;text-transform:uppercase">${esc(labelEn)}</div>
    <div dir="rtl" style="font-size:10px;color:${P.ink2};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(labelAr)}</div>
  </div>`;
}
