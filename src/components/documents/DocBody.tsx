// The "to / client" card rendered above the Word-style body inside the A4
// paper. Shared by the editor, the live preview and the exporters.

import { PAPER, type DocLang, type DocTheme } from "@/lib/docs/types";
import type { DocClient } from "@/lib/docs/model";

type Palette = { bg: string; surface: string; ink: string; muted: string; border: string; zebra: string };

/** The "to / client" card, standalone (paginator + page renderer). */
export function DocClientCard({ client, lang, theme }: { client: DocClient; lang: DocLang; theme: DocTheme }) {
  return <ClientBox client={client} ar={lang === "ar"} c={PAPER[theme]} />;
}

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
        <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", fontSize: 11 }}>
          {bits.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 6, minWidth: 0, alignItems: "baseline" }}>
              <span style={{ color: c.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{b.l}:</span>
              <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{b.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
