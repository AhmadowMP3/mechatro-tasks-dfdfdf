import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, Sun, Moon, GitBranch, FileDown, Eye, X, ChevronDown, FileUp, FileCheck2 } from "lucide-react";

import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireMaster } from "@/lib/route-guards";
import { docTemplates } from "@/lib/docs/api";
import { businessDocs, DOC_STATUS_LABELS, type BusinessDoc } from "@/lib/docs/docs-api";
import { docTypeLabel, type DocLang, type DocStatus, type DocTemplate, type DocTheme } from "@/lib/docs/types";
import type { DocClient, DocModel } from "@/lib/docs/model";
import { PaginatedDoc } from "@/components/documents/PaginatedDoc";
import { A4_SIZE } from "@/lib/docs/geometry";
import { DocEditor } from "@/components/documents/editor/DocEditor";
import { EditorBoundary } from "@/components/documents/editor/EditorBoundary";
import { ImportDocxDialog } from "@/components/documents/ImportDocxDialog";
import { ExactDocView } from "@/components/documents/ExactDocView";
import { downloadExactPdf, exactErrorMessage } from "@/lib/docs/word-exact/exact-pdf";
import { blocksToHtml, htmlToDocModel, needsConversion, needsModelConversion } from "@/lib/docs/convert-legacy";
import { exportDocPdf } from "@/lib/docs/export-doc";
import type { DocPageModel } from "@/lib/docs/page-model-cache";

import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  ssr: false,
  beforeLoad: requireMaster,
  component: DocumentEditorPage,
  head: () => ({
    meta: [
      { title: "Document Editor · Mechatro" },
      { name: "description", content: "Edit branded business documents with live A4 preview, item tables and automatic totals." },
      { property: "og:title", content: "Document Editor · Mechatro" },
      { property: "og:description", content: "Compose quotations, offers and invoices with a live A4 preview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DocumentEditorPage() {
  const { id } = useParams({ from: "/_authenticated/documents/$id" });
  const { lang, isMasterAdmin, user } = useApp();
  const ar = lang === "ar";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [pageModel, setPageModel] = useState<DocPageModel | null>(null);


  const [doc, setDoc] = useState<BusinessDoc | null>(null);
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isMasterAdmin) return;
    let alive = true;
    setLoading(true);
    businessDocs
      .get(id)
      .then(async (d) => {
        const t = await docTemplates.ensure(d.doc_type);
        if (!alive) return;
        // Legacy documents are converted once, on open: old blocks become the
        // Word-style body, and the body becomes the canonical doc model that
        // lives on `model.blocks`. `model.html` stays populated so older
        // readers and the share view keep working during the migration.
        const html = needsConversion(d.model)
          ? blocksToHtml(d.model, { lang: d.lang, theme: d.theme, currency: d.currency, meta: { number: d.number } })
          : d.model.html;
        if (needsModelConversion(d.model) || html !== d.model.html) {
          const converted = htmlToDocModel(html);
          setDoc({ ...d, model: { ...d.model, version: 2, html, blocks: converted.blocks } });
          setDirty(true);
        } else {
          setDoc(d);
          setDirty(false);
        }
        setTpl(t);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, isMasterAdmin]);

  const patch = (p: Partial<BusinessDoc>) => { setDoc((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  const patchClient = (p: Partial<DocClient>) => { setDoc((d) => (d ? { ...d, client: { ...d.client, ...p } } : d)); setDirty(true); };
  const patchModel = (p: Partial<DocModel>) => { setDoc((d) => (d ? { ...d, model: { ...d.model, ...p } } : d)); setDirty(true); };

  const save = async () => {
    if (!doc) return;
    try {
      setSaving(true);
      const saved = await businessDocs.save(doc);
      setDoc(saved);
      setDirty(false);
      void logActivity(user?.id ?? null, "updated", "business_doc", saved.id, { number: saved.number, doc_type: saved.doc_type });
      toast.success(ar ? "تم الحفظ" : "Saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  // Ctrl/Cmd+S saves, and leaving with unsaved edits asks for confirmation.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);


  const bumpRevision = async () => {
    if (!doc) return;
    try {
      setSaving(true);
      const saved = await businessDocs.save(doc);
      const bumped = await businessDocs.newRevision(saved);
      setDoc(bumped);
      setDirty(false);
      toast.success(ar ? `نسخة جديدة: ${bumped.number}` : `New revision: ${bumped.number}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const [exporting, setExporting] = useState<null | "pdf">(null);

  const meta = useMemo(() => {
    if (!doc) return undefined;
    const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);
    const client = doc.lang === "ar" ? doc.client.nameAr || doc.client.nameEn : doc.client.nameEn || doc.client.nameAr;
    return { number: doc.number, date: fmt(doc.issue_date) ?? "—", validUntil: fmt(doc.valid_until), client: client || undefined };
  }, [doc]);

  const logPdf = (d: BusinessDoc) =>
    void logActivity(user?.id ?? null, "file_added", "business_doc", d.id, {
      number: d.number, doc_type: d.doc_type, format: "pdf", theme: d.theme, lang: d.lang,
    });

  const exportAs = async (kind: "pdf") => {
    if (!doc || !tpl) return;
    try {
      setExporting(kind);
      if (doc.model.wordImport?.active) {
        await downloadExactPdf(doc, doc.header_override ?? tpl.header, doc.footer_override ?? tpl.footer);
        logPdf(doc);
        return;
      }
      const input = {
        docId: doc.id,
        docType: doc.doc_type,
        number: doc.number,
        header: doc.header_override ?? tpl.header,
        footer: doc.footer_override ?? tpl.footer,
        model: doc.model,
        client: doc.client,
        lang: doc.lang,
        theme: doc.theme,
        currency: doc.currency,
        meta: {
          number: doc.number,
          date: meta?.date ?? "—",
          validUntil: meta?.validUntil,
          client: meta?.client,
        },
        title: `${docTypeLabel(doc.doc_type, doc.lang)} ${doc.number}`,
        pageModel,

      };
      await exportDocPdf(input);
      logPdf(doc);
    } catch (e) { toast.error(exactErrorMessage(e, ar)); }
    finally { setExporting(null); }
  };

  if (!isMasterAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>{ar ? "متاح فقط لمدير النظام الرئيسي" : "Master admin only"}</div>;
  }
  if (loading || !doc || !tpl) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>;
  }

  const header = doc.header_override ?? tpl.header;
  const footer = doc.footer_override ?? tpl.footer;

  const wordImport = doc.model.wordImport;
  const exactMode = !!wordImport?.active;

  const statusPill = (
    <span
      style={{
        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
        color: dirty ? "#F5B301" : "var(--muted-foreground)",
        border: `1px solid ${dirty ? "#F5B30155" : "var(--border)"}`,
        background: dirty ? "#F5B30118" : "transparent",
      }}
    >
      {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : dirty ? (ar ? "تغييرات غير محفوظة" : "Unsaved changes") : (ar ? "محفوظ" : "Saved")}
    </span>
  );
  const importButton = (
    <button className="btn-ghost" onClick={() => setImporting(true)}>
      <FileUp size={15} /> {ar ? "استيراد من Word" : "Import from Word"}
    </button>
  );
  const saveButton = (
    <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
      {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} {ar ? "حفظ" : "Save"}
    </button>
  );

  const ribbonActions = (
    <>
      {statusPill}
      {importButton}
      {wordImport && !exactMode && (
        <button
          className="btn-ghost"
          title={wordImport.fileName}
          onClick={() => patch({ theme: "light", model: { ...doc.model, wordImport: { ...wordImport, active: true } } })}
        >
          <FileCheck2 size={15} /> {ar ? "تنسيق Word الدقيق" : "Exact Word layout"}
        </button>
      )}
      <button className="btn-ghost" onClick={() => setPreviewOpen(true)}>
        <Eye size={15} /> {ar ? "معاينة" : "Preview"}
      </button>

      <button className="btn-ghost" onClick={() => exportAs("pdf")} disabled={!!exporting}>
        {exporting === "pdf" ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />} PDF
      </button>
      {saveButton}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ background: "var(--grad-gold)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {docTypeLabel(doc.doc_type, ar ? "ar" : "en")}
            </span>
            <span style={{ fontSize: 13, color: "var(--muted-foreground)", direction: "ltr" }}>{doc.number}</span>
          </span>
        }
        subtitle={ar ? "اكتب داخل الورقة نفسها — الهيدر والفوتر مطبوعان كما سيظهران في PDF." : "Type inside the sheet itself — the letterhead and footer print exactly as shown."}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to="/documents" className="btn-ghost" style={{ textDecoration: "none" }}>
              <ArrowLeft size={15} /> {ar ? "القائمة" : "All documents"}
            </Link>
            <button className="btn-ghost" onClick={bumpRevision} disabled={saving}>
              <GitBranch size={15} /> {ar ? "نسخة جديدة" : "New revision"}
            </button>
          </div>
        }
      />

      {/* ── Collapsible settings strips above the sheet ─────────── */}
      <Accordion title={ar ? "بيانات المستند" : "Document settings"}>
        <Row>
          <Text
            label={ar ? "عنوان داخلي (للقائمة فقط)" : "Internal title (list only)"}
            value={doc.title}
            onChange={(v) => patch({ title: v })}
          />
          <Pick
            label={ar ? "الحالة" : "Status"}
            value={doc.status}
            options={(Object.keys(DOC_STATUS_LABELS) as DocStatus[]).map((s) => ({ v: s, l: ar ? DOC_STATUS_LABELS[s].ar : DOC_STATUS_LABELS[s].en }))}
            onChange={(v) => patch({ status: v as DocStatus })}
          />
          <Text label={ar ? "العملة" : "Currency"} value={doc.currency} onChange={(v) => patch({ currency: v.toUpperCase() })} />
        </Row>
        <Row>
          <Text label={ar ? "تاريخ الإصدار" : "Issue date"} type="date" value={doc.issue_date} onChange={(v) => patch({ issue_date: v })} />
          <Text label={ar ? "صالح حتى" : "Valid until"} type="date" value={doc.valid_until ?? ""} onChange={(v) => patch({ valid_until: v || null })} />
          <Pick
            label={ar ? "لغة المستند" : "Document language"}
            value={doc.lang}
            options={[{ v: "ar", l: "العربية" }, { v: "en", l: "English" }]}
            onChange={(v) => patch({ lang: v as DocLang })}
          />
        </Row>
        <Row>
          <Pick
            label={ar ? "الوضع" : "Theme"}
            value={doc.theme}
            options={[{ v: "light", l: ar ? "فاتح" : "Light" }, { v: "dark", l: ar ? "غامق" : "Dark" }]}
            onChange={(v) => patch({ theme: v as DocTheme })}
          />
          <Toggle label={ar ? "إظهار صندوق العميل" : "Show client box"} value={doc.model.showClientBox} onChange={(v) => patchModel({ showClientBox: v })} />
        </Row>
        <Row>
          <Text
            label={ar ? "عنوان الورقة (عربي)" : "Paper title (AR)"}
            value={header.titleAr}
            onChange={(v) => patch({ header_override: { ...header, titleAr: v } })}
          />
          <Text
            label={ar ? "عنوان الورقة (إنجليزي)" : "Paper title (EN)"}
            value={header.titleEn}
            onChange={(v) => patch({ header_override: { ...header, titleEn: v } })}
          />
        </Row>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
            {ar
              ? "عنوان الورقة هو الظاهر أعلى المستند. العنوان الداخلي يُستخدم في قائمة المستندات فقط."
              : "The paper title shows on the document. The internal title is only used in the documents list."}
          </span>
          {doc.header_override && (
            <button type="button" className="btn-ghost" onClick={() => patch({ header_override: null })}>
              {ar ? "إرجاع عنوان القالب" : "Reset to template"}
            </button>
          )}
        </div>
      </Accordion>

      <Accordion title={ar ? "العميل / الجهة" : "Client / party"}>
        <Row>
          <Text label={ar ? "الاسم (عربي)" : "Name (AR)"} value={doc.client.nameAr} onChange={(v) => patchClient({ nameAr: v })} />
          <Text label={ar ? "الاسم (إنجليزي)" : "Name (EN)"} value={doc.client.nameEn} onChange={(v) => patchClient({ nameEn: v })} />
        </Row>
        <Row>
          <Text label={ar ? "جهة الاتصال" : "Attn"} value={doc.client.attn} onChange={(v) => patchClient({ attn: v })} />
          <Text label={ar ? "الهاتف" : "Phone"} value={doc.client.phone} onChange={(v) => patchClient({ phone: v })} />
          <Text label={ar ? "الإيميل" : "Email"} value={doc.client.email} onChange={(v) => patchClient({ email: v })} />
        </Row>
        <Row>
          <Text label={ar ? "العنوان" : "Address"} value={doc.client.address} onChange={(v) => patchClient({ address: v })} />
          <Text label={ar ? "الرقم الضريبي" : "Tax number"} value={doc.client.taxNumber} onChange={(v) => patchClient({ taxNumber: v })} />
        </Row>
        <Row>
          <Text label={ar ? "المرجع (عربي)" : "Reference (AR)"} value={doc.client.refAr} onChange={(v) => patchClient({ refAr: v })} />
          <Text label={ar ? "المرجع (إنجليزي)" : "Reference (EN)"} value={doc.client.refEn} onChange={(v) => patchClient({ refEn: v })} />
        </Row>
      </Accordion>

      {/* ── Exact Word layout: the Word engine's render, letterhead on top ── */}
      {exactMode && wordImport && (
        <ExactDocView
          ar={ar}
          doc={doc}
          header={header}
          footer={footer}
          actions={<>{statusPill}{importButton}{saveButton}</>}
          onOpenEditor={() => patchModel({ wordImport: { ...wordImport, active: false } })}
          onDownloaded={() => logPdf(doc)}
        />
      )}

      {/* ── The sheet: type straight inside the letterhead ──────── */}
      {!exactMode && <EditorBoundary ar={ar}>
        <DocEditor
          html={doc.model.html ?? ""}
          onChange={(html) => patchModel({ html, version: 2 })}
          lang={doc.lang}
          theme={doc.theme}
          currency={doc.currency}
          meta={meta ?? {}}
          showClientBox={doc.model.showClientBox}
          client={doc.client}
          header={header}
          footer={footer}
          section={doc.model.section}
          logoVariant={doc.model.logoVariant ?? "auto"}
          onLogoVariant={(v) => patchModel({ logoVariant: v })}
          onLang={(v) => patch({ lang: v })}
          onTheme={(v) => patch({ theme: v })}
          terms={{ ar: tpl.defaults.termsAr ?? "", en: tpl.defaults.termsEn ?? "" }}
          actions={ribbonActions}
          onPageModel={setPageModel}

        />
      </EditorBoundary>}

      {/* ── Import a Word file into this document ──────────────── */}
      {importing && (
        <ImportDocxDialog
          ar={ar}
          mode="apply"
          number={doc.number}
          onClose={() => setImporting(false)}
          onApply={(p) => {
            setImporting(false);
            setDoc((d) =>
              d
                ? {
                    ...d,
                    title: p.title || d.title,
                    lang: p.lang,
                    theme: p.wordImport.active ? "light" : d.theme,
                    currency: p.currency || d.currency,
                    issue_date: p.issueDate || d.issue_date,
                    valid_until: p.validUntil || d.valid_until,
                    client: p.client,
                    model: {
                      ...d.model,
                      version: 2,
                      html: p.html,
                      showClientBox: p.showClientBox,
                      ...(p.blocks ? { blocks: p.blocks } : {}),
                      wordImport: p.wordImport,
                    },
                  }
                : d,
            );
            setDirty(true);
            toast.success(ar ? "تم استيراد الملف — لا تنسَ الحفظ" : "File imported — remember to save");
          }}
        />
      )}

      {/* ── Paginated preview (optional) ────────────────────────── */}
      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 90, background: "rgba(3,8,15,0.72)",
            display: "flex", flexDirection: "column", padding: "clamp(8px, 2vw, 24px)", gap: 12, overflow: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(100%, 900px)", marginInline: "auto", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#E7EEF6" }}>
                {ar ? "معاينة A4" : "A4 preview"} · {ar ? `${pageCount} صفحة` : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
              </span>
              <div style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
                <MiniToggle active={doc.theme === "light"} onClick={() => patch({ theme: "light" })} label={<Sun size={14} />} />
                <MiniToggle active={doc.theme === "dark"} onClick={() => patch({ theme: "dark" })} label={<Moon size={14} />} />
                <MiniToggle active={doc.lang === "ar"} onClick={() => patch({ lang: "ar" })} label="AR" />
                <MiniToggle active={doc.lang === "en"} onClick={() => patch({ lang: "en" })} label="EN" />
                <button type="button" className="btn-ghost" onClick={() => setPreviewOpen(false)}>
                  <X size={15} /> {ar ? "إغلاق" : "Close"}
                </button>
              </div>
            </div>
            <PaperPreview>
              <PaginatedDoc
                labels
                onPages={setPageCount}
                pageModel={pageModel}

                input={{
                  header,
                  footer,
                  model: doc.model,
                  client: doc.client,
                  lang: doc.lang,
                  theme: doc.theme,
                  currency: doc.currency,
                  meta,
                }}
              />
            </PaperPreview>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Collapsible settings strip ───────────────────────────────── */

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
          background: "transparent", border: 0, color: "var(--foreground)", cursor: "pointer",
          fontSize: 14, fontWeight: 700, textAlign: "start",
        }}
      >
        <ChevronDown size={16} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
        {title}
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}


/* ── Preview scaler ───────────────────────────────────────────── */

function PaperPreview({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(0);
  const [paperHeight, setPaperHeight] = useState(A4_SIZE.height);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [inner, setInner] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);

  // The paper grows past one A4 page as content is added — track its real
  // height so the scaled wrapper never clips the bottom of the document.
  useEffect(() => {
    if (!inner) return;
    const ro = new ResizeObserver(() => setPaperHeight(Math.max(A4_SIZE.height, inner.scrollHeight)));
    ro.observe(inner);
    setPaperHeight(Math.max(A4_SIZE.height, inner.scrollHeight));
    return () => ro.disconnect();
  }, [inner]);

  const scale = width > 0 ? Math.min(1, width / 794) : 1;
  return (
    // direction: ltr keeps the scaled sheet anchored to the same edge as the
    // transform origin — in RTL the absolute box otherwise resolves from the
    // right and the paper gets clipped.
    <div ref={setEl} style={{ width: "100%", overflow: "hidden", direction: "ltr" }}>
      <div style={{ height: paperHeight * scale, position: "relative" }}>
        <div
          ref={setInner}
          style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: 794 }}
        >
          {children}
        </div>
      </div>
    </div>
  );

}

/* ── Form primitives ──────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))" }}>{children}</div>;
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, color: "var(--muted-foreground)", marginBottom: 4, display: "block" };
const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 13,
};

function Text({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input type={type} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <textarea style={{ ...inputStyle, minHeight: 68, resize: "vertical" }} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="number" style={{ ...inputStyle, direction: "ltr" }} value={value} min={min} max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      />
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
      <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: `1px solid ${value ? "var(--primary)" : "var(--border)"}`, background: value ? "var(--primary)" : "transparent" }} />
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
        minWidth: 42, minHeight: 36, padding: "6px 10px", borderRadius: 9, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 600,
        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        background: active ? "color-mix(in oklab, var(--primary) 16%, transparent)" : "var(--card)",
        color: active ? "var(--primary)" : "var(--foreground)",
      }}
    >
      {label}
    </button>
  );
}
function IconBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36, height: 36, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: "1px solid var(--border)", background: "var(--background)",
        color: danger ? "#EF4444" : "var(--foreground)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
