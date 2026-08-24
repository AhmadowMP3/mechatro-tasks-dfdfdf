import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, RotateCcw, Sun, Moon, Copy, Loader2 } from "lucide-react";

import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireMaster } from "@/lib/route-guards";
import { docTemplates } from "@/lib/docs/api";
import { defaultFooter, defaultHeader } from "@/lib/docs/defaults";
import { DOC_TYPES, docTypeLabel, type DocFooter, type DocHeader, type DocLang, type DocTemplate, type DocTheme, type DocType } from "@/lib/docs/types";
import { DocPaper } from "@/components/documents/DocPaper";

export const Route = createFileRoute("/_authenticated/doc-templates")({
  ssr: false,
  beforeLoad: requireMaster,
  component: DocTemplatesPage,
});

function DocTemplatesPage() {
  const { lang, isMasterAdmin } = useApp();
  const ar = lang === "ar";
  const [type, setType] = useState<DocType>("quotation");
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewLang, setPreviewLang] = useState<DocLang>(ar ? "ar" : "en");
  const [previewTheme, setPreviewTheme] = useState<DocTheme>("light");

  useEffect(() => {
    if (!isMasterAdmin) return;
    let alive = true;
    setLoading(true);
    docTemplates
      .ensure(type)
      .then((t) => { if (alive) { setTpl(t); setPreviewTheme(t.defaults.theme); setDirty(false); } })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [type, isMasterAdmin]);

  const setHeader = (patch: Partial<DocHeader>) => {
    setTpl((t) => (t ? { ...t, header: { ...t.header, ...patch } } : t));
    setDirty(true);
  };
  const setFooter = (patch: Partial<DocFooter>) => {
    setTpl((t) => (t ? { ...t, footer: { ...t.footer, ...patch } } : t));
    setDirty(true);
  };

  const save = async () => {
    if (!tpl) return;
    try {
      setSaving(true);
      const saved = await docTemplates.save(tpl);
      setTpl(saved);
      setDirty(false);
      toast.success(ar ? "تم حفظ القالب" : "Template saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const applyToAll = async () => {
    if (!tpl) return;
    try {
      setSaving(true);
      await docTemplates.save(tpl);
      await docTemplates.applyToAll(tpl);
      setDirty(false);
      toast.success(ar ? "تم تطبيق نفس الهيدر والفوتر على كل الأنواع" : "Header & footer applied to all types");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const reset = () => {
    if (!tpl) return;
    setTpl({ ...tpl, header: defaultHeader(tpl.doc_type), footer: defaultFooter(tpl.doc_type) });
    setDirty(true);
  };

  const sampleMeta = useMemo(() => {
    const prefix = DOC_TYPES.find((d) => d.type === type)?.prefix ?? "QT";
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return {
      number: `Mktro-${prefix}-001-${dd}-${mm}-${yy}-R01`,
      date: `${dd}/${mm}/${d.getFullYear()}`,
      validUntil: tpl && tpl.defaults.validityDays > 0
        ? new Date(d.getTime() + tpl.defaults.validityDays * 86400000).toLocaleDateString("en-GB")
        : undefined,
      client: previewLang === "ar" ? "شركة نموذجية" : "Sample Client Co.",
    };
  }, [type, tpl, previewLang]);

  if (!isMasterAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
        {ar ? "متاح فقط لمدير النظام الرئيسي" : "Master admin only"}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        title={
          <span style={{ background: "var(--grad-gold)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {ar ? "قوالب المستندات" : "Document Templates"}
          </span>
        }
        subtitle={
          ar
            ? "عدّل الهيدر والفوتر واللغة والوضع لكل نوع مستند. المعاينة على يمين الصفحة بمقاس A4 الحقيقي."
            : "Edit the header, footer, language and theme for every document type. Live A4 preview on the side."
        }
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={reset} disabled={!tpl || saving}>
              <RotateCcw size={15} /> {ar ? "استعادة الافتراضي" : "Reset"}
            </button>
            <button className="btn-ghost" onClick={applyToAll} disabled={!tpl || saving}>
              <Copy size={15} /> {ar ? "طبّق على كل الأنواع" : "Apply to all types"}
            </button>
            <button className="btn-primary" onClick={save} disabled={!tpl || saving || !dirty}>
              {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} {ar ? "حفظ" : "Save"}
            </button>
          </div>
        }
      />

      {/* Type tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {DOC_TYPES.map((d) => {
          const active = d.type === type;
          return (
            <button
              key={d.type}
              onClick={() => setType(d.type)}
              style={{
                whiteSpace: "nowrap",
                padding: "8px 14px",
                borderRadius: 10,
                border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                background: active ? "color-mix(in oklab, var(--primary) 16%, transparent)" : "var(--card)",
                color: active ? "var(--primary)" : "var(--foreground)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                minHeight: 40,
              }}
            >
              {docTypeLabel(d.type, ar ? "ar" : "en")}
              <span style={{ opacity: 0.6, marginInlineStart: 6, fontSize: 11 }}>{d.prefix}</span>
            </button>
          );
        })}
      </div>

      {loading || !tpl ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
          {ar ? "جارٍ التحميل…" : "Loading…"}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            alignItems: "start",
          }}
        >
          {/* ── Editor column ───────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <Section title={ar ? "الهيدر" : "Header"}>
              <Row>
                <Toggle label={ar ? "إظهار الشعار" : "Show logo"} value={tpl.header.showLogo} onChange={(v) => setHeader({ showLogo: v })} />
                <Toggle label={ar ? "خط فاصل" : "Divider rule"} value={tpl.header.showRule} onChange={(v) => setHeader({ showRule: v })} />
                <Toggle label={ar ? "صندوق البيانات" : "Meta box"} value={tpl.header.showMetaBox} onChange={(v) => setHeader({ showMetaBox: v })} />
              </Row>
              <Row>
                <Num label={ar ? "ارتفاع الشعار" : "Logo height"} value={tpl.header.logoHeight} min={20} max={110} onChange={(v) => setHeader({ logoHeight: v })} />
                <Pick
                  label={ar ? "محاذاة الشعار" : "Logo align"}
                  value={tpl.header.logoAlign}
                  options={[
                    { v: "start", l: ar ? "البداية" : "Start" },
                    { v: "center", l: ar ? "الوسط" : "Center" },
                    { v: "end", l: ar ? "النهاية" : "End" },
                  ]}
                  onChange={(v) => setHeader({ logoAlign: v as DocHeader["logoAlign"] })}
                />
                <Color label={ar ? "لون التمييز" : "Accent"} value={tpl.header.accent} onChange={(v) => setHeader({ accent: v })} />
              </Row>
              <Row>
                <Text label={ar ? "العنوان (عربي)" : "Title (AR)"} value={tpl.header.titleAr} onChange={(v) => setHeader({ titleAr: v })} />
                <Text label={ar ? "العنوان (إنجليزي)" : "Title (EN)"} value={tpl.header.titleEn} onChange={(v) => setHeader({ titleEn: v })} />
              </Row>
              <Row>
                <Text label={ar ? "اسم الشركة (عربي)" : "Company (AR)"} value={tpl.header.companyAr} onChange={(v) => setHeader({ companyAr: v })} />
                <Text label={ar ? "اسم الشركة (إنجليزي)" : "Company (EN)"} value={tpl.header.companyEn} onChange={(v) => setHeader({ companyEn: v })} />
              </Row>
              <Row>
                <Text label={ar ? "العنوان البريدي (عربي)" : "Address (AR)"} value={tpl.header.addressAr} onChange={(v) => setHeader({ addressAr: v })} />
                <Text label={ar ? "العنوان البريدي (إنجليزي)" : "Address (EN)"} value={tpl.header.addressEn} onChange={(v) => setHeader({ addressEn: v })} />
              </Row>
              <Row>
                <Text label={ar ? "الهاتف" : "Phone"} value={tpl.header.phone} onChange={(v) => setHeader({ phone: v })} />
                <Text label={ar ? "الإيميل" : "Email"} value={tpl.header.email} onChange={(v) => setHeader({ email: v })} />
              </Row>
              <Row>
                <Text label={ar ? "الموقع" : "Website"} value={tpl.header.website} onChange={(v) => setHeader({ website: v })} />
                <Text label={ar ? "الرقم الضريبي" : "Tax number"} value={tpl.header.taxNumber} onChange={(v) => setHeader({ taxNumber: v })} />
              </Row>
              <Row>
                <Area label={ar ? "نص إضافي (عربي)" : "Extra note (AR)"} value={tpl.header.extraAr} onChange={(v) => setHeader({ extraAr: v })} />
                <Area label={ar ? "نص إضافي (إنجليزي)" : "Extra note (EN)"} value={tpl.header.extraEn} onChange={(v) => setHeader({ extraEn: v })} />
              </Row>
            </Section>

            <Section title={ar ? "الفوتر" : "Footer"}>
              <Row>
                <Toggle label={ar ? "خط فاصل" : "Divider rule"} value={tpl.footer.showRule} onChange={(v) => setFooter({ showRule: v })} />
                <Toggle label={ar ? "أرقام الصفحات" : "Page numbers"} value={tpl.footer.showPageNumbers} onChange={(v) => setFooter({ showPageNumbers: v })} />
                <Toggle label={ar ? "تاريخ الإنشاء" : "Generated at"} value={tpl.footer.showGeneratedAt} onChange={(v) => setFooter({ showGeneratedAt: v })} />
              </Row>
              <Row>
                <Color label={ar ? "لون التمييز" : "Accent"} value={tpl.footer.accent} onChange={(v) => setFooter({ accent: v })} />
                <Text label={ar ? "سطر التواصل" : "Contact line"} value={tpl.footer.contactLine} onChange={(v) => setFooter({ contactLine: v })} />
              </Row>
              <Row>
                <Text label={ar ? "ملاحظة (عربي)" : "Note (AR)"} value={tpl.footer.noteAr} onChange={(v) => setFooter({ noteAr: v })} />
                <Text label={ar ? "ملاحظة (إنجليزي)" : "Note (EN)"} value={tpl.footer.noteEn} onChange={(v) => setFooter({ noteEn: v })} />
              </Row>
              <Row>
                <Area label={ar ? "بيانات الحساب البنكي (عربي)" : "Bank details (AR)"} value={tpl.footer.bankAr} onChange={(v) => setFooter({ bankAr: v })} />
                <Area label={ar ? "بيانات الحساب البنكي (إنجليزي)" : "Bank details (EN)"} value={tpl.footer.bankEn} onChange={(v) => setFooter({ bankEn: v })} />
              </Row>
              <Row>
                <Text label={ar ? "سطر التوقيع (عربي)" : "Signature (AR)"} value={tpl.footer.signatureAr} onChange={(v) => setFooter({ signatureAr: v })} />
                <Text label={ar ? "سطر التوقيع (إنجليزي)" : "Signature (EN)"} value={tpl.footer.signatureEn} onChange={(v) => setFooter({ signatureEn: v })} />
              </Row>
            </Section>

            <Section title={ar ? "الإعدادات الافتراضية للنوع" : "Type defaults"}>
              <Row>
                <Pick
                  label={ar ? "اللغة" : "Language"}
                  value={tpl.defaults.lang}
                  options={[{ v: "ar", l: "العربية" }, { v: "en", l: "English" }]}
                  onChange={(v) => { setTpl({ ...tpl, defaults: { ...tpl.defaults, lang: v as DocLang } }); setDirty(true); }}
                />
                <Pick
                  label={ar ? "الوضع" : "Theme"}
                  value={tpl.defaults.theme}
                  options={[{ v: "light", l: ar ? "ورقة بيضاء" : "Light" }, { v: "dark", l: ar ? "داكن" : "Dark" }]}
                  onChange={(v) => { setTpl({ ...tpl, defaults: { ...tpl.defaults, theme: v as DocTheme } }); setDirty(true); }}
                />
                <Pick
                  label={ar ? "العملة" : "Currency"}
                  value={tpl.defaults.currency}
                  options={[{ v: "USD", l: "USD" }, { v: "SYP", l: ar ? "ل.س" : "SYP" }, { v: "EUR", l: "EUR" }]}
                  onChange={(v) => { setTpl({ ...tpl, defaults: { ...tpl.defaults, currency: v } }); setDirty(true); }}
                />
                <Num
                  label={ar ? "مدة الصلاحية (يوم)" : "Validity (days)"}
                  value={tpl.defaults.validityDays}
                  min={0}
                  max={365}
                  onChange={(v) => { setTpl({ ...tpl, defaults: { ...tpl.defaults, validityDays: v } }); setDirty(true); }}
                />
              </Row>
              <Row>
                <Area label={ar ? "الشروط (عربي)" : "Terms (AR)"} value={tpl.defaults.termsAr} onChange={(v) => { setTpl({ ...tpl, defaults: { ...tpl.defaults, termsAr: v } }); setDirty(true); }} />
                <Area label={ar ? "الشروط (إنجليزي)" : "Terms (EN)"} value={tpl.defaults.termsEn} onChange={(v) => { setTpl({ ...tpl, defaults: { ...tpl.defaults, termsEn: v } }); setDirty(true); }} />
              </Row>
            </Section>
          </div>

          {/* ── Preview column ──────────────────────────────── */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <MiniToggle
                active={previewLang === "ar"}
                onClick={() => setPreviewLang("ar")}
                label="AR"
              />
              <MiniToggle active={previewLang === "en"} onClick={() => setPreviewLang("en")} label="EN" />
              <span style={{ width: 1, height: 22, background: "var(--border)" }} />
              <MiniToggle active={previewTheme === "light"} onClick={() => setPreviewTheme("light")} label={<Sun size={14} />} />
              <MiniToggle active={previewTheme === "dark"} onClick={() => setPreviewTheme("dark")} label={<Moon size={14} />} />
            </div>

            <PaperPreview>
              <DocPaper
                header={tpl.header}
                footer={tpl.footer}
                lang={previewLang}
                theme={previewTheme}
                meta={sampleMeta}
                page={{ current: 1, total: 1 }}
              >
                <SampleBody lang={previewLang} theme={previewTheme} terms={previewLang === "ar" ? tpl.defaults.termsAr : tpl.defaults.termsEn} currency={tpl.defaults.currency} />
              </DocPaper>
            </PaperPreview>
          </div>
        </div>
      )}
    </div>
  );
}

/** Scales the fixed 794px A4 paper down to whatever width is available. */
function PaperPreview({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(0);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  const scale = width > 0 ? Math.min(1, width / 794) : 1;
  return (
    <div ref={setEl} style={{ width: "100%", overflow: "hidden" }}>
      <div style={{ height: 1123 * scale, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: 794 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SampleBody({ lang, theme, terms, currency }: { lang: DocLang; theme: DocTheme; terms: string; currency: string }) {
  const ar = lang === "ar";
  const c = theme === "light"
    ? { border: "#DCE5EE", zebra: "#F1F5F9", muted: "#5A6B7D", surface: "#F5F8FB" }
    : { border: "#1E3A57", zebra: "#0B1A2A", muted: "#94A3B8", surface: "#0F2031" };
  const rows = [
    { d: ar ? "توريد وتركيب سخان شمسي" : "Supply & install solar heater", q: 2, p: 1250 },
    { d: ar ? "أعمال التمديدات الميكانيكية" : "Mechanical piping works", q: 1, p: 860 },
    { d: ar ? "لوحة تحكم وأتمتة" : "Control & automation panel", q: 1, p: 540 },
  ];
  const total = rows.reduce((s, r) => s + r.q * r.p, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 11.5 }}>
        {ar ? "نموذج للمعاينة فقط — سيتم استبدال هذا المحتوى بمحرر المستند في المرحلة القادمة." : "Preview sample only — replaced by the document editor in the next phase."}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: c.surface }}>
            <Th c={c}>#</Th>
            <Th c={c}>{ar ? "البيان" : "Description"}</Th>
            <Th c={c}>{ar ? "الكمية" : "Qty"}</Th>
            <Th c={c}>{ar ? "السعر" : "Unit"}</Th>
            <Th c={c}>{ar ? "الإجمالي" : "Total"}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? c.zebra : "transparent" }}>
              <Td c={c}>{i + 1}</Td>
              <Td c={c}>{r.d}</Td>
              <Td c={c}>{r.q}</Td>
              <Td c={c}>{r.p.toLocaleString("en-US")}</Td>
              <Td c={c}>{(r.q * r.p).toLocaleString("en-US")}</Td>
            </tr>
          ))}
          <tr>
            <Td c={c} colSpan={4} bold>{ar ? "الإجمالي" : "Grand total"}</Td>
            <Td c={c} bold>{`${total.toLocaleString("en-US")} ${currency}`}</Td>
          </tr>
        </tbody>
      </table>
      {terms && <div style={{ fontSize: 11, color: c.muted, whiteSpace: "pre-wrap" }}>{terms}</div>}
    </div>
  );
}

function Th({ c, children }: { c: { border: string }; children: React.ReactNode }) {
  return <th style={{ border: `1px solid ${c.border}`, padding: "6px 8px", fontWeight: 700, textAlign: "inherit" }}>{children}</th>;
}
function Td({ c, children, colSpan, bold }: { c: { border: string }; children: React.ReactNode; colSpan?: number; bold?: boolean }) {
  return <td colSpan={colSpan} style={{ border: `1px solid ${c.border}`, padding: "6px 8px", fontWeight: bold ? 700 : 400 }}>{children}</td>;
}

/* ── Small form primitives (match the app's inline-style approach) ───── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))" }}>
      {children}
    </div>
  );
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, color: "var(--muted-foreground)", marginBottom: 4, display: "block" };
const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 13,
};

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="number" style={inputStyle} value={value} min={min} max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      />
    </label>
  );
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 44, height: 40, borderRadius: 9, border: "1px solid var(--border)", background: "transparent", padding: 2 }} />
        <input style={{ ...inputStyle, direction: "ltr" }} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  );
}
function Pick({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", gap: 8, minHeight: 40, padding: "8px 10px",
        borderRadius: 9, cursor: "pointer", fontSize: 12.5, textAlign: "start",
        border: `1px solid ${value ? "var(--primary)" : "var(--border)"}`,
        background: value ? "color-mix(in oklab, var(--primary) 14%, transparent)" : "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <span
        style={{
          width: 16, height: 16, borderRadius: 5, flexShrink: 0,
          border: `1px solid ${value ? "var(--primary)" : "var(--border)"}`,
          background: value ? "var(--primary)" : "transparent",
        }}
      />
      {label}
    </button>
  );
}
function MiniToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minWidth: 44, minHeight: 36, padding: "6px 12px", borderRadius: 9, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        background: active ? "color-mix(in oklab, var(--primary) 16%, transparent)" : "var(--card)",
        color: active ? "var(--primary)" : "var(--foreground)",
      }}
    >
      {label}
    </button>
  );
}
