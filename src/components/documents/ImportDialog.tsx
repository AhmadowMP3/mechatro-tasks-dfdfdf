// Import a Word (.docx) or PDF file into Business Documents.
//
//   1. Pick a file. It is not analysed: nothing is read out of it, nothing is
//      cut from it, and its pages keep their size and margins.
//   2. The admin fills in the number, the client and the other details, and
//      sees the PDF: the file's pages with the Mechatro header, footer, client
//      box, QR and signature on top.
//   3. Approve. The original file is stored and the PDF is rendered from it.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, FileText, FileType2, Loader2, RefreshCw, Upload, X } from "lucide-react";

import { docTemplates } from "@/lib/docs/api";
import { businessDocs, type BusinessDoc } from "@/lib/docs/docs-api";
import { MAX_IMPORT_BYTES, readImportFile } from "@/lib/docs/import/analyze";
import { defaultModel, emptyClient, type DocClient, type ImportKind, type WordImport } from "@/lib/docs/model";
import { DOC_TYPES, docTypeLabel, type DocFooter, type DocHeader, type DocLang, type DocTemplate, type DocType } from "@/lib/docs/types";
import {
  buildExactForImport, coveredPagesText, exactErrorMessage, uploadImportSource,
  type ExactPdfCache, type ExactStep,
} from "@/lib/docs/word-exact/exact-pdf";
import { makeQrDataUrl } from "@/lib/share/public-share";
import { CURRENCIES, currencyLabel } from "@/lib/currency";

type Stage = "pick" | "working" | "review" | "saving";

type Draft = {
  docType: DocType;
  number: string;
  title: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  lang: DocLang;
  client: DocClient;
  showClientBox: boolean;
};

type ImportedFile = { kind: ImportKind; fileName: string; bytes: Uint8Array };

type ExactState = { busy: boolean; step: ExactStep | null; url: string | null; pages: number; warnings: string[]; error: string | null };
const EXACT_IDLE: ExactState = { busy: false, step: null, url: null, pages: 0, warnings: [], error: null };

/** Payload handed back to an open document ("apply" mode). */
export type ImportApplyPayload = {
  html: string;
  number: string;
  title: string;
  lang: DocLang;
  currency: string;
  issueDate: string;
  validUntil: string;
  client: DocClient;
  showClientBox: boolean;
  /** The stored original file. */
  wordImport: WordImport;
};

/** Imported documents have no body of their own: the original file is the content. */
const EMPTY_BODY = "<p><br/></p>";

const today = () => new Date().toISOString().slice(0, 10);

export function ImportDialog({ ar, onClose, onCreated, mode: dialogMode = "create", onApply, initial }: {
  ar: boolean;
  onClose: () => void;
  onCreated?: (doc: BusinessDoc) => void;
  /** "create" makes a new document; "apply" replaces the open document's content. */
  mode?: "create" | "apply";
  onApply?: (payload: ImportApplyPayload) => void;
  /** The open document's details (apply mode). */
  initial?: Partial<Draft> & { header?: DocHeader; footer?: DocFooter };
}) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<ImportedFile | null>(null);
  const [fit, setFit] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [qrSample, setQrSample] = useState<string | undefined>(undefined);
  const [exact, setExact] = useState<ExactState>(EXACT_IDLE);
  const [exactRun, setExactRun] = useState(0);
  const exactCache = useRef<ExactPdfCache>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = stage === "working" || stage === "saving";

  // Reload the template whenever the type is changed.
  useEffect(() => {
    if (!draft) return;
    let alive = true;
    docTemplates.ensure(draft.docType)
      .then((tp) => { if (alive) setTpl(tp); })
      .catch((e) => toast.error((e as Error).message));
    return () => { alive = false; };
  }, [draft?.docType]); // eslint-disable-line react-hooks/exhaustive-deps

  // The preview shows the QR where the PDF will have it; the document's own
  // link only exists once the document does.
  useEffect(() => {
    let alive = true;
    void makeQrDataUrl(window.location.origin).then((q) => { if (alive) setQrSample(q); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const reset = () => {
    setStage("pick");
    setFile(null);
    setDraft(null);
    exactCache.current = {};
    setExact((s) => { if (s.url) URL.revokeObjectURL(s.url); return EXACT_IDLE; });
  };

  const handleFile = async (picked: File) => {
    if (picked.size > MAX_IMPORT_BYTES) {
      toast.error(t("الحد الأقصى لحجم الملف 10 ميغابايت", "The maximum file size is 10 MB"));
      return;
    }
    reset();
    setFileName(picked.name);
    setStage("working");
    try {
      const res = await readImportFile(picked);
      const type = initial?.docType ?? "invoice";
      const template = await docTemplates.ensure(type);
      setTpl(template);
      setDraft({
        docType: type,
        number: initial?.number ?? "",
        title: initial?.title ?? "",
        issueDate: initial?.issueDate ?? today(),
        validUntil: initial?.validUntil ?? "",
        currency: initial?.currency ?? template.defaults.currency,
        lang: initial?.lang ?? template.defaults.lang,
        client: initial?.client ?? emptyClient(),
        showClientBox: initial?.showClientBox ?? true,
      });
      setFit(false);
      setFile(res);
      setStage("review");
    } catch (e) {
      toast.error(exactErrorMessage(e, ar));
      setStage("pick");
    }
  };

  /* ── letterhead ────────────────────────────────────────────── */

  const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);
  const clientName = draft ? (draft.lang === "ar" ? draft.client.nameAr || draft.client.nameEn : draft.client.nameEn || draft.client.nameAr) : "";
  const meta = draft
    ? {
        number: draft.number.trim() || "—",
        date: fmtDate(draft.issueDate) ?? "—",
        validUntil: fmtDate(draft.validUntil),
        // The client box already names the client; the meta box doesn't repeat it.
        client: draft.showClientBox ? undefined : clientName || undefined,
      }
    : null;
  const header = initial?.header ?? tpl?.header;
  const footer = initial?.footer ?? tpl?.footer;
  const previewClient = draft?.showClientBox ? draft.client : undefined;
  const previewKey = JSON.stringify([meta, draft?.lang, previewClient, header, footer, fit, !!qrSample]);

  // Preview: rebuilt (debounced) when a letterhead field changes; the file's
  // pages themselves are reused.
  useEffect(() => {
    if (stage !== "review" || !file || !draft || !header || !footer || !meta) return;
    let alive = true;
    const timer = setTimeout(() => {
      setExact((s) => ({ ...s, busy: true, error: null }));
      buildExactForImport(
        file.bytes,
        { kind: file.kind, fitToBands: fit },
        { header, footer, lang: draft.lang, meta, ...(previewClient ? { client: previewClient } : {}) },
        { cache: exactCache.current, qrDataUrl: qrSample, onStep: (step) => { if (alive) setExact((s) => ({ ...s, step })); } },
      )
        .then((res) => {
          if (!alive) return;
          const url = URL.createObjectURL(new Blob([new Uint8Array(res.pdf)], { type: "application/pdf" }));
          const warnings: string[] = [];
          if (res.coveredPages?.length) warnings.push(coveredPagesText(res.coveredPages, ar));
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
  }, [stage, previewKey, exactRun]);

  // Free the preview blob when the dialog goes away.
  const urlRef = useRef<string | null>(null);
  urlRef.current = exact.url;
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const numberMissing = !draft?.number.trim();
  const canApprove = !!exact.url && !exact.busy && !exact.error && !numberMissing;

  /* ── approve ───────────────────────────────────────────────── */

  const approve = async () => {
    if (!draft || !file || !canApprove) return;
    try {
      setStage("saving");
      const type = file.kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const sourcePath = await uploadImportSource(new Blob([new Uint8Array(file.bytes)], { type }), file.kind);
      const wordImport: WordImport = { sourcePath, fileName: file.fileName, active: true, kind: file.kind, fitToBands: fit };

      if (dialogMode === "apply") {
        onApply?.({
          html: EMPTY_BODY, number: draft.number.trim(), title: draft.title, lang: draft.lang, currency: draft.currency, issueDate: draft.issueDate,
          validUntil: draft.validUntil, client: draft.client, showClientBox: draft.showClientBox, wordImport,
        });
        return;
      }

      const created = await businessDocs.create(draft.docType, draft.number);
      const saved = await businessDocs.save({
        ...created,
        title: draft.title || created.title,
        client: draft.client,
        lang: draft.lang,
        // The imported page is white paper, so the letterhead stays light too.
        theme: "light",
        currency: draft.currency,
        issue_date: draft.issueDate || created.issue_date,
        valid_until: draft.validUntil || null,
        model: { ...defaultModel(), showClientBox: draft.showClientBox, html: EMPTY_BODY, wordImport },
      });
      toast.success(t(`تم إنشاء ${saved.number} من الملف المستورد`, `Created ${saved.number} from the imported file`));
      onCreated?.(saved);
    } catch (e) {
      toast.error(exactErrorMessage(e, ar));
      setStage("review");
    }
  };

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setClient = (p: Partial<DocClient>) => setDraft((d) => {
    if (!d) return d;
    // The first detail typed into an empty client ticks the box, so it reaches the PDF.
    const wasEmpty = !Object.values(d.client).some((v) => (v ?? "").trim());
    return { ...d, client: { ...d.client, ...p }, showClientBox: wasEmpty ? true : d.showClientBox };
  });

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
              {fileName || t("ارفع ملف .docx أو .pdf — يبقى كما هو ويُضاف إليه الهيدر والفوتر", "Upload a .docx or .pdf — it stays as it is, with the header and footer added")}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} disabled={busy} aria-label={t("إغلاق", "Close")} style={{ marginInlineStart: "auto", minHeight: 36, padding: "6px 10px" }}>
            <X size={15} />
          </button>
        </div>

        {stage === "pick" && <Picker ar={ar} inputRef={inputRef} onFile={(f) => void handleFile(f)} />}

        {(stage === "working" || stage === "saving") && (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted-foreground)" }}>
            <Loader2 size={26} className="spin" style={{ color: "var(--primary)" }} />
            <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 700, color: "var(--foreground)" }}>
              {stage === "working" ? t("جارٍ فتح الملف…", "Opening the file…")
                : dialogMode === "apply" ? t("جارٍ تطبيق الملف…", "Applying the file…") : t("جارٍ إنشاء المستند…", "Creating the document…")}
            </div>
          </div>
        )}

        {stage === "review" && file && draft && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))", alignItems: "stretch" }}>
            {/* Left: fields */}
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxHeight: "74vh", overflowY: "auto" }}>
              <FieldGroup title={t("المستند", "Document")}>
                {dialogMode === "create" && (
                  <Field label={t("نوع المستند", "Document type")}>
                    <select value={draft.docType} onChange={(e) => set({ docType: e.target.value as DocType })} style={inputStyle}>
                      {DOC_TYPES.map((d) => <option key={d.type} value={d.type}>{docTypeLabel(d.type, ar ? "ar" : "en")}</option>)}
                    </select>
                  </Field>
                )}
                <Field label={t("رقم المستند", "Document number")}>
                  <input
                    autoFocus
                    value={draft.number}
                    onChange={(e) => set({ number: e.target.value })}
                    style={{ ...inputStyle, ...(numberMissing ? { borderColor: "#F5B301" } : {}) }}
                    dir="ltr"
                    aria-required
                  />
                  {numberMissing && <span style={{ fontSize: 11, color: "#F5B301" }}>{t("أدخل رقم المستند قبل الاعتماد", "Enter the number before approving")}</span>}
                </Field>
                <Field label={t("العنوان الداخلي", "Internal title")}>
                  <input value={draft.title} onChange={(e) => set({ title: e.target.value })} style={inputStyle} />
                </Field>
                <Two>
                  <Field label={t("تاريخ الإصدار", "Issue date")}>
                    <input type="date" value={draft.issueDate} onChange={(e) => set({ issueDate: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("صالح حتى", "Valid until")}>
                    <input type="date" value={draft.validUntil} onChange={(e) => set({ validUntil: e.target.value })} style={inputStyle} />
                  </Field>
                </Two>
                <Two>
                  <Field label={t("العملة", "Currency")}>
                    <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })} style={inputStyle}>
                      {[...new Set([...CURRENCIES, draft.currency])].map((c) => (
                        <option key={c} value={c}>{currencyLabel(c as (typeof CURRENCIES)[number], ar ? "ar" : "en")}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("لغة المستند", "Document language")}>
                    <select value={draft.lang} onChange={(e) => set({ lang: e.target.value as DocLang })} style={inputStyle}>
                      <option value="ar">{t("عربي", "Arabic")}</option>
                      <option value="en">{t("إنجليزي", "English")}</option>
                    </select>
                  </Field>
                </Two>
              </FieldGroup>

              <FieldGroup title={t("العميل / الجهة", "Client / party")}>
                <Tick label={t("إظهار صندوق العميل في PDF", "Show the client box in the PDF")} checked={draft.showClientBox} onChange={(v) => set({ showClientBox: v })} />
                <Two>
                  <Field label={t("الاسم (عربي)", "Name (AR)")}>
                    <input value={draft.client.nameAr} onChange={(e) => setClient({ nameAr: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("الاسم (إنجليزي)", "Name (EN)")}>
                    <input value={draft.client.nameEn} onChange={(e) => setClient({ nameEn: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("جهة الاتصال", "Attn")}>
                    <input value={draft.client.attn} onChange={(e) => setClient({ attn: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label={t("الهاتف", "Phone")}>
                    <input value={draft.client.phone} onChange={(e) => setClient({ phone: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                  <Field label={t("الإيميل", "Email")}>
                    <input value={draft.client.email} onChange={(e) => setClient({ email: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                  <Field label={t("الرقم الضريبي", "Tax number")}>
                    <input value={draft.client.taxNumber} onChange={(e) => setClient({ taxNumber: e.target.value })} style={inputStyle} dir="ltr" />
                  </Field>
                </Two>
                <Field label={t("العنوان", "Address")}>
                  <input value={draft.client.address} onChange={(e) => setClient({ address: e.target.value })} style={inputStyle} />
                </Field>
              </FieldGroup>

              <FieldGroup title={t("التنسيق", "Layout")}>
                <Tick
                  label={t("تصغير المحتوى ليتّسع بين الهيدر والفوتر (يغيّر هوامش الملف)", "Shrink the content to fit between the header and footer (changes the file's margins)")}
                  checked={fit}
                  onChange={setFit}
                />
              </FieldGroup>
            </div>

            {/* Right: preview */}
            <ExactPreview ar={ar} exact={exact} onRefresh={() => setExactRun((n) => n + 1)} />
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
            <button className="btn-ghost" onClick={reset}>{t("ملف آخر", "Another file")}</button>
            <button className="btn-ghost" onClick={onClose}>{t("إلغاء", "Cancel")}</button>
            <button className="btn-primary" onClick={approve} disabled={!canApprove}>
              {exact.busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{" "}
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
          {t("ملفات .docx و .pdf حتى 10 ميغابايت. لا يُغيَّر شيء في الملف ولا في هوامشه: يوضع فوقه هيدر وفوتر ميكاترو والرمز والتوقيع فقط.",
             ".docx and .pdf files, up to 10 MB. Nothing in the file or its margins changes: only the Mechatro header, footer, QR and signature go on top.")}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-foreground)" }}>{label}</span>
      {children}
    </label>
  );
}

function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: 10, borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>{label}</span>
    </label>
  );
}

const STEP_LABELS: Record<ExactStep, { ar: string; en: string }> = {
  layout: { ar: "جارٍ تجهيز الهيدر والفوتر…", en: "Preparing the header and footer…" },
  word: { ar: "محرّك Word يرسم الملف كما هو…", en: "The Word engine is laying out the file…" },
  pages: { ar: "جارٍ تجهيز صفحات الملف…", en: "Preparing the file's pages…" },
  letterhead: { ar: "جارٍ إضافة الهيدر والفوتر والرمز والتوقيع…", en: "Adding the header, footer, QR and signature…" },
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
          {ar ? "المعاينة — كما سيظهر ملف PDF" : "Preview — as the PDF will look"}
          {exact.pages > 0 && ` · ${ar ? `${exact.pages} صفحة` : `${exact.pages} page${exact.pages === 1 ? "" : "s"}`}`}
        </div>
        <button type="button" className="btn-ghost" onClick={onRefresh} disabled={exact.busy} style={{ minHeight: 30, padding: "4px 10px" }}>
          {exact.busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {ar ? "تحديث" : "Refresh"}
        </button>
      </div>
      {exact.error && <Notice ar={ar} tone="error" onRetry={onRefresh}>{exact.error}</Notice>}
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
