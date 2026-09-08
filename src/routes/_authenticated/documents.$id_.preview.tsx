// Fast path: a read-only branded A4 preview of an imported Word document with
// a one-click PDF download. No editor, no toolbars — just the final pages.

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Loader2, PenLine } from "lucide-react";

import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireMaster } from "@/lib/route-guards";
import { docTemplates } from "@/lib/docs/api";
import { businessDocs, type BusinessDoc } from "@/lib/docs/docs-api";
import { docTypeLabel, type DocTemplate } from "@/lib/docs/types";
import { PaginatedDoc } from "@/components/documents/PaginatedDoc";
import { exportDocPdf } from "@/lib/docs/export-doc";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/documents/$id_/preview")({
  ssr: false,
  beforeLoad: requireMaster,
  component: DocumentPreviewPage,
  head: () => ({
    meta: [
      { title: "Document Preview · Mechatro" },
      { name: "description", content: "Preview an imported Word document on the official A4 letterhead and download it as PDF." },
      { property: "og:title", content: "Document Preview · Mechatro" },
      { property: "og:description", content: "Branded A4 preview with header, footer and page numbers, ready to download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DocumentPreviewPage() {
  const { id } = useParams({ from: "/_authenticated/documents/$id_/preview" });
  const { lang, isMasterAdmin, user } = useApp();
  const ar = lang === "ar";

  const [doc, setDoc] = useState<BusinessDoc | null>(null);
  const [tpl, setTpl] = useState<DocTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isMasterAdmin) return;
    let alive = true;
    setLoading(true);
    businessDocs
      .get(id)
      .then(async (d) => {
        const t = await docTemplates.ensure(d.doc_type);
        if (!alive) return;
        setDoc(d);
        setTpl(t);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, isMasterAdmin]);

  const meta = useMemo(() => {
    if (!doc) return undefined;
    const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);
    const client = doc.lang === "ar" ? doc.client.nameAr || doc.client.nameEn : doc.client.nameEn || doc.client.nameAr;
    return { number: doc.number, date: fmt(doc.issue_date) ?? "—", validUntil: fmt(doc.valid_until), client: client || undefined };
  }, [doc]);

  if (!isMasterAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>{ar ? "متاح فقط لمدير النظام الرئيسي" : "Master admin only"}</div>;
  }
  if (loading || !doc || !tpl) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>;
  }

  const header = doc.header_override ?? tpl.header;
  const footer = doc.footer_override ?? tpl.footer;

  const download = async () => {
    try {
      setExporting(true);
      await exportDocPdf({
        docId: doc.id,
        docType: doc.doc_type,
        number: doc.number,
        header,
        footer,
        model: doc.model,
        client: doc.client,
        lang: doc.lang,
        theme: doc.theme,
        currency: doc.currency,
        meta: { number: doc.number, date: meta?.date ?? "—", validUntil: meta?.validUntil, client: meta?.client },
        title: `${docTypeLabel(doc.doc_type, doc.lang)} ${doc.number}`,
      });
      void logActivity(user?.id ?? null, "file_added", "business_doc", doc.id, {
        number: doc.number, doc_type: doc.doc_type, format: "pdf", theme: doc.theme, lang: doc.lang,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

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
        subtitle={
          ar
            ? `معاينة نهائية على الورق الرسمي — ${pageCount} صفحة. الهيدر والفوتر وأرقام الصفحات تُضاف تلقائياً على كل صفحة.`
            : `Final preview on the official letterhead — ${pageCount} page${pageCount === 1 ? "" : "s"}. Header, footer and page numbers repeat automatically.`
        }
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to="/documents" className="btn-ghost" style={{ textDecoration: "none" }}>
              <ArrowLeft size={15} /> {ar ? "القائمة" : "All documents"}
            </Link>
            <Link to="/documents/$id" params={{ id: doc.id }} className="btn-ghost" style={{ textDecoration: "none" }}>
              <PenLine size={15} /> {ar ? "فتح في المحرر" : "Open in editor"}
            </Link>
            <button className="btn-primary" onClick={download} disabled={exporting}>
              {exporting ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />}
              {ar ? "تنزيل PDF" : "Download PDF"}
            </button>
          </div>
        }
      />

      <div
        style={{
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
          padding: "clamp(10px, 2vw, 20px)", overflow: "auto",
        }}
      >
        <Scaler>
          <PaginatedDoc
            gap={16}
            onPages={setPageCount}
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
        </Scaler>
      </div>
    </div>
  );
}

/** Scales the 794px-wide A4 stack down to the available width. */
function Scaler({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [inner, setInner] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);

  useEffect(() => {
    if (!inner) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(1123, inner.scrollHeight)));
    ro.observe(inner);
    setHeight(Math.max(1123, inner.scrollHeight));
    return () => ro.disconnect();
  }, [inner]);

  const scale = width > 0 ? Math.min(1, width / 794) : 1;
  return (
    <div ref={setEl} style={{ direction: "ltr", width: "100%", height: height * scale }}>
      <div ref={setInner} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
