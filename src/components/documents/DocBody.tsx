// Renders a DocModel (blocks) inside the A4 DocPaper body. Shared by the
// document editor preview and the PDF / Word exporters.

import { PAPER, type DocLang, type DocTheme } from "@/lib/docs/types";
import { computeItems, money, type DocBlock, type DocClient, type DocModel } from "@/lib/docs/model";

type Props = {
  model: DocModel;
  client: DocClient;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
};

export function DocBody({ model, client, lang, theme, currency }: Props) {
  const ar = lang === "ar";
  const c = PAPER[theme];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {model.showClientBox && <ClientBox client={client} ar={ar} c={c} />}
      {model.blocks.map((b) => (
        <BlockView key={b.id} block={b} ar={ar} c={c} currency={currency} />
      ))}
    </div>
  );
}

type Palette = typeof PAPER["light"];

function ClientBox({ client, ar, c }: { client: DocClient; ar: boolean; c: Palette }) {
  const name = ar ? client.nameAr || client.nameEn : client.nameEn || client.nameAr;
  const ref = ar ? client.refAr : client.refEn;
  const bits: { l: string; v: string }[] = [
    { l: ar ? "السيد/ة" : "Attn", v: client.attn },
    { l: ar ? "الهاتف" : "Phone", v: client.phone },
    { l: ar ? "الإيميل" : "Email", v: client.email },
    { l: ar ? "العنوان" : "Address", v: client.address },
    { l: ar ? "الرقم الضريبي" : "Tax No.", v: client.taxNumber },
    { l: ar ? "المرجع" : "Reference", v: ref },
  ].filter((b) => (b.v ?? "").trim());

  if (!name && bits.length === 0) return null;

  return (
    <div
      className="pdf-card"
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 10.5, color: c.muted, letterSpacing: 0.4 }}>{ar ? "إلى" : "To"}</div>
      {name && <div style={{ fontSize: 13.5, fontWeight: 700 }}>{name}</div>}
      {bits.length > 0 && (
        <div style={{ display: "grid", gap: 3, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", fontSize: 11 }}>
          {bits.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <span style={{ color: c.muted }}>{b.l}:</span>
              <span style={{ fontWeight: 600, minWidth: 0, wordBreak: "break-word" }}>{b.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockView({ block, ar, c, currency }: { block: DocBlock; ar: boolean; c: Palette; currency: string }) {
  switch (block.kind) {
    case "heading": {
      const t = ar ? block.ar : block.en;
      if (!t) return null;
      return <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{t}</div>;
    }
    case "text": {
      const t = ar ? block.ar : block.en;
      if (!t) return null;
      return <div style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{t}</div>;
    }
    case "spacer":
      return <div style={{ height: block.size }} />;
    case "pagebreak":
      return <div className="pdf-pagebreak" style={{ height: 0 }} />;
    case "terms": {
      const t = ar ? block.ar : block.en;
      if (!t) return null;
      return (
        <div className="pdf-card" style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{ar ? block.titleAr : block.titleEn}</div>
          <div style={{ fontSize: 11, color: c.muted, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{t}</div>
        </div>
      );
    }
    case "keyvalue": {
      const rows = block.rows.filter((r) => (ar ? r.kAr || r.vAr : r.kEn || r.vEn));
      if (rows.length === 0) return null;
      return (
        <div className="pdf-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(ar ? block.titleAr : block.titleEn) && (
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ar ? block.titleAr : block.titleEn}</div>
          )}
          <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", fontSize: 11.5 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 6, borderBottom: `1px dashed ${c.border}`, paddingBottom: 3 }}>
                <span style={{ color: c.muted }}>{ar ? r.kAr : r.kEn}</span>
                <span style={{ fontWeight: 600 }}>{ar ? r.vAr : r.vEn}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "table": {
      const head = ar ? block.headAr : block.headEn;
      if (block.rows.length === 0) return null;
      return (
        <div className="pdf-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(ar ? block.titleAr : block.titleEn) && (
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ar ? block.titleAr : block.titleEn}</div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: c.surface }}>
                {head.map((h, i) => (
                  <Th key={i} c={c}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => {
                const cells = ar ? r.cellsAr : r.cellsEn;
                return (
                  <tr key={r.id} style={{ background: i % 2 ? c.zebra : "transparent" }}>
                    {head.map((_, ci) => (
                      <Td key={ci} c={c}>{cells[ci] ?? ""}</Td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    case "items": {
      const t = computeItems(block);
      const cols = 1 + 1 + (block.showUnit ? 1 : 0) + (block.showQty ? 1 : 0) + (block.showPrice ? 1 : 0) + 1;
      return (
        <div className="pdf-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(ar ? block.titleAr : block.titleEn) && (
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ar ? block.titleAr : block.titleEn}</div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: c.surface }}>
                <Th c={c} width={32}>#</Th>
                <Th c={c}>{ar ? "البيان" : "Description"}</Th>
                {block.showUnit && <Th c={c} width={70}>{ar ? "الوحدة" : "Unit"}</Th>}
                {block.showQty && <Th c={c} width={60}>{ar ? "الكمية" : "Qty"}</Th>}
                {block.showPrice && <Th c={c} width={90}>{ar ? "سعر الوحدة" : "Unit price"}</Th>}
                <Th c={c} width={100}>{ar ? "الإجمالي" : "Total"}</Th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l, i) => (
                <tr key={l.row.id} style={{ background: i % 2 ? c.zebra : "transparent" }}>
                  <Td c={c}>{i + 1}</Td>
                  <Td c={c}>{(ar ? l.row.descAr : l.row.descEn) || "—"}</Td>
                  {block.showUnit && <Td c={c}>{ar ? l.row.unitAr : l.row.unitEn}</Td>}
                  {block.showQty && <Td c={c} ltr>{l.row.qty}</Td>}
                  {block.showPrice && <Td c={c} ltr>{money(l.row.price, "")}</Td>}
                  <Td c={c} ltr>{money(l.total, "")}</Td>
                </tr>
              ))}
              {block.showTotals && (
                <>
                  <SumRow c={c} cols={cols} label={ar ? "المجموع" : "Subtotal"} value={money(t.subtotal, currency)} />
                  {t.discount > 0 && (
                    <SumRow c={c} cols={cols} label={ar ? "الخصم" : "Discount"} value={`- ${money(t.discount, currency)}`} />
                  )}
                  {block.taxRate > 0 && (
                    <SumRow c={c} cols={cols} label={`${ar ? "الضريبة" : "Tax"} ${block.taxRate}%`} value={money(t.tax, currency)} />
                  )}
                  {t.shipping > 0 && (
                    <SumRow c={c} cols={cols} label={ar ? "الشحن" : "Shipping"} value={money(t.shipping, currency)} />
                  )}
                  <SumRow c={c} cols={cols} label={ar ? "الإجمالي النهائي" : "Grand total"} value={money(t.grand, currency)} bold />
                </>
              )}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

function SumRow({ c, cols, label, value, bold }: { c: Palette; cols: number; label: string; value: string; bold?: boolean }) {
  return (
    <tr style={bold ? { background: c.surface } : undefined}>
      <Td c={c} colSpan={cols - 1} bold={bold} alignEnd>{label}</Td>
      <Td c={c} bold={bold} ltr>{value}</Td>
    </tr>
  );
}

function Th({ c, children, width }: { c: Palette; children: React.ReactNode; width?: number }) {
  return (
    <th style={{ border: `1px solid ${c.border}`, padding: "6px 8px", fontWeight: 700, textAlign: "inherit", width }}>
      {children}
    </th>
  );
}

function Td({
  c, children, colSpan, bold, ltr, alignEnd,
}: { c: Palette; children: React.ReactNode; colSpan?: number; bold?: boolean; ltr?: boolean; alignEnd?: boolean }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        border: `1px solid ${c.border}`,
        padding: "6px 8px",
        fontWeight: bold ? 700 : 400,
        direction: ltr ? "ltr" : undefined,
        textAlign: alignEnd ? "end" : ltr ? "start" : undefined,
        verticalAlign: "top",
        wordBreak: "break-word",
      }}
    >
      {children}
    </td>
  );
}
