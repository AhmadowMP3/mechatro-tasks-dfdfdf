// Branded PDF document for any finance list (income, expenses, invoices,
// subscriptions, payroll, customers, reports). Renders A4-width HTML that
// printReactDocument turns into a native PDF with correct Arabic shaping.

import type { CompanySettings } from "@/components/finance/BrandedDocuments";

type Lang = "ar" | "en";

// Palette — matches BrandedDocuments.tsx (dark navy brand)
const C = {
  page: "#081320",
  navy: "#0F2031",
  surface2: "#13283D",
  blue: "#42C2EE",
  gold: "#D4A017",
  ink: "#E6EEF7",
  muted: "#94A3B8",
  border: "#1E3A57",
  zebra: "#0B1A2A",
  green: "#73C94E",
  red: "#EF4444",
};

const A4_WIDTH_PX = 794;

export type ListColumn<T = Record<string, unknown>> = {
  header: string;
  key: string;
  align?: "start" | "end" | "center";
  width?: number | string;
  render?: (row: T) => React.ReactNode;
  tone?: (row: T) => "green" | "red" | "gold" | "muted" | undefined;
  bold?: boolean;
};

export type ListKpi = {
  label: string;
  value: string;
  tone?: "green" | "red" | "blue" | "gold" | "muted";
};

export type ListReportProps<T = Record<string, unknown>> = {
  title: string;
  subtitle?: string;
  rangeLabel?: string;
  kpis?: ListKpi[];
  columns: ListColumn<T>[];
  rows: T[];
  totals?: { label: string; value: string; tone?: "green" | "red" | "gold" }[];
  settings: CompanySettings | null;
  lang: Lang;
};

function toneColor(t?: ListKpi["tone"]): string {
  switch (t) {
    case "green": return C.green;
    case "red": return C.red;
    case "gold": return C.gold;
    case "muted": return C.muted;
    default: return C.blue;
  }
}
function rowToneColor(t?: "green" | "red" | "gold" | "muted"): string | undefined {
  switch (t) {
    case "green": return C.green;
    case "red": return C.red;
    case "gold": return C.gold;
    case "muted": return C.muted;
    default: return undefined;
  }
}

export function ListReportDocument<T extends Record<string, unknown>>(
  { title, subtitle, rangeLabel, kpis, columns, rows, totals, settings, lang }: ListReportProps<T>,
) {
  const ar = lang === "ar";
  const companyName = settings ? (ar ? settings.company_name_ar || settings.company_name_en : settings.company_name_en || settings.company_name_ar) : null;
  const generatedAt = new Date().toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-GB");

  return (
    <div
      style={{
        width: A4_WIDTH_PX,
        background: C.page,
        color: C.ink,
        fontFamily: ar
          ? "'Montserrat Arabic', 'Almarai', 'Segoe UI', sans-serif"
          : "'Montserrat', 'Montserrat Arabic', system-ui, sans-serif",
        padding: "36px 40px 40px",
        direction: ar ? "rtl" : "ltr",
        fontSize: 12,
        lineHeight: 1.55,
        boxSizing: "border-box",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>
            {subtitle ?? (ar ? "تقرير مالي" : "Finance Report")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: 0.4 }}>{title}</div>
          {rangeLabel && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{rangeLabel}</div>
          )}
          <div style={{ width: 60, height: 5, background: C.blue, borderRadius: 3, marginTop: 8 }} />
        </div>
        {companyName && (
          <div style={{ textAlign: ar ? "left" : "right", fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 13 }}>{companyName}</div>
            {settings?.company_address && <div>{settings.company_address}</div>}
            {settings?.company_phone && <div>{ar ? "هاتف" : "Tel"}: {settings.company_phone}</div>}
            {settings?.company_email && <div>{settings.company_email}</div>}
            <div style={{ marginTop: 4, fontStyle: "italic" }}>{ar ? "أُنشئ" : "Generated"}: {generatedAt}</div>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: `linear-gradient(90deg, ${C.blue}, transparent)`, marginBottom: 18 }} />

      {/* KPI STRIP */}
      {kpis && kpis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, 1fr)`, gap: 10, marginBottom: 20 }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: toneColor(k.tone) }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* TABLE */}
      <div className="pdf-flow">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: C.surface2, color: C.ink }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    padding: "10px 12px",
                    textAlign: c.align === "center" ? "center" : c.align === "end" ? (ar ? "left" : "right") : (ar ? "right" : "left"),
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    borderBottom: `2px solid ${C.gold}`,
                    width: c.width,
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: "22px 12px", textAlign: "center", color: C.muted, fontStyle: "italic" }}>
                  {ar ? "لا توجد بيانات" : "No data"}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? C.zebra : C.navy, borderBottom: `1px solid ${C.border}` }}>
                  {columns.map((c) => {
                    const tone = c.tone?.(row);
                    const color = rowToneColor(tone);
                    const cell = c.render ? c.render(row) : (row[c.key] as React.ReactNode) ?? "—";
                    return (
                      <td
                        key={c.key}
                        style={{
                          padding: "9px 12px",
                          textAlign: c.align === "center" ? "center" : c.align === "end" ? (ar ? "left" : "right") : (ar ? "right" : "left"),
                          color,
                          fontWeight: c.bold ? 700 : 400,
                          verticalAlign: "middle",
                        }}
                      >
                        {cell as React.ReactNode}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* TOTALS */}
      {totals && totals.length > 0 && (
        <div style={{ marginTop: 18, display: "flex", justifyContent: ar ? "flex-start" : "flex-end" }}>
          <div style={{ minWidth: 300, background: C.surface2, borderTop: `3px solid ${C.gold}`, borderRadius: 10, padding: "10px 16px" }}>
            {totals.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < totals.length - 1 ? `1px dashed ${C.border}` : "none" }}>
                <span style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>{t.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: rowToneColor(t.tone) ?? C.ink }}>{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: 30, textAlign: "center", color: C.muted, fontSize: 10, fontStyle: "italic" }}>
        {ar ? "تقرير سري للاستخدام الداخلي فقط" : "Confidential — for internal use only"}
      </div>
    </div>
  );
}
