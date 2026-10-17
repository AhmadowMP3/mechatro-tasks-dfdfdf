// Import a Word (.docx) or PDF file into Business Documents.
//
//   1. Pick a file — what it really is is detected from its bytes.
//   2. It is read (text layer, or OCR for scans), the original letterhead is
//      detected, and the document fields are extracted from the file itself.
//   3. Review: choose the exact layout (looks exactly like the original, with
//      the Mechatro letterhead) or an editable copy, trim the original
//      letterhead of a PDF, check the fields, then approve.
//
// The original file is always stored, so the other mode can be switched on
// from the document later.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCircle2, FileCheck2, FileText, FileType2, ListChecks, Loader2,
  Maximize2, PencilLine, RefreshCw, Scissors, ScanText, Upload, X, ZoomIn, ZoomOut,
} from "lucide-react";

import { docTemplates } from "@/lib/docs/api";
import { docFromBlocks, toHtml, type DocBlock } from "@/lib/docs/doc-model";
import { businessDocs, type BusinessDoc } from "@/lib/docs/docs-api";
import {
  analyzeFile, pdfLayout, MAX_IMPORT_BYTES,
  type ImportAnalysis, type ImportProgress, type ImportWarning, type PdfAnalysis,
} from "@/lib/docs/import/analyze";
import type { CropReason } from "@/lib/docs/import/crop-detect";
import { missingFields, type ImportItem } from "@/lib/docs/import/fields";
import { defaultModel, emptyClient, uid, type DocClient, type ImportCrop, type WordImport } from "@/lib/docs/model";
import { emptyItemsData, writeItemsAttr } from "@/lib/docs/rich";
import { DOC_TYPES, docTypeLabel, type DocLang, type DocTemplate, type DocType } from "@/lib/docs/types";
import {
  buildExactForImport, exactErrorMessage, uploadImportSource,
  type ExactPdfCache, type ExactStep,
} from "@/lib/docs/word-exact/exact-pdf";
import { sanitizeHtml } from "@/lib/security/sanitize";
import { CURRENCIES, currencyLabel } from "@/lib/currency";
import { PaginatedDoc } from "./PaginatedDoc";

type Mode = "exact" | "editable";
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

type ExactState = { busy: boolean; step: ExactStep | null; url: string | null; pages: number; warnings: string[]; error: string | null };
const EXACT_IDLE: ExactState = { busy: false, step: null, url: null, pages: 0, warnings: [], error: null };

/** Payload handed back to an open document ("apply" mode). */
export type ImportApplyPayload = {
  html: string;
  title: string;
  lang: DocLang;
  currency: string;
  issueDate: string;
  validUntil: string;
  client: DocClient;
  showClientBox: boolean;
  /** Canonical blocks of the editable copy (omitted when item rows are appended). */
  blocks?: DocBlock[];
  /** The stored original file; `active` when the exact layout is used. */
  wordImport: WordImport;
};

const today = () => new Date().toISOString().slice(0, 10);
const PT_TO_MM = 25.4 / 72;

export function ImportDialog({ ar, onClose, onCreated, mode: dialogMode = "create", onApply, number }: {
  ar: boolean;
  onClose: () => void;
  onCreated?: (doc: BusinessDoc) => void;
  /** "create" makes a new document; "apply" replaces the open document's content. */
  mode?: "create" | "apply";
  onApply?: (payload: ImportApplyPayload) => void;
  /** Number of the open document (apply mode); new documents get one on approve. */
  number?: string;
}) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState<ImportProgress[]>([]);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mode, setMode] = useState<Mode>("exact");
  const [crop, setCrop] = useState<ImportCrop>({ topPt: 0, bottomPt: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [fromFile, setFromFile] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ImportItem[]>([]);
  const [insertItems, setInsertItems] = useState(false);
  const [exact, setExact] = useState<ExactState>(EXACT_IDLE);
  const [exactRun, setExactRun] = useState(0);
  const exactCache = useRef<ExactPdfCache>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = stage === "working" || stage === "saving";

  // Reload the template whenever the detected type is changed.
  useEffect(() => {
    if (!draft) return;
    let alive = true;
    docTemplates.ensure(draft.docType)
      .then((tp) => { if (alive) setTpl(tp); })
      .catch((e) => toast.error((e as Error).message));
    return () => { alive = false; };
  }, [draft?.docType]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setStage("pick");
    setAnalysis(null);
    setDraft(null);
    setProgress([]);
    exactCache.current = {};
    setExact((s) => { if (s.url) URL.revokeObjectURL(s.url); return EXACT_IDLE; });
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error(t("الحد الأقصى لحجم الملف 10 ميغابايت", "The maximum file size is 10 MB"));
      return;
    }
    reset();
    setFileName(file.name);
    setStage("working");
    try {
      const res = await analyzeFile(file, (p) => setProgress((list) => [...list.filter((x) => x.step !== p.step), p]));
      const f = res.fields;
      const marked = new Set<string>();
      const mark = <T,>(key: string, v: T | null | undefined): T | undefined => { if (v) marked.add(key); return v ?? undefined; };
      const type = (mark("docType", f.docType) ?? "quotation") as DocType;
      const template = await docTemplates.ensure(type);
      setTpl(template);
      setDraft({
        docType: type,
        title: mark("title", f.title) ?? "",
        issueDate: mark("issueDate", f.issueDate) ?? today(),
        validUntil: mark("validUntil", f.validUntil) ?? "",
        currency: mark("currency", f.currency) ?? template.defaults.currency,
        lang: f.lang,
        client: {
          ...emptyClient(),
          nameAr: mark("nameAr", f.client.nameAr) ?? "",
          nameEn: mark("nameEn", f.client.nameEn) ?? "",
          attn: mark("attn", f.client.attn) ?? "",
          phone: mark("phone", f.client.phone) ?? "",
          email: mark("email", f.client.email) ?? "",
          address: mark("address", f.client.address) ?? "",
          taxNumber: mark("taxNumber", f.client.taxNumber) ?? "",
        },
      });
      setFromFile(marked);
      setItems(f.items);
      setInsertItems(false);
      if (res.kind === "pdf") setCrop({ topPt: res.crop.topPt, bottomPt: res.crop.bottomPt });
      // A scan without readable text can only be used as it is.
      setMode("exact");
      setAnalysis(res);
      setStage("review");
    } catch (e) {
      toast.error(exactErrorMessage(e, ar));
      setStage("pick");
    }
  };

  /* ── editable copy ─────────────────────────────────────────── */

  const editableBlocks: DocBlock[] = useMemo(() => {
    if (!analysis) return [];
    if (analysis.kind === "docx") return analysis.blocks;
    return pdfLayout(analysis, crop).blocks;
  }, [analysis, crop]);

  const itemsHtml = () => {
    const rows = items
      .filter((it) => it.descAr || it.descEn || it.qty != null || it.price != null)
      .map((it) => ({
        id: uid(), descAr: it.descAr ?? "", descEn: it.descEn ?? "", unitAr: it.unit ?? "", unitEn: it.unit ?? "",
        qty: it.qty ?? 0, price: it.price ?? 0, discount: 0,
      }));
    if (rows.length === 0) return "";
    return `<table data-items="${writeItemsAttr({ ...emptyItemsData(), rows })}"></table><p><br/></p>`;
  };

  const bodyHtml = () => {
    const base = sanitizeHtml(toHtml(docFromBlocks(editableBlocks)));
    return insertItems ? `${base}${itemsHtml()}` : base;
  };

  /* ── letterhead meta ───────────────────────────────────────── */

  const hasClient = useMemo(() => !!draft && Object.values(draft.client).some((v) => (v ?? "").trim().length > 0), [draft]);
  const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);
  const meta = draft
    ? {
        number: number || (draft.lang === "ar" ? "يُولَّد تلقائياً" : "Auto"),
        date: fmtDate(draft.issueDate) ?? "—",
        validUntil: fmtDate(draft.validUntil),
        client: (draft.lang === "ar" ? draft.client.nameAr || draft.client.nameEn : draft.client.nameEn || draft.client.nameAr) || undefined,
      }
    : null;
  const metaKey = JSON.stringify([meta, draft?.lang, tpl?.id, tpl?.updated_at, tpl?.header, tpl?.footer]);
  const cropKey = analysis?.kind === "pdf" ? `${crop.topPt}:${crop.bottomPt}` : "";

  // Exact preview: rebuilt (debounced) when a letterhead field or the crop
  // changes; the content render itself is reused while the bands stay put.
  useEffect(() => {
    if (stage !== "review" || mode !== "exact" || !analysis || !draft || !tpl || !meta) return;
    let alive = true;
    const timer = setTimeout(() => {
      setExact((s) => ({ ...s, busy: true, error: null }));
      buildExactForImport(
        analysis.bytes,
        analysis.kind === "pdf" ? { kind: "pdf", crop } : { kind: "docx" },
        { header: tpl.header, footer: tpl.footer, lang: draft.lang, meta },
        { cache: exactCache.current, onStep: (step) => { if (alive) setExact((s) => ({ ...s, step })); } },
      )
        .then((res) => {
          if (!alive) return;
          const url = URL.createObjectURL(new Blob([new Uint8Array(res.pdf)], { type: "application/pdf" }));
          const warnings: string[] = [];
          if (res.landscapeSections > 0) warnings.push(t("الصفحات الأفقية تظهر كاملة بدون هيدر وفوتر ميكاترو.", "Landscape pages are shown whole, without the Mechatro header and footer."));
          if (res.pageAnchoredShapes > 0) warnings.push(t("في الملف أشكال مثبّتة على الصفحة — تأكّد أنها لا تختفي تحت الهيدر أو الفوتر.", "The file has shapes pinned to the page — check none are hidden under the header or footer."));
          if (res.rasterised) warnings.push(t("ملف PDF محمي من النسخ، فوُضعت صفحاته كصور عالية الدقة.", "This PDF is copy-protected, so its pages were placed as high-resolution images."));
          setExact((s) => {
            if (s.url) URL.revokeObjectURL(s.url);
            return { busy: false, step: null, url, pages: res.pages, warnings, error: null };
          });
        })
        .catch((e) => { if (alive) setExact((s) => ({ ...s, busy: false, step: null, error: exactErrorMessage(e, ar) })); });
    }, 650);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, mode, metaKey, cropKey, exactRun]);

  // Free the preview blob when the dialog goes away.
  const urlRef = useRef<string | null>(null);
  urlRef.current = exact.url;
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const exactReady = !!exact.url && !exact.busy && !exact.error;

  /* ── approve ───────────────────────────────────────────────── */

  const approve = async () => {
    if (!draft || !analysis) return;
    const useExact = mode === "exact" && exactReady;
    try {
      setStage("saving");
      // The original file is always kept: the exact PDF is rendered from it,
      // and a document saved as editable can switch to the exact layout later.
      const type = analysis.kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const sourcePath = await uploadImportSource(new Blob([new Uint8Array(analysis.bytes)], { type }), analysis.kind);
      const wordImport: WordImport = {
        sourcePath,
        fileName: analysis.fileName,
        active: useExact,
        kind: analysis.kind,
        ...(analysis.kind === "pdf" ? { crop } : {}),
      };
      const html = bodyHtml();
      const blocks = insertItems ? undefined : editableBlocks;

      if (dialogMode === "apply") {
        onApply?.({
          html, title: draft.title, lang: draft.lang, currency: draft.currency, issueDate: draft.issueDate,
          validUntil: draft.validUntil, client: draft.client, showClientBox: hasClient,
          ...(blocks ? { blocks } : {}), wordImport,
        });
        return;
      }

      const created = await businessDocs.create(draft.docType);
      const saved = await businessDocs.save({
        ...created,
        title: draft.title || created.title,
        client: draft.client,
        lang: draft.lang,
        // The imported page is white paper, so the letterhead stays light too.
        theme: useExact ? "light" : created.theme,
        currency: draft.currency,
        issue_date: draft.issueDate || created.issue_date,
        valid_until: draft.validUntil || null,
        model: { ...defaultModel(), showClientBox: hasClient, html, ...(blocks ? { blocks } : {}), wordImport },
      });
      toast.success(t(`تم إنشاء ${saved.number} من الملف المستورد`, `Created ${saved.number} from the imported file`));
      onCreated?.(saved);
    } catch (e) {
      toast.error(exactErrorMessage(e, ar));
      setStage("review");
    }
  };

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setClient = (p: Partial<DocClient>) => setDraft((d) => (d ? { ...d, client: { ...d.client, ...p } } : d));

  const previewInput = draft && tpl && meta
    ? {
        header: tpl.header,
        footer: tpl.footer,
        model: { ...defaultModel(), showClientBox: hasClient, html: bodyHtml(), ...(insertItems ? {} : { blocks: editableBlocks }) },
        client: draft.client,
        lang: draft.lang,
        theme: tpl.defaults.theme,
        currency: draft.currency,
        meta,
      }
    : null;

  /* ── render ────────────────────────────────────────────────── */

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("استيراد مستند", "Import a document")}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,10,18,.62)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "clamp(8px, 3vw, 32px)", overflowY: "auto",
      }}
    >
      <div style={{ width: "min(1180px, 100%)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)", overflow: "hidden" }}>
        {/* Head */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <FileText size={17} style={{ color: "var(--primary)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{t("استيراد من Word أو PDF", "Import from Word or PDF")}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName || t("ارفع ملف .docx أو .pdf — تُستخرج البيانات من الملف نفسه", "Upload a .docx or .pdf — the fields are read from the file itself")}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} disabled={busy} aria-label={t("إغلاق", "Close")} style={{ marginInlineStart: "auto", minHeight: 36, padding: "6px 10px" }}>
            <X size={15} />
          </button>
        </div>

        {stage === "pick" && <Picker ar={ar} inputRef={inputRef} onFile={(f) => void handleFile(f)} />}

        {stage === "working" && <Working ar={ar} progress={progress} />}

        {stage === "saving" && (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted-foreground)" }}>
            <Loader2 size={26} className="spin" style={{ color: "var(--primary)" }} />
            <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 700, color: "var(--foreground)" }}>
              {dialogMode === "apply" ? t("جارٍ تطبيق الملف…", "Applying the file…") : t("جارٍ إنشاء المستند…", "Creating the document…")}
            </div>
          </div>
        )}

        {stage === "review" && analysis && draft && previewInput && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))", alignItems: "stretch" }}>
            {/* Left: mode, crop, fields */}
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxHeight: "74vh", overflowY: "auto" }}>
              <Summary ar={ar} analysis={analysis} missing={missingFields(analysis.fields)} />

              <ModePicker ar={ar} mode={mode} onChange={setMode} analysis={analysis} />

              {analysis.kind === "pdf" && (
                <CropPanel ar={ar} analysis={analysis} crop={crop} onChange={setCrop} />
              )}

              {mode === "editable" && items.length > 0 && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: 10, borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}>
                  <input type="checkbox" checked={insertItems} onChange={(e) => setInsertItems(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>
                    {t(`إضافة ${items.length} بند كجدول بنود ذكي (يحسب الإجماليات تلقائياً)`, `Add ${items.length} item row(s) as a smart items table (totals calculated automatically)`)}
                  </span>
                </label>
              )}

              <FieldGroup title={t("المستند", "Document")}>
                <Field label={t("نوع المستند", "Document type")} fromFile={fromFile.has("docType")} ar={ar}>
                  <select value={draft.docType} onChange={(e) => set({ docType: e.target.value as DocType })} style={inputStyle}>
                    {DOC_TYPES.map((d) => <option key={d.type} value={d.type}>{docTypeLabel(d.type, ar ? "ar" : "en")}</option>)}
                  </select>
                </Field>
                <Field label={t("العنوان", "Title")} fromFile={fromFile.has("title")} ar={ar}>
                  <input value={draft.title} onChange={(e) => set({ title: e.target.value })} style={inputStyle} />
                </Field>
                <Field label={t("رقم المستند", "Document number")} ar={ar}>
                  <input
                    value={number || t("يُولَّد تلقائياً عند الاعتماد", "Assigned automatically on approve")}
                    readOnly disabled style={{ ...inputStyle, opacity: 0.7 }} dir={number ? "ltr" : undefined}
                  />
                </Field>
                <Two>
                  <Field label={t("تاريخ الإصدار", "Issue date")} fromFile={fromFile.has("issueDate")} ar={ar}>
                    <input type="date" value={draft.issueDate} onChange={(e) => set({ issueDate: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("صالح حتى", "Valid until")} fromFile={fromFile.has("validUntil")} ar={ar}>
                    <input type="date" value={draft.validUntil} onChange={(e) => set({ validUntil: e.target.value })} style={inputStyle} />
                  </Field>
                </Two>
                <Two>
                  <Field label={t("العملة", "Currency")} fromFile={fromFile.has("currency")} ar={ar}>
                    <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })} style={inputStyle}>
                      {[...new Set([...CURRENCIES, draft.currency])].map((c) => (
                        <option key={c} value={c}>{currencyLabel(c as (typeof CURRENCIES)[number], ar ? "ar" : "en")}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("لغة المستند", "Document language")} ar={ar}>
                    <select value={draft.lang} onChange={(e) => set({ lang: e.target.value as DocLang })} style={inputStyle}>
                      <option value="ar">{t("عربي", "Arabic")}</option>
                      <option value="en">{t("إنجليزي", "English")}</option>
                    </select>
                  </Field>
                </Two>
              </FieldGroup>

              <FieldGroup title={t("العميل", "Client")}>
                <Two>
                  <Field label={t("الاسم (عربي)", "Name (AR)")} fromFile={fromFile.has("nameAr")} ar={ar}>
                    <input value={draft.client.nameAr} onChange={(e) => setClient({ nameAr: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("الاسم (إنجليزي)", "Name (EN)")} fromFile={fromFile.has("nameEn")} ar={ar}>
                    <input value={draft.client.nameEn} onChange={(e) => setClient({ nameEn: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("عناية", "Attn")} fromFile={fromFile.has("attn")} ar={ar}>
                    <input value={draft.client.attn} onChange={(e) => setClient({ attn: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("الهاتف", "Phone")} fromFile={fromFile.has("phone")} ar={ar}>
                    <input value={draft.client.phone} onChange={(e) => setClient({ phone: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                  <Field label={t("الإيميل", "Email")} fromFile={fromFile.has("email")} ar={ar}>
                    <input value={draft.client.email} onChange={(e) => setClient({ email: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                  <Field label={t("الرقم الضريبي", "Tax number")} fromFile={fromFile.has("taxNumber")} ar={ar}>
                    <input value={draft.client.taxNumber} onChange={(e) => setClient({ taxNumber: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                </Two>
                <Field label={t("العنوان", "Address")} fromFile={fromFile.has("address")} ar={ar}>
                  <input value={draft.client.address} onChange={(e) => setClient({ address: e.target.value })} style={inputStyle} />
                </Field>
              </FieldGroup>
            </div>

            {/* Right: preview */}
            {mode === "exact" ? (
              exact.error ? (
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, borderInlineStart: "1px solid var(--border)" }}>
                  <Notice tone="error" ar={ar} onRetry={() => setExactRun((n) => n + 1)}>
                    {exact.error}{" "}
                    {t("المعاينة أدناه هي النسخة القابلة للتعديل. يمكنك الاعتماد الآن — يُحفظ الملف الأصلي لتفعيل التنسيق الدقيق لاحقاً.",
                       "Below is the editable copy. You can approve now — the original file is kept so the exact layout can be switched on later.")}
                  </Notice>
                  <ZoomablePreview ar={ar}><PaginatedDoc input={previewInput} gap={14} /></ZoomablePreview>
                </div>
              ) : (
                <ExactPreview ar={ar} exact={exact} onRefresh={() => setExactRun((n) => n + 1)} />
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, borderInlineStart: "1px solid var(--border)" }}>
                {analysis.kind === "pdf" && (
                  <Notice tone="info" ar={ar}>
                    {analysis.scanned
                      ? t("النص مقروء آلياً من صفحات ممسوحة — راجع الأسماء والأرقام قبل الإرسال.", "The text was recognised from scanned pages — check names and numbers before sending.")
                      : t("أعيد بناء الفقرات والجداول من ملف PDF — راجع التنسيق بعد الفتح في المحرر.", "Paragraphs and tables were rebuilt from the PDF — review the layout once it opens in the editor.")}
                  </Notice>
                )}
                <ZoomablePreview ar={ar}><PaginatedDoc input={previewInput} gap={14} /></ZoomablePreview>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        {stage === "review" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: 14, borderTop: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center" }}>
            {dialogMode === "apply" && (
              <span style={{ marginInlineEnd: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#F5B301" }}>
                <AlertTriangle size={14} /> {t("سيُستبدل محتوى الورقة الحالي", "The current sheet content will be replaced")}
              </span>
            )}
            {mode === "exact" && exact.error && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                {t("سيُحفظ كنسخة قابلة للتعديل", "Will be saved as the editable copy")}
              </span>
            )}
            <button className="btn-ghost" onClick={reset}>{t("ملف آخر", "Another file")}</button>
            <button className="btn-ghost" onClick={onClose}>{t("إلغاء", "Cancel")}</button>
            <button className="btn-primary" onClick={approve} disabled={mode === "exact" && exact.busy}>
              {mode === "exact" && exact.busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{" "}
              {dialogMode === "apply" ? t("تطبيق على هذا المستند", "Apply to this document") : t("اعتماد وإنشاء المستند", "Approve & create document")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Picker ───────────────────────────────────────────────────── */

function Picker({ ar, inputRef, onFile }: { ar: boolean; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File) => void }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [over, setOver] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${over ? "var(--primary)" : "var(--border)"}`, borderRadius: 16, padding: "40px 20px", textAlign: "center",
          cursor: "pointer", transition: "border-color .15s, background .15s",
          background: over ? "color-mix(in oklab, var(--primary) 10%, transparent)" : "color-mix(in oklab, var(--primary) 4%, transparent)",
        }}
      >
        <div style={{ display: "inline-flex", gap: 14, color: "var(--primary)" }}>
          <FileType2 size={30} />
          <Upload size={30} />
          <FileText size={30} style={{ color: "#E8732E" }} />
        </div>
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 800 }}>
          {t("اسحب ملف Word أو PDF هنا، أو اضغط للاختيار", "Drop a Word or PDF file here, or click to choose")}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-foreground)", maxWidth: 620, marginInline: "auto", lineHeight: 1.6 }}>
          {t("ملفات .docx و .pdf (بما فيها الصفحات الممسوحة ضوئياً) حتى 10 ميغابايت. يُستبدل هيدر وفوتر الملف الأصلي بهيدر وفوتر ميكاترو ورقم المستند.",
             ".docx and .pdf files (scanned pages included), up to 10 MB. The file's own header and footer are replaced by the Mechatro letterhead and document number.")}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }}
      />
    </div>
  );
}

/* ── Working (step list) ──────────────────────────────────────── */

function Working({ ar, progress }: { ar: boolean; progress: ImportProgress[] }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const seen = new Set(progress.map((p) => p.step));
  const last = progress[progress.length - 1]?.step;
  const get = <K extends ImportProgress["step"]>(k: K) => progress.find((p) => p.step === k) as Extract<ImportProgress, { step: K }> | undefined;
  const pages = get("pages");
  const ocr = get("ocr");
  const ocrLoad = get("ocr-load");

  const steps: { key: string; label: string; show: boolean; done: boolean; active: boolean }[] = [
    { key: "read", label: t("قراءة الملف", "Reading the file"), show: true, done: seen.size > 1, active: last === "read" },
    {
      key: "pages",
      label: pages ? t(`قراءة الصفحات (${pages.current} من ${pages.total})`, `Reading pages (${pages.current} of ${pages.total})`) : t("قراءة المحتوى", "Reading the content"),
      show: true, done: seen.has("ocr") || seen.has("ocr-load") || seen.has("letterhead") || seen.has("fields"), active: last === "pages",
    },
    {
      key: "ocr",
      label: ocr
        ? t(`التعرّف على نص الصفحات الممسوحة (${ocr.current} من ${ocr.total})`, `Recognising text on scanned pages (${ocr.current} of ${ocr.total})`)
        : ocrLoad ? t(`تحميل محرّك قراءة النصوص… ${Math.round(ocrLoad.progress * 100)}%`, `Loading the text recognition engine… ${Math.round(ocrLoad.progress * 100)}%`) : "",
      show: seen.has("ocr") || seen.has("ocr-load"), done: seen.has("letterhead") || seen.has("fields"), active: last === "ocr" || last === "ocr-load",
    },
    { key: "letterhead", label: t("تحديد هيدر وفوتر الملف الأصلي", "Finding the original header and footer"), show: seen.has("letterhead"), done: seen.has("fields"), active: last === "letterhead" },
    { key: "fields", label: t("استخراج بيانات المستند", "Extracting the document fields"), show: true, done: false, active: last === "fields" },
  ];

  return (
    <div style={{ padding: "40px 24px", display: "flex", justifyContent: "center" }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12, minWidth: "min(100%, 420px)" }} aria-live="polite">
        {steps.filter((s) => s.show).map((s) => (
          <li key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: s.active ? 800 : 600, color: s.done || s.active ? "var(--foreground)" : "var(--muted-foreground)" }}>
            {s.done ? <CheckCircle2 size={18} style={{ color: "#4E9A33", flexShrink: 0 }} />
              : s.active ? <Loader2 size={18} className="spin" style={{ color: "var(--primary)", flexShrink: 0 }} />
              : <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--border)", flexShrink: 0 }} />}
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Summary ──────────────────────────────────────────────────── */

const WARNING_TEXT: Record<ImportWarning, { ar: string; en: string }> = {
  docx_images_skipped: {
    ar: "بعض الصور بصيغة قديمة (EMF/WMF) لا تظهر في النسخة القابلة للتعديل — التنسيق الدقيق يحتفظ بها.",
    en: "Some images use an old format (EMF/WMF) the editable copy can't show — the exact layout keeps them.",
  },
  pdf_scanned: { ar: "صفحات ممسوحة ضوئياً: قُرئ النص آلياً.", en: "Scanned pages: the text was recognised automatically." },
  pdf_ocr_partial: { ar: "قُرئ نص أول 12 صفحة فقط؛ بقية الصفحات موجودة في التنسيق الدقيق.", en: "Text was recognised on the first 12 pages only; all pages are in the exact layout." },
  pdf_ocr_failed: { ar: "تعذّرت قراءة نص الصفحات الممسوحة — التنسيق الدقيق متاح.", en: "The scanned pages' text couldn't be read — the exact layout is available." },
  pdf_arabic_repaired: { ar: "صُحّحت حروف (لا) العربية المقلوبة في نص ملف PDF.", en: "Reversed Arabic lam-alef letters in the PDF text were repaired." },
  pdf_no_text: { ar: "لا يحتوي الملف على نص قابل للقراءة — استخدم التنسيق الدقيق.", en: "The file has no readable text — use the exact layout." },
};

const MISSING_LABEL: Record<string, { ar: string; en: string }> = {
  number: { ar: "رقم المستند", en: "document number" },
  issueDate: { ar: "التاريخ", en: "date" },
  client: { ar: "العميل", en: "client" },
};

function Summary({ ar, analysis, missing }: { ar: boolean; analysis: ImportAnalysis; missing: string[] }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const parts: string[] = [];
  if (analysis.kind === "docx") {
    const c = analysis.counts;
    if (c.paragraph + c.heading) parts.push(t(`${c.paragraph + c.heading} فقرة`, `${c.paragraph + c.heading} paragraph(s)`));
    if (c.list) parts.push(t(`${c.list} قائمة`, `${c.list} list(s)`));
    if (c.table) parts.push(t(`${c.table} جدول`, `${c.table} table(s)`));
    if (c.image) parts.push(t(`${c.image} صورة`, `${c.image} image(s)`));
  } else {
    parts.push(t(`${analysis.pageCount} صفحة`, `${analysis.pageCount} page(s)`));
    if (analysis.scanned) parts.push(t("ممسوح ضوئياً", "scanned"));
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, background: "color-mix(in oklab, var(--primary) 6%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800 }}>
        {analysis.kind === "pdf" && analysis.scanned ? <ScanText size={14} style={{ color: "var(--primary)" }} /> : <ListChecks size={14} style={{ color: "var(--primary)" }} />}
        {analysis.kind === "pdf" ? t("ملف PDF", "PDF file") : t("ملف Word", "Word file")}
        <span style={{ fontWeight: 600, color: "var(--muted-foreground)" }}>· {parts.join(ar ? "، " : ", ")}</span>
      </div>
      {analysis.warnings.map((w) => (
        <div key={w} style={{ fontSize: 12, color: "var(--muted-foreground)" }}>• {ar ? WARNING_TEXT[w].ar : WARNING_TEXT[w].en}</div>
      ))}
      {missing.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {t("لم يُعثر عليه في الملف: ", "Not found in the file: ")}
          {missing.map((k) => (ar ? MISSING_LABEL[k]?.ar : MISSING_LABEL[k]?.en) ?? k).join(ar ? "، " : ", ")}
        </div>
      )}
    </div>
  );
}

/* ── Mode picker ──────────────────────────────────────────────── */

function ModePicker({ ar, mode, onChange, analysis }: { ar: boolean; mode: Mode; onChange: (m: Mode) => void; analysis: ImportAnalysis }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const noText = analysis.kind === "pdf" && analysis.warnings.some((w) => w === "pdf_no_text" || w === "pdf_ocr_failed");
  const card = (m: Mode, icon: React.ReactNode, title: string, body: string, disabled = false) => (
    <button
      type="button"
      onClick={() => !disabled && onChange(m)}
      disabled={disabled}
      aria-pressed={mode === m}
      style={{
        flex: "1 1 180px", textAlign: "start", display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 12, minHeight: 92,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, color: "var(--foreground)",
        border: `1.5px solid ${mode === m ? "var(--primary)" : "var(--border)"}`,
        background: mode === m ? "color-mix(in oklab, var(--primary) 12%, transparent)" : "var(--background)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
        {icon} {title}
        {mode === m && <Check size={14} style={{ marginInlineStart: "auto", color: "var(--primary)" }} />}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{body}</span>
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {card("exact", <FileCheck2 size={16} style={{ color: "var(--primary)" }} />, t("التنسيق الدقيق", "Exact layout"),
        t("مطابق للملف الأصلي تماماً مع هيدر وفوتر ميكاترو. للتعديل: عدّل الملف وأعد استيراده.", "Exactly like the original, with the Mechatro letterhead. To change it, edit the file and import it again."))}
      {card("editable", <PencilLine size={16} style={{ color: "#E8732E" }} />, t("قابل للتعديل", "Editable"),
        noText ? t("غير متاح: لا يوجد نص مقروء في الملف.", "Not available: the file has no readable text.")
               : t("النصوص والجداول قابلة للتعديل داخل التطبيق. قريب جداً من الأصل.", "Text and tables can be edited in the app. Very close to the original."),
        noText)}
    </div>
  );
}

/* ── Crop panel (PDF) ─────────────────────────────────────────── */

const REASON_TEXT: Record<CropReason, { ar: string; en: string }> = {
  repeats: { ar: "مكرر في كل الصفحات", en: "repeats on every page" },
  letterhead: { ar: "يشبه هيدر/فوتر شركة", en: "looks like a letterhead" },
};

function CropPanel({ ar, analysis, crop, onChange }: { ar: boolean; analysis: PdfAnalysis; crop: ImportCrop; onChange: (c: ImportCrop) => void }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [thumb, setThumb] = useState<string | null>(null);
  const pageH = analysis.pages[0]?.height ?? 842;
  const max = Math.round(pageH * 0.4);

  // A small render of page 1 with the cut bands shaded on top.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { openPdf, closePdf, renderPage } = await import("@/lib/docs/import/pdf-read");
      const doc = await openPdf(analysis.bytes);
      try {
        const canvas = await renderPage(doc, 1, 0.42);
        if (alive) setThumb(canvas.toDataURL("image/jpeg", 0.85));
        canvas.width = canvas.height = 0;
      } finally {
        await closePdf(doc);
      }
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [analysis.bytes]);

  const slider = (label: string, value: number, reason: CropReason | null, onValue: (v: number) => void) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
        {label}
        <span style={{ marginInlineStart: "auto", fontVariantNumeric: "tabular-nums", color: "var(--muted-foreground)" }} dir="ltr">
          {Math.round(value * PT_TO_MM)} mm
        </span>
      </span>
      <input type="range" min={0} max={max} step={1} value={Math.min(value, max)} onChange={(e) => onValue(Number(e.target.value))} />
      {reason && value > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--primary)", fontWeight: 700 }}>{t("اكتُشف تلقائياً", "Detected automatically")} · {ar ? REASON_TEXT[reason].ar : REASON_TEXT[reason].en}</span>
      )}
    </label>
  );

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ position: "relative", width: 96, flexShrink: 0, aspectRatio: "210 / 297", borderRadius: 6, overflow: "hidden", background: "#fff", border: "1px solid var(--border)" }}>
        {thumb ? <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          : <Loader2 size={16} className="spin" style={{ position: "absolute", inset: 0, margin: "auto", color: "var(--primary)" }} />}
        <div style={{ position: "absolute", insetInline: 0, top: 0, height: `${(crop.topPt / pageH) * 100}%`, background: "rgba(240,103,106,.45)", borderBottom: crop.topPt ? "1.5px dashed #F0676A" : 0 }} />
        <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: `${(crop.bottomPt / pageH) * 100}%`, background: "rgba(240,103,106,.45)", borderTop: crop.bottomPt ? "1.5px dashed #F0676A" : 0 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800 }}>
          <Scissors size={14} style={{ color: "#F0676A" }} />
          {t("إزالة هيدر وفوتر الملف الأصلي", "Remove the original header and footer")}
        </div>
        {slider(t("من الأعلى", "From the top"), crop.topPt, analysis.crop.topReason, (v) => onChange({ ...crop, topPt: v }))}
        {slider(t("من الأسفل", "From the bottom"), crop.bottomPt, analysis.crop.bottomReason, (v) => onChange({ ...crop, bottomPt: v }))}
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          {t("المنطقة الحمراء تُحذف من كل الصفحات، ويوضع هيدر وفوتر ميكاترو مكانها.", "The red area is removed from every page and replaced by the Mechatro letterhead.")}
        </span>
      </div>
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 13,
};

function Two({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 10 }}>{children}</div>;
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".04em" }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, fromFile, ar }: { label: string; children: React.ReactNode; fromFile?: boolean; ar: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {fromFile && (
          <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "color-mix(in oklab, var(--primary) 18%, transparent)", color: "var(--primary)" }}>
            {ar ? "من الملف" : "From file"}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const STEP_LABELS: Record<ExactStep, { ar: string; en: string }> = {
  layout: { ar: "جارٍ تجهيز الهيدر والفوتر…", en: "Preparing the header and footer…" },
  word: { ar: "محرّك Word يرسم الملف كما هو…", en: "The Word engine is laying out the file…" },
  pages: { ar: "جارٍ وضع صفحات الملف بين الهيدر والفوتر…", en: "Placing the pages between the header and footer…" },
  letterhead: { ar: "جارٍ إضافة الهيدر والفوتر والرقم…", en: "Adding the header, footer and number…" },
};

function Notice({ ar, tone, children, onRetry }: { ar: boolean; tone: "error" | "warn" | "info"; children: React.ReactNode; onRetry?: () => void }) {
  const color = tone === "error" ? "#F0676A" : tone === "warn" ? "#F5B301" : "#189FD1";
  return (
    <div role={tone === "error" ? "alert" : undefined} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", fontSize: 12, borderBottom: "1px solid var(--border)", background: `${color}14`, color: "var(--foreground)" }}>
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
    <div style={{ borderInlineStart: "1px solid var(--border)", background: "var(--surface-2, var(--background))", display: "flex", flexDirection: "column", height: "74vh", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", marginInlineEnd: "auto" }}>
          {ar ? "المعاينة الدقيقة — كما سيظهر ملف PDF" : "Exact preview — as the PDF will look"}
          {exact.pages > 0 && ` · ${ar ? `${exact.pages} صفحة` : `${exact.pages} page${exact.pages === 1 ? "" : "s"}`}`}
        </div>
        <button type="button" className="btn-ghost" onClick={onRefresh} disabled={exact.busy} style={{ minHeight: 30, padding: "4px 10px" }}>
          {exact.busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {ar ? "تحديث" : "Refresh"}
        </button>
      </div>
      {exact.warnings.map((w) => <Notice key={w} ar={ar} tone="warn">{w}</Notice>)}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {exact.url && (
          <iframe title={ar ? "معاينة PDF" : "PDF preview"} src={`${exact.url}#view=FitH`} style={{ width: "100%", height: "100%", border: 0, display: "block", opacity: exact.busy ? 0.4 : 1 }} />
        )}
        {exact.busy && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Loader2 size={24} className="spin" style={{ color: "var(--primary)" }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>
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
const clampZoom = (z: number) => Math.min(2, Math.max(0.25, z));

function ZoomablePreview({ ar, children }: { ar: boolean; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [contentH, setContentH] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentH(el.getBoundingClientRect().height / zoomRef.current);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomAt = (next: number, px: number, py: number) => {
    const box = scrollRef.current;
    const prev = zoomRef.current;
    const z = clampZoom(next);
    if (!box || z === prev) return;
    const k = z / prev;
    const left = box.scrollLeft, top = box.scrollTop;
    setZoom(z);
    requestAnimationFrame(() => { box.scrollLeft = (left + px) * k - px; box.scrollTop = (top + py) * k - py; });
  };

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
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
    if (box) zoomAt(zoomRef.current * factor, box.clientWidth / 2, box.clientHeight / 2);
  };
  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8,
    border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ background: "var(--surface-2, var(--background))", display: "flex", flexDirection: "column", maxHeight: "74vh", minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", marginInlineEnd: "auto" }}>
          {ar ? "المعاينة على القالب الرسمي" : "Preview on the official template"}
        </div>
        <button type="button" style={btn} onClick={() => step(1 / 1.2)} aria-label={ar ? "تصغير" : "Zoom out"}><ZoomOut size={14} /></button>
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button type="button" style={btn} onClick={() => step(1.2)} aria-label={ar ? "تكبير" : "Zoom in"}><ZoomIn size={14} /></button>
        <button type="button" style={btn} onClick={() => setZoom(FIT_ZOOM)} aria-label={ar ? "ملائمة العرض" : "Fit width"}><Maximize2 size={14} /></button>
      </div>
      <div ref={scrollRef} style={{ overflow: "auto", padding: 16, flex: 1 }}>
        <div style={{ width: PAGE_W * zoom, height: contentH * zoom, marginInlineStart: ar ? "auto" : 0 }}>
          <div ref={contentRef} style={{ transform: `scale(${zoom})`, transformOrigin: ar ? "top right" : "top left", width: PAGE_W }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
