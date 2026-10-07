// Import a Word (.docx) file, extract every field programmatically from the
// file itself, preview the exact Word render on the Mechatro letterhead, then
// approve. The original file is stored so the PDF is always rendered from it.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Check, X, ListChecks, FileText, AlertTriangle, ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";

import { convertDocx, guessLang, isDocxFile, isLegacyDoc, type DocxImport } from "@/lib/docs/import-docx";
import type { DocBlock } from "@/lib/docs/doc-model";
import type { DroppedKind } from "@/lib/docs/docx-to-model";

import { extractDocxFields, type DocxExtraction, type DocxItem } from "@/lib/docs/extract-docx-fields";

import { docTemplates } from "@/lib/docs/api";
import { businessDocs, type BusinessDoc } from "@/lib/docs/docs-api";
import { emptyClient, defaultModel, uid, type DocClient, type WordImport } from "@/lib/docs/model";
import { emptyItemsData, writeItemsAttr } from "@/lib/docs/rich";
import { DOC_TYPES, docTypeLabel, type DocLang, type DocTemplate, type DocType } from "@/lib/docs/types";
import {
  buildExactPdf,
  exactErrorMessage,
  MAX_SOURCE_BYTES,
  uploadWordSource,
  type ExactPdfCache,
} from "@/lib/docs/word-exact/exact-pdf";
import { assertNoActiveContent } from "@/lib/docs/word-exact/prepare-docx";
import { PaginatedDoc } from "./PaginatedDoc";
import { CURRENCIES, currencyLabel } from "@/lib/currency";

const MAX_BYTES = MAX_SOURCE_BYTES;

type ExactState = {
  busy: boolean;
  step: "layout" | "word" | "letterhead" | null;
  url: string | null;
  pages: number;
  warnings: string[];
  error: string | null;
};

const EXACT_IDLE: ExactState = { busy: false, step: null, url: null, pages: 0, warnings: [], error: null };

type Stage = "pick" | "working" | "review" | "saving";

type Draft = {
  docType: DocType;
  title: string;
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
  /** Canonical blocks produced from the Word file (omitted when item rows are appended). */
  blocks?: DocBlock[];
  /** The stored original file; active when the exact Word render succeeded. */
  wordImport: WordImport;
};

export function ImportDocxDialog({ ar, onClose, onCreated, mode = "create", onApply, number }: {
  ar: boolean;
  onClose: () => void;
  onCreated?: (doc: BusinessDoc) => void;
  /** "create" makes a new document; "apply" replaces the open document body. */
  mode?: "create" | "apply";
  onApply?: (payload: DocxApplyPayload) => void;
  /** Number of the open document (apply mode); new documents get one on approve. */
  number?: string;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [step, setStep] = useState("");
  const [fileName, setFileName] = useState("");
  const [imported, setImported] = useState<DocxImport | null>(null);
  const [ai, setAi] = useState<DocxExtraction | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<DocxItem[]>([]);
  const [insertItems, setInsertItems] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<File | null>(null);
  const [exact, setExact] = useState<ExactState>(EXACT_IDLE);
  const exactCache = useRef<ExactPdfCache>({});
  const [exactRun, setExactRun] = useState(0);

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
      toast.error(ar ? "الحد الأقصى 10 ميغابايت" : "Maximum size is 10 MB");
      return;
    }

    fileRef.current = file;
    exactCache.current = {};
    setExact(EXACT_IDLE);
    setFileName(file.name);
    setStage("working");
    try {
      setStep(ar ? "جارٍ قراءة ملف Word…" : "Reading the Word file…");
      await assertNoActiveContent(file);
      const res = await convertDocx(file);

      setImported(res);

      const lang = guessLang(res.text);
      setStep(ar ? "جارٍ استخراج البيانات من الملف…" : "Extracting the fields from the file…");
      const extraction = extractDocxFields({
        html: res.html,
        text: res.text,
        digest: res.digest,
        fileName: file.name,
        lang,
      });
      setAi(extraction);
      setItems(extraction.items);
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
      toast.error(exactErrorMessage(e, ar) || (ar ? "تعذّر قراءة الملف" : "Could not read the file"));
      setStage("pick");
    }
  };

  const hasClient = useMemo(() => {
    if (!draft) return false;
    return Object.values(draft.client).some((v) => (v ?? "").trim().length > 0);
  }, [draft]);

  const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);
  const autoNumber = draft?.lang === "ar" ? "يُولَّد تلقائياً" : "Auto";
  const meta = draft
    ? {
        number: number || autoNumber,
        date: fmtDate(draft.issueDate) ?? "—",
        validUntil: fmtDate(draft.validUntil),
        client: (draft.lang === "ar" ? draft.client.nameAr || draft.client.nameEn : draft.client.nameEn || draft.client.nameAr) || undefined,
      }
    : null;
  const metaKey = JSON.stringify([meta, draft?.lang, tpl?.id, tpl?.updated_at, tpl?.header, tpl?.footer]);

  // Exact preview: the Word engine renders the file, the letterhead goes on
  // top. Re-run (debounced) whenever a letterhead field changes; the Word
  // render itself is reused while the header/footer bands keep their height.
  useEffect(() => {
    const file = fileRef.current;
    if (stage !== "review" || !draft || !tpl || !meta || !file) return;
    let alive = true;
    const t = setTimeout(() => {
      setExact((s) => ({ ...s, busy: true, error: null }));
      file.arrayBuffer()
        .then((source) => buildExactPdf(
          source,
          { header: tpl.header, footer: tpl.footer, lang: draft.lang, meta },
          { cache: exactCache.current, onStep: (step) => { if (alive) setExact((s) => ({ ...s, step })); } },
        ))
        .then(async (res) => {
          if (!alive) return;
          const url = URL.createObjectURL(new Blob([new Uint8Array(res.pdf)], { type: "application/pdf" }));
          const warnings: string[] = [];
          if (res.landscapeSections > 0) {
            warnings.push(ar ? "الصفحات الأفقية تظهر بدون هيدر وفوتر ميكاترو." : "Landscape pages are shown without the Mechatro header and footer.");
          }
          if (res.pageAnchoredShapes > 0) {
            warnings.push(ar ? "في الملف أشكال مثبّتة على الصفحة — تأكّد أنها لا تختفي تحت الهيدر أو الفوتر." : "The file has shapes pinned to the page — check none are hidden under the header or footer.");
          }
          setExact((s) => {
            if (s.url) URL.revokeObjectURL(s.url);
            return { busy: false, step: null, url, pages: res.pages, warnings, error: null };
          });
        })
        .catch((e) => {
          if (alive) setExact((s) => ({ ...s, busy: false, step: null, error: exactErrorMessage(e, ar) }));
        });
    }, 700);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, metaKey, exactRun]);

  // Free the preview blob when the dialog goes away.
  const exactUrlRef = useRef<string | null>(null);
  exactUrlRef.current = exact.url;
  useEffect(() => () => { if (exactUrlRef.current) URL.revokeObjectURL(exactUrlRef.current); }, []);

  const exactReady = !!exact.url && !exact.busy && !exact.error;

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
    const file = fileRef.current;
    if (!draft || !imported || !file) return;
    try {
      setStage("saving");
      // The original file is always kept: the exact PDF is rendered from it,
      // and a document saved while the engine was down can switch later.
      const wordImport: WordImport = {
        sourcePath: await uploadWordSource(file),
        fileName: file.name,
        active: exactReady,
      };

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
          ...(insertItems ? {} : { blocks: imported.model.blocks }),
          wordImport,
        });
        return;
      }

      const created = await businessDocs.create(draft.docType);
      const saved = await businessDocs.save({
        ...created,
        title: draft.title || created.title,
        client: draft.client,
        lang: draft.lang,
        // The Word page is white paper, so the letterhead stays light too.
        theme: wordImport.active ? "light" : created.theme,
        currency: draft.currency,
        issue_date: draft.issueDate || created.issue_date,
        valid_until: draft.validUntil || null,
        model: {
          ...defaultModel(),
          showClientBox: hasClient,
          html: bodyHtml(),
          ...(insertItems ? {} : { blocks: imported.model.blocks }),
          wordImport,
        },
      });
      toast.success(ar ? `تم إنشاء ${saved.number} من الملف المستورد` : `Created ${saved.number} from the imported file`);
      onCreated?.(saved);
    } catch (e) {
      toast.error(exactErrorMessage(e, ar));
      setStage("review");
    }
  };

  const previewInput = draft && tpl && imported && meta
    ? {
        header: tpl.header,
        footer: tpl.footer,
        model: {
          ...defaultModel(),
          showClientBox: hasClient,
          html: bodyHtml(),
          ...(insertItems ? {} : { blocks: imported.model.blocks }),
        },
        client: draft.client,
        lang: draft.lang,
        theme: tpl.defaults.theme,
        currency: draft.currency,
        meta,
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
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {ar ? "استيراد من Word" : "Import from Word"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName || (ar ? "ارفع ملف .docx وسيتم استخراج البيانات من الملف نفسه" : "Upload a .docx — the fields are read from the file itself")}

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
                  ? "يبقى ملف Word كما هو تماماً: النصوص والجداول والألوان والخطوط والصور. يُضاف فقط هيدر وفوتر ميكاترو ورقم المستند. الحد 10 ميغابايت."
                  : "The Word file stays exactly as it is: text, tables, colours, fonts and images. Only the Mechatro header, footer and document number are added. 10 MB max."}
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
              <Summary ar={ar} ai={ai} imported={imported} exact={exactReady} />


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
                <Field label={ar ? "رقم المستند" : "Document number"} ar={ar}>
                  <input value={number || (ar ? "يُولَّد تلقائياً عند الاعتماد" : "Assigned automatically on approve")} readOnly disabled style={{ ...inputStyle, opacity: 0.7 }} dir={number ? "ltr" : undefined} />
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

            {/* Preview: the exact Word render; the editable copy only as a fallback */}
            {exact.error ? (
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <ExactNotice ar={ar} tone="error" onRetry={() => setExactRun((n) => n + 1)}>
                  {exact.error}{" "}
                  {ar
                    ? "المعاينة أدناه هي النسخة القابلة للتعديل (أقل دقة). يمكنك الاعتماد الآن، والملف الأصلي يُحفظ لتفعيل التنسيق الدقيق لاحقاً."
                    : "Below is the editable copy (less accurate). You can approve now; the original file is kept so the exact layout can be switched on later."}
                </ExactNotice>
                <ZoomablePreview ar={ar}>
                  <PaginatedDoc input={previewInput} gap={14} />
                </ZoomablePreview>
              </div>
            ) : (
              <ExactPreview ar={ar} exact={exact} onRefresh={() => setExactRun((n) => n + 1)} />
            )}
          </div>
        )}

        {/* Footer actions */}
        {stage === "review" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: 14, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={() => { setStage("pick"); setDraft(null); setImported(null); setAi(null); setExact((s) => { if (s.url) URL.revokeObjectURL(s.url); return EXACT_IDLE; }); }}>
              {ar ? "ملف آخر" : "Another file"}
            </button>
            <button className="btn-ghost" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
            {mode === "apply" && (
              <span style={{ marginInlineEnd: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#F5B301" }}>
                <AlertTriangle size={14} />
                {ar ? "سيُستبدل محتوى الورقة الحالي" : "The current sheet content will be replaced"}
              </span>
            )}
            <button className="btn-primary" onClick={approve} disabled={exact.busy}>
              {exact.busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{" "}
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

const DROPPED_LABELS: Record<DroppedKind, { ar: string; en: string }> = {
  pageSetup: { ar: "إعداد الصفحة والهوامش", en: "page setup and margins" },
  headersFooters: { ar: "ترويسة وتذييل الملف الأصلي", en: "the file's own header and footer" },
  fontsAndColours: { ar: "الخطوط والأحجام والألوان", en: "fonts, sizes and colours" },
  spacing: { ar: "المسافات اليدوية", en: "manual spacing" },
  emptyParagraphs: { ar: "الفقرات الفارغة", en: "empty paragraphs" },
  shapes: { ar: "الأشكال ومربعات النص", en: "shapes and text boxes" },
};

function Summary({ ar, ai, imported, exact }: { ar: boolean; ai: DocxExtraction | null; imported: DocxImport | null; exact: boolean }) {
  const missing = ai?.missing ?? [];
  const c = imported?.summary.counts;
  const parts = c
    ? [
        [c.heading, ar ? "عنوان" : "heading(s)"],
        [c.paragraph, ar ? "فقرة" : "paragraph(s)"],
        [c.list, ar ? "قائمة" : "list(s)"],
        [c.table, ar ? "جدول" : "table(s)"],
        [c.image, ar ? "صورة" : "image(s)"],
        [c.pageBreak, ar ? "فاصل صفحة" : "page break(s)"],
      ].filter(([n]) => Number(n) > 0).map(([n, label]) => `${n} ${label}`)
    : [];
  // In exact mode nothing is dropped: the Word engine renders the file as-is.
  const dropped = exact ? [] : (imported?.summary.dropped ?? []).map((k) => (ar ? DROPPED_LABELS[k].ar : DROPPED_LABELS[k].en));

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, background: "color-mix(in oklab, var(--primary) 6%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800 }}>
        <ListChecks size={14} style={{ color: "var(--primary)" }} />
        {ar ? "ملخّص الاستيراد" : "Import summary"}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        {(ar ? "المحتوى المنقول: " : "Content carried over: ") + (parts.length > 0 ? parts.join(ar ? "، " : ", ") : (ar ? "لا شيء" : "nothing"))}
      </div>
      {dropped.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {(ar ? "تم إسقاطه (القالب هو المرجع): " : "Dropped (the template owns these): ") + dropped.join(ar ? "، " : ", ")}
        </div>
      )}
      {missing.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {(ar ? "لم يتم العثور عليه في الملف: " : "Not found in the file: ") + missing.join("، ")}
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
            {ar ? "من الملف" : "From file"}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

/* ── Exact preview pane ───────────────────────────────────────── */

const STEP_LABELS: Record<NonNullable<ExactState["step"]>, { ar: string; en: string }> = {
  layout: { ar: "جارٍ تجهيز الهيدر والفوتر…", en: "Preparing the header and footer…" },
  word: { ar: "محرّك Word يرسم الملف كما هو…", en: "The Word engine is laying out the file…" },
  letterhead: { ar: "جارٍ إضافة الهيدر والفوتر والرقم…", en: "Adding the header, footer and number…" },
};

function ExactNotice({ ar, tone, children, onRetry }: { ar: boolean; tone: "error" | "warn"; children: React.ReactNode; onRetry?: () => void }) {
  const color = tone === "error" ? "#F0676A" : "#F5B301";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", fontSize: 12, borderBottom: "1px solid var(--border)", background: `${color}14`, color: "var(--foreground)" }}>
      <AlertTriangle size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onRetry && (
        <button type="button" className="btn-ghost" onClick={onRetry} style={{ minHeight: 30, padding: "4px 10px", flexShrink: 0 }}>
          <RefreshCw size={13} /> {ar ? "إعادة المحاولة" : "Retry"}
        </button>
      )}
    </div>
  );
}

function ExactPreview({ ar, exact, onRefresh }: { ar: boolean; exact: ExactState; onRefresh: () => void }) {
  return (
    <div style={{ borderInlineStart: "1px solid var(--border)", background: "var(--surface-2, var(--background))", display: "flex", flexDirection: "column", height: "72vh", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", marginInlineEnd: "auto" }}>
          {ar ? "المعاينة الدقيقة — كما سيظهر ملف PDF" : "Exact preview — as the PDF will look"}
          {exact.pages > 0 && ` · ${ar ? `${exact.pages} صفحة` : `${exact.pages} page${exact.pages === 1 ? "" : "s"}`}`}
        </div>
        <button type="button" className="btn-ghost" onClick={onRefresh} disabled={exact.busy} style={{ minHeight: 30, padding: "4px 10px" }}>
          {exact.busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {ar ? "تحديث" : "Refresh"}
        </button>
      </div>
      {exact.warnings.map((w) => <ExactNotice key={w} ar={ar} tone="warn">{w}</ExactNotice>)}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {exact.url && (
          <iframe
            title={ar ? "معاينة PDF" : "PDF preview"}
            src={`${exact.url}#view=FitH`}
            style={{ width: "100%", height: "100%", border: 0, display: "block", opacity: exact.busy ? 0.4 : 1 }}
          />
        )}
        {exact.busy && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--muted-foreground)" }}>
            <Loader2 size={24} className="spin" style={{ color: "var(--primary)" }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
              {exact.step ? (ar ? STEP_LABELS[exact.step].ar : STEP_LABELS[exact.step].en) : (ar ? "جارٍ التحضير…" : "Preparing…")}
            </div>
          </div>
        )}
      </div>
    </div>
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
