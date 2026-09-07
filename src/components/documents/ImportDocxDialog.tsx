// Import a Word (.docx) or PDF file, let the AI read it, review everything on the
// branded A4 sheet, then approve to create the real document.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Check, X, Sparkles, FileText, AlertTriangle, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

import { convertDocx, guessLang, isDocxFile, isLegacyDoc, type DocxImport } from "@/lib/docs/import-docx";
import { convertPdf, isPdfFile } from "@/lib/docs/import-pdf";
import { analyzeImportedDoc, type DocxExtraction, type DocxItem } from "@/lib/docs/import-ai.functions";
import { docTemplates } from "@/lib/docs/api";
import { businessDocs, type BusinessDoc } from "@/lib/docs/docs-api";
import { emptyClient, defaultModel, uid, type DocClient } from "@/lib/docs/model";
import { emptyItemsData, writeItemsAttr } from "@/lib/docs/rich";
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

export type DocxApplyPayload = {
  html: string;
  title: string;
  lang: DocLang;
  currency: string;
  issueDate: string;
  validUntil: string;
  client: DocClient;
  showClientBox: boolean;
};

export function ImportDocxDialog({ ar, onClose, onCreated, mode = "create", onApply }: {
  ar: boolean;
  onClose: () => void;
  onCreated?: (doc: BusinessDoc) => void;
  /** "create" makes a new document; "apply" replaces the open document body. */
  mode?: "create" | "apply";
  onApply?: (payload: DocxApplyPayload) => void;
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
  const [items, setItems] = useState<DocxItem[]>([]);
  const [insertItems, setInsertItems] = useState(false);
  const [keepFormat, setKeepFormat] = useState(true);
  const [reconverting, setReconverting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<File | null>(null);

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
    const pdf = isPdfFile(file);
    if (!isDocxFile(file) && !pdf) {
      toast.error(ar ? "الملف يجب أن يكون بصيغة .docx أو .pdf" : "Please choose a .docx or .pdf file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(ar ? "الحد الأقصى 20 ميغابايت" : "Maximum size is 20 MB");
      return;
    }

    fileRef.current = file;
    setFileName(file.name);
    setStage("working");
    setAiError(null);
    try {
      setStep(pdf
        ? (ar ? "جارٍ قراءة ملف PDF…" : "Reading the PDF file…")
        : (ar ? "جارٍ قراءة ملف Word…" : "Reading the Word file…"));
      const res = pdf
        ? await convertPdf(file, { keepFormatting: keepFormat })
        : await convertDocx(file, { keepFormatting: keepFormat });
      setImported(res);

      const lang = guessLang(res.text);
      const source = (res.digest || res.text).slice(0, 60000);
      let extraction: DocxExtraction | null = null;
      if (source.trim().length > 20) {
        setStep(ar ? "الذكاء الاصطناعي يحلل المحتوى…" : "AI is analysing the content…");
        try {
          extraction = await analyzeImportedDoc({ data: { text: source, lang } });
        } catch (e) {
          setAiError((e as Error).message);
        }
      }
      setAi(extraction);
      setItems(extraction?.items ?? []);
      setInsertItems(false);

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

  // Re-run the conversion when the admin flips the formatting switch.
  const toggleFormatting = async (next: boolean) => {
    setKeepFormat(next);
    const file = fileRef.current;
    if (!file) return;
    try {
      setReconverting(true);
      const res = isPdfFile(file)
        ? await convertPdf(file, { keepFormatting: next })
        : await convertDocx(file, { keepFormatting: next });
      setImported(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReconverting(false);
    }
  };

  const hasClient = useMemo(() => {
    if (!draft) return false;
    return Object.values(draft.client).some((v) => (v ?? "").trim().length > 0);
  }, [draft]);

  const itemsHtml = () => {
    const rows = items
      .filter((it) => (it.descAr || it.descEn || it.no || it.qty != null || it.price != null))
      .map((it) => ({
        id: uid(),
        descAr: it.descAr ?? "",
        descEn: it.descEn ?? "",
        unitAr: it.unit ?? "",
        unitEn: it.unit ?? "",
        qty: it.qty ?? 0,
        price: it.price ?? 0,
        discount: 0,
      }));
    if (rows.length === 0) return "";
    const data = { ...emptyItemsData(), rows };
    return `<table data-items="${writeItemsAttr(data)}"></table><p><br/></p>`;
  };

  const bodyHtml = () => {
    const base = imported?.html ?? "";
    return insertItems ? `${base}${itemsHtml()}` : base;
  };

  const approve = async () => {
    if (!draft || !imported) return;
    // Apply mode: hand the imported body and confirmed fields back to the
    // open document — nothing is written until the admin saves there.
    if (mode === "apply") {
      onApply?.({
        html: bodyHtml(),
        title: draft.title,
        lang: draft.lang,
        currency: draft.currency,
        issueDate: draft.issueDate,
        validUntil: draft.validUntil,
        client: draft.client,
        showClientBox: hasClient,
      });
      return;
    }
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
        model: { ...defaultModel(), showClientBox: hasClient, html: bodyHtml() },
      });
      toast.success(ar ? `تم إنشاء ${saved.number} من الملف المستورد` : `Created ${saved.number} from the imported file`);
      onCreated?.(saved);
    } catch (e) {
      toast.error((e as Error).message);
      setStage("review");
    }
  };

  const previewInput = draft && tpl && imported
    ? {
        header: tpl.header,
        footer: tpl.footer,
        model: { ...defaultModel(), showClientBox: hasClient, html: bodyHtml() },
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
            <div style={{ fontSize: 14, fontWeight: 800 }}>{ar ? "استيراد من Word أو PDF" : "Import from Word or PDF"}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName || (ar ? "ارفع ملف .docx أو .pdf وسيقوم الذكاء الاصطناعي بتعبئة البيانات" : "Upload a .docx or .pdf and the AI fills the fields")}
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
                {ar ? "اسحب ملف .docx أو .pdf هنا أو اضغط للاختيار" : "Drop a .docx or .pdf here, or click to choose"}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                {ar
                  ? "النصوص والجداول والصور تُستورد بتنسيقها — الهيدر والفوتر والشعار تبقى دائماً من القالب. الحد 20 ميغابايت."
                  : "Text, tables and images come across with their formatting — header, footer and logo always stay from the template. 20 MB max."}
              </div>
            </div>
            <label
              onClick={(e) => e.stopPropagation()}
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              <input type="checkbox" checked={keepFormat} onChange={(e) => setKeepFormat(e.target.checked)} />
              {ar ? "حافظ على التنسيق الأصلي (الألوان والخطوط والجداول)" : "Keep the original formatting (colours, fonts, tables)"}
            </label>
            <input
              ref={inputRef}
              type="file"
              accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
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

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={keepFormat}
                  disabled={reconverting}
                  onChange={(e) => void toggleFormatting(e.target.checked)}
                />
                {ar ? "حافظ على التنسيق الأصلي" : "Keep the original formatting"}
                {reconverting && <Loader2 size={13} className="spin" />}
              </label>

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
            <ZoomablePreview ar={ar}>
              <PaginatedDoc input={previewInput} gap={14} />
            </ZoomablePreview>
          </div>
        )}

        {/* Footer actions */}
        {stage === "review" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: 14, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={() => { setStage("pick"); setDraft(null); setImported(null); setAi(null); }}>
              {ar ? "ملف آخر" : "Another file"}
            </button>
            <button className="btn-ghost" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
            {mode === "apply" && (
              <span style={{ marginInlineEnd: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#F5B301" }}>
                <AlertTriangle size={14} />
                {ar ? "سيُستبدل محتوى الورقة الحالي" : "The current sheet content will be replaced"}
              </span>
            )}
            <button className="btn-primary" onClick={approve}>
              <Check size={15} />{" "}
              {mode === "apply"
                ? (ar ? "تطبيق على هذا المستند" : "Apply to this document")
                : (ar ? "اعتماد وإنشاء المستند" : "Approve & create document")}
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

/* ── Zoomable preview pane ────────────────────────────────────── */

const PAGE_W = 794;
const FIT_ZOOM = 0.44;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function ZoomablePreview({ ar, children }: { ar: boolean; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [contentH, setContentH] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Track the unscaled height so the scroll area matches the zoomed sheet.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentH(el.getBoundingClientRect().height / zoomRef.current);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom around a point, keeping it visually anchored.
  const zoomAt = (next: number, px: number, py: number) => {
    const box = scrollRef.current;
    const prev = zoomRef.current;
    const z = clampZoom(next);
    if (!box || z === prev) return;
    const k = z / prev;
    const left = box.scrollLeft, top = box.scrollTop;
    setZoom(z);
    requestAnimationFrame(() => {
      box.scrollLeft = (left + px) * k - px;
      box.scrollTop = (top + py) * k - py;
    });
  };

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps normal scrolling
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = box.getBoundingClientRect();
      zoomAt(zoomRef.current * Math.exp(-dy * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  const step = (factor: number) => {
    const box = scrollRef.current;
    if (!box) return;
    zoomAt(zoomRef.current * factor, box.clientWidth / 2, box.clientHeight / 2);
  };

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)",
    background: "transparent", color: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ borderInlineStart: "1px solid var(--border)", background: "var(--surface-2, var(--background))", display: "flex", flexDirection: "column", maxHeight: "72vh", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", marginInlineEnd: "auto" }}>
          {ar ? "المعاينة على القالب الرسمي" : "Preview on the official template"}
        </div>
        <button type="button" style={btn} onClick={() => step(1 / 1.2)} title={ar ? "تصغير" : "Zoom out"} aria-label={ar ? "تصغير" : "Zoom out"}>
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button type="button" style={btn} onClick={() => step(1.2)} title={ar ? "تكبير" : "Zoom in"} aria-label={ar ? "تكبير" : "Zoom in"}>
          <ZoomIn size={14} />
        </button>
        <button type="button" style={btn} onClick={() => setZoom(FIT_ZOOM)} title={ar ? "ملائمة العرض" : "Fit width"} aria-label={ar ? "ملائمة العرض" : "Fit width"}>
          <Maximize2 size={14} />
        </button>
      </div>
      <div ref={scrollRef} style={{ overflow: "auto", padding: 16, flex: 1 }}>
        <div style={{ width: PAGE_W * zoom, height: contentH * zoom, marginInlineStart: ar ? "auto" : 0 }}>
          <div
            ref={contentRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: ar ? "top right" : "top left", width: PAGE_W }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
