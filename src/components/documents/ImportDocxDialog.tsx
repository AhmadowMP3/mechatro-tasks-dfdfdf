// Import a Word (.docx) file, let the AI read it, review everything on the
// branded A4 sheet, then approve to create the real document.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Check, X, Sparkles, FileText, AlertTriangle } from "lucide-react";

import { convertDocx, guessLang, isDocxFile, isLegacyDoc, type DocxImport } from "@/lib/docs/import-docx";
import { analyzeImportedDoc, type DocxExtraction } from "@/lib/docs/import-ai.functions";
import { docTemplates } from "@/lib/docs/api";
import { businessDocs, type BusinessDoc } from "@/lib/docs/docs-api";
import { emptyClient, defaultModel, type DocClient } from "@/lib/docs/model";
import { DOC_TYPES, docTypeLabel, type DocLang, type DocTemplate, type DocType } from "@/lib/docs/types";
import { PaginatedDoc } from "./PaginatedDoc";
import { CURRENCIES, currencyLabel } from "@/lib/currency";

const MAX_BYTES = 20 * 1024 * 1024;

type Stage = "pick" | "working" | "review" | "saving";

type Draft = {
  docType: DocType;
  title: string;
  number: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  lang: DocLang;
  client: DocClient;
};

const today = () => new Date().toISOString().slice(0, 10);

function isoOrEmpty(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? v.trim() : "";
}

export function ImportDocxDialog({ ar, onClose, onCreated }: {
  ar: boolean;
  onClose: () => void;
  onCreated: (doc: BusinessDoc) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [step, setStep] = useState("");
  const [fileName, setFileName] = useState("");
  const [imported, setImported] = useState<DocxImport | null>(null);
  const [ai, setAi] = useState<DocxExtraction | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reload the template whenever the admin changes the detected type.
  useEffect(() => {
    if (!draft) return;
    let alive = true;
    docTemplates.ensure(draft.docType)
      .then((t) => { if (alive) setTpl(t); })
      .catch((e) => toast.error((e as Error).message));
    return () => { alive = false; };
  }, [draft?.docType]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (isLegacyDoc(file)) {
      toast.error(ar ? "صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx." : "Old .doc format isn't supported — save the file as .docx.");
      return;
    }
    if (!isDocxFile(file)) {
      toast.error(ar ? "الملف يجب أن يكون بصيغة .docx" : "Please choose a .docx file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(ar ? "الحد الأقصى 20 ميغابايت" : "Maximum size is 20 MB");
      return;
    }

    setFileName(file.name);
    setStage("working");
    setAiError(null);
    try {
      setStep(ar ? "جارٍ قراءة ملف Word…" : "Reading the Word file…");
      const res = await convertDocx(file);
      setImported(res);

      const lang = guessLang(res.text);
      let extraction: DocxExtraction | null = null;
      if (res.text.trim().length > 20) {
        setStep(ar ? "الذكاء الاصطناعي يحلل المحتوى…" : "AI is analysing the content…");
        try {
          extraction = await analyzeImportedDoc({ data: { text: res.text.slice(0, 24000), lang } });
        } catch (e) {
          setAiError((e as Error).message);
        }
      }
      setAi(extraction);

      const marked = new Set<string>();
      const mark = (k: string, v: unknown) => { if (v) marked.add(k); return v; };
      const type = (extraction?.docType ?? "quotation") as DocType;
      if (extraction?.docType) marked.add("docType");

      const template = await docTemplates.ensure(type);
      setTpl(template);

      setDraft({
        docType: type,
        title: (mark("title", extraction?.title) as string) || "",
        number: (mark("number", extraction?.number) as string) || "",
        issueDate: (mark("issueDate", isoOrEmpty(extraction?.issueDate)) as string) || today(),
        validUntil: (mark("validUntil", isoOrEmpty(extraction?.validUntil)) as string) || "",
        currency: (mark("currency", extraction?.currency) as string) || template.defaults.currency,
        lang: (extraction?.lang as DocLang) || lang,
        client: {
          ...emptyClient(),
          nameAr: (mark("nameAr", extraction?.client?.nameAr) as string) || "",
          nameEn: (mark("nameEn", extraction?.client?.nameEn) as string) || "",
          attn: (mark("attn", extraction?.client?.attn) as string) || "",
          phone: (mark("phone", extraction?.client?.phone) as string) || "",
          email: (mark("email", extraction?.client?.email) as string) || "",
          address: (mark("address", extraction?.client?.address) as string) || "",
          taxNumber: (mark("taxNumber", extraction?.client?.taxNumber) as string) || "",
          refAr: (mark("refAr", extraction?.client?.refAr) as string) || "",
          refEn: (mark("refEn", extraction?.client?.refEn) as string) || "",
        },
      });
      setAiFields(marked);
      setStage("review");
    } catch (e) {
      toast.error((e as Error).message || (ar ? "تعذّر قراءة الملف" : "Could not read the file"));
      setStage("pick");
    }
  };

  const hasClient = useMemo(() => {
    if (!draft) return false;
    return Object.values(draft.client).some((v) => (v ?? "").trim().length > 0);
  }, [draft]);

  const approve = async () => {
    if (!draft || !imported) return;
    try {
      setStage("saving");
      const created = await businessDocs.create(draft.docType);
      const saved = await businessDocs.save({
        ...created,
        title: draft.title || created.title,
        client: draft.client,
        lang: draft.lang,
        currency: draft.currency,
        issue_date: draft.issueDate || created.issue_date,
        valid_until: draft.validUntil || null,
        model: { ...defaultModel(), showClientBox: hasClient, html: imported.html },
      });
      toast.success(ar ? `تم إنشاء ${saved.number} من ملف Word` : `Created ${saved.number} from Word`);
      onCreated(saved);
    } catch (e) {
      toast.error((e as Error).message);
      setStage("review");
    }
  };

  const previewInput = draft && tpl && imported
    ? {
        header: tpl.header,
        footer: tpl.footer,
        model: { ...defaultModel(), showClientBox: hasClient, html: imported.html },
        client: draft.client,
        lang: draft.lang,
        theme: tpl.defaults.theme,
        currency: draft.currency,
        meta: {
          number: draft.number || "—",
          date: draft.issueDate ? new Date(draft.issueDate).toLocaleDateString("en-GB") : "—",
          validUntil: draft.validUntil ? new Date(draft.validUntil).toLocaleDateString("en-GB") : undefined,
          client: draft.lang === "ar" ? draft.client.nameAr || draft.client.nameEn : draft.client.nameEn || draft.client.nameAr,
        },
      }
    : null;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setClient = (patch: Partial<DocClient>) => setDraft((d) => (d ? { ...d, client: { ...d.client, ...patch } } : d));

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && stage !== "working" && stage !== "saving") onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,10,18,.62)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "clamp(8px, 3vw, 32px)", overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "min(1120px, 100%)", background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 16, boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)", overflow: "hidden",
        }}
      >
        {/* Head */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <FileText size={17} style={{ color: "var(--primary)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{ar ? "استيراد من Word" : "Import from Word"}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName || (ar ? "ارفع ملف .docx وسيقوم الذكاء الاصطناعي بتعبئة البيانات" : "Upload a .docx and the AI fills the fields")}
            </div>
          </div>
          <button
            className="btn-ghost"
            onClick={onClose}
            disabled={stage === "working" || stage === "saving"}
            style={{ marginInlineStart: "auto", minHeight: 36, padding: "6px 10px" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        {stage === "pick" && (
          <div style={{ padding: 28 }}>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
              onClick={pick}
              style={{
                border: "2px dashed var(--border)", borderRadius: 14, padding: "42px 20px", textAlign: "center",
                cursor: "pointer", background: "color-mix(in oklab, var(--primary) 4%, transparent)",
              }}
            >
              <Upload size={26} style={{ color: "var(--primary)" }} />
              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>
                {ar ? "اسحب ملف .docx هنا أو اضغط للاختيار" : "Drop a .docx here, or click to choose"}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                {ar
                  ? "النصوص والجداول والصور تُستورد كما هي — الهيدر والفوتر والشعار تبقى من القالب. الحد 20 ميغابايت."
                  : "Text, tables and images are imported as-is — header, footer and logo stay from the template. 20 MB max."}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleFile(f); }}
            />
          </div>
        )}

        {(stage === "working" || stage === "saving") && (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted-foreground)" }}>
            <Loader2 size={26} className="spin" style={{ color: "var(--primary)" }} />
            <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 700, color: "var(--foreground)" }}>
              {stage === "saving" ? (ar ? "جارٍ إنشاء المستند…" : "Creating the document…") : step}
            </div>
          </div>
        )}

        {stage === "review" && draft && previewInput && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 0, alignItems: "stretch" }}>
            {/* Fields */}
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxHeight: "72vh", overflowY: "auto" }}>
              <Summary ar={ar} ai={ai} aiError={aiError} imported={imported} />

              <FieldGroup title={ar ? "المستند" : "Document"}>
                <Field label={ar ? "نوع المستند" : "Document type"} aiFilled={aiFields.has("docType")} ar={ar}>
                  <select
                    value={draft.docType}
                    onChange={(e) => set({ docType: e.target.value as DocType })}
                    style={inputStyle}
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.type} value={d.type}>{docTypeLabel(d.type, ar ? "ar" : "en")}</option>
                    ))}
                  </select>
                </Field>
                <Field label={ar ? "العنوان" : "Title"} aiFilled={aiFields.has("title")} ar={ar}>
                  <input value={draft.title} onChange={(e) => set({ title: e.target.value })} style={inputStyle} />
                </Field>
                <Field label={ar ? "رقم المرجع في الملف" : "Reference number in the file"} aiFilled={aiFields.has("number")} ar={ar}>
                  <input value={draft.number} onChange={(e) => set({ number: e.target.value })} style={inputStyle} dir="ltr" />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label={ar ? "تاريخ الإصدار" : "Issue date"} aiFilled={aiFields.has("issueDate")} ar={ar}>
                    <input type="date" value={draft.issueDate} onChange={(e) => set({ issueDate: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={ar ? "صالح حتى" : "Valid until"} aiFilled={aiFields.has("validUntil")} ar={ar}>
                    <input type="date" value={draft.validUntil} onChange={(e) => set({ validUntil: e.target.value })} style={inputStyle} />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label={ar ? "العملة" : "Currency"} aiFilled={aiFields.has("currency")} ar={ar}>
                    <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })} style={inputStyle}>
                      {[...new Set([...CURRENCIES, draft.currency])].map((c) => (
                        <option key={c} value={c}>{currencyLabel(c as (typeof CURRENCIES)[number], ar ? "ar" : "en")}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={ar ? "لغة المستند" : "Document language"} ar={ar}>
                    <select value={draft.lang} onChange={(e) => set({ lang: e.target.value as DocLang })} style={inputStyle}>
                      <option value="ar">{ar ? "عربي" : "Arabic"}</option>
                      <option value="en">{ar ? "إنجليزي" : "English"}</option>
                    </select>
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title={ar ? "العميل" : "Client"}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label={ar ? "الاسم (عربي)" : "Name (AR)"} aiFilled={aiFields.has("nameAr")} ar={ar}>
                    <input value={draft.client.nameAr} onChange={(e) => setClient({ nameAr: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={ar ? "الاسم (إنجليزي)" : "Name (EN)"} aiFilled={aiFields.has("nameEn")} ar={ar}>
                    <input value={draft.client.nameEn} onChange={(e) => setClient({ nameEn: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={ar ? "عناية" : "Attn"} aiFilled={aiFields.has("attn")} ar={ar}>
                    <input value={draft.client.attn} onChange={(e) => setClient({ attn: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={ar ? "الهاتف" : "Phone"} aiFilled={aiFields.has("phone")} ar={ar}>
                    <input value={draft.client.phone} onChange={(e) => setClient({ phone: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                  <Field label={ar ? "الإيميل" : "Email"} aiFilled={aiFields.has("email")} ar={ar}>
                    <input value={draft.client.email} onChange={(e) => setClient({ email: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                  <Field label={ar ? "الرقم الضريبي" : "Tax number"} aiFilled={aiFields.has("taxNumber")} ar={ar}>
                    <input value={draft.client.taxNumber} onChange={(e) => setClient({ taxNumber: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                </div>
                <Field label={ar ? "العنوان" : "Address"} aiFilled={aiFields.has("address")} ar={ar}>
                  <input value={draft.client.address} onChange={(e) => setClient({ address: e.target.value })} style={inputStyle} />
                </Field>
              </FieldGroup>
            </div>

            {/* Preview */}
            <div style={{ borderInlineStart: "1px solid var(--border)", background: "var(--surface-2, var(--background))", padding: 16, maxHeight: "72vh", overflow: "auto" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 10 }}>
                {ar ? "المعاينة على القالب الرسمي" : "Preview on the official template"}
              </div>
              <div style={{ width: 794 * 0.44, height: "auto" }}>
                <div style={{ transform: "scale(0.44)", transformOrigin: ar ? "top right" : "top left", width: 794 }}>
                  <PaginatedDoc input={previewInput} gap={14} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {stage === "review" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: 14, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={() => { setStage("pick"); setDraft(null); setImported(null); setAi(null); }}>
              {ar ? "ملف آخر" : "Another file"}
            </button>
            <button className="btn-ghost" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
            <button className="btn-primary" onClick={approve}>
              <Check size={15} /> {ar ? "اعتماد وإنشاء المستند" : "Approve & create document"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--background)",
  color: "var(--foreground)", fontSize: 13,
};

function Summary({ ar, ai, aiError, imported }: { ar: boolean; ai: DocxExtraction | null; aiError: string | null; imported: DocxImport | null }) {
  const missing = ai?.missing ?? [];
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, background: "color-mix(in oklab, var(--primary) 6%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800 }}>
        <Sparkles size={14} style={{ color: "var(--primary)" }} />
        {ar ? "ملخّص التحليل" : "Analysis summary"}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        {ar
          ? `تم استيراد المحتوى: ${imported?.tables ?? 0} جدول، ${imported?.images ?? 0} صورة.`
          : `Imported content: ${imported?.tables ?? 0} table(s), ${imported?.images ?? 0} image(s).`}
      </div>
      {aiError && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#F59E0B" }}>
          <AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{ar ? "تعذّر تحليل الحقول بالذكاء الاصطناعي — عبّئها يدويًا. " : "AI field extraction failed — fill the fields manually. "}{aiError}</span>
        </div>
      )}
      {!aiError && missing.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {(ar ? "لم يتم العثور على: " : "Not found: ") + missing.join("، ")}
        </div>
      )}
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".04em" }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, aiFilled, ar }: { label: string; children: React.ReactNode; aiFilled?: boolean; ar?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {aiFilled && (
          <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "color-mix(in oklab, var(--primary) 18%, transparent)", color: "var(--primary)" }}>
            {ar ? "بالذكاء" : "AI"}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
