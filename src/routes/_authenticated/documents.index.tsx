import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, Search, Copy, Trash2, Loader2, FileDown } from "lucide-react";

import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireMaster } from "@/lib/route-guards";
import { docTemplates } from "@/lib/docs/api";
import { exportDocPdf } from "@/lib/docs/export-doc";
import { businessDocs, DOC_STATUS_LABELS, type BusinessDoc } from "@/lib/docs/docs-api";
import { DOC_TYPES, docTypeLabel, type DocType } from "@/lib/docs/types";

export const Route = createFileRoute("/_authenticated/documents/")({
  ssr: false,
  beforeLoad: requireMaster,
  component: DocumentsListPage,
  head: () => ({
    meta: [
      { title: "Business Documents · Mechatro" },
      { name: "description", content: "Create and manage quotations, RFQs, offers, invoices, proforma invoices and purchase orders." },
      { property: "og:title", content: "Business Documents · Mechatro" },
      { property: "og:description", content: "Branded quotations, RFQs, offers and invoices with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DocumentsListPage() {
  const { lang, isMasterAdmin } = useApp();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const [rows, setRows] = useState<BusinessDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<DocType | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    businessDocs
      .list({ type })
      .then(setRows)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isMasterAdmin) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, isMasterAdmin]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((d) =>
      [d.number, d.title, d.client.nameAr, d.client.nameEn].some((s) => (s ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const create = async (t: DocType) => {
    try {
      setBusy(true);
      const doc = await businessDocs.create(t);
      toast.success(ar ? `تم إنشاء ${doc.number}` : `Created ${doc.number}`);
      navigate({ to: "/documents/$id", params: { id: doc.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (doc: BusinessDoc) => {
    try {
      setBusy(true);
      const copy = await businessDocs.duplicate(doc);
      toast.success(ar ? `نسخة جديدة: ${copy.number}` : `Duplicated as ${copy.number}`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportDoc = async (doc: BusinessDoc) => {
    try {
      setBusy(true);
      const tpl = await docTemplates.ensure(doc.doc_type);
      const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-GB") : undefined);
      const clientName = doc.lang === "ar" ? doc.client.nameAr || doc.client.nameEn : doc.client.nameEn || doc.client.nameAr;
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
        meta: { number: doc.number, date: fmt(doc.issue_date) ?? "—", validUntil: fmt(doc.valid_until), client: clientName || undefined },
        title: `${docTypeLabel(doc.doc_type, doc.lang)} ${doc.number}`,
      };
      await exportDocPdf(input);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: BusinessDoc) => {
    if (!window.confirm(ar ? `حذف المستند ${doc.number}؟` : `Delete ${doc.number}?`)) return;
    try {
      setBusy(true);
      await businessDocs.remove(doc.id);
      setRows((r) => r.filter((x) => x.id !== doc.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isMasterAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
        {ar ? "متاح فقط لمدير النظام الرئيسي" : "Master admin only"}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader
        title={
          <span style={{ background: "var(--grad-gold)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {ar ? "المستندات التجارية" : "Business Documents"}
          </span>
        }
        subtitle={
          ar
            ? "عروض السعر وطلبات العرض والعروض الفنية والفواتير والفواتير المبدئية وأوامر الشراء — بنفس هوية البراند."
            : "Quotations, RFQs, offers, invoices, proforma invoices and purchase orders — all on brand."
        }
      />

      {/* Create buttons */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{ar ? "إنشاء مستند جديد" : "Create a new document"}</div>
          <button className="btn-primary" disabled={busy} onClick={() => setImporting(true)} style={{ marginInlineStart: "auto", minHeight: 40 }}>
            <FileUp size={15} />
            {ar ? "استيراد من Word" : "Import from Word"}
          </button>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
          {DOC_TYPES.map((d) => (
            <button key={d.type} className="btn-ghost" disabled={busy} onClick={() => create(d.type)} style={{ justifyContent: "flex-start", minHeight: 44 }}>
              {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {docTypeLabel(d.type, ar ? "ar" : "en")}
              </span>
              <span style={{ opacity: 0.55, fontSize: 11, marginInlineStart: "auto" }}>{d.prefix}</span>
            </button>
          ))}
        </div>
      </div>

      {importing && (
        <ImportDocxDialog
          ar={ar}
          onClose={() => setImporting(false)}
          onCreated={(doc) => {
            setImporting(false);
            navigate({ to: "/documents/$id", params: { id: doc.id } });
          }}
        />
      )}


      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, flex: 1, minWidth: 0 }}>
          <Chip active={type === "all"} onClick={() => setType("all")} label={ar ? "الكل" : "All"} />
          {DOC_TYPES.map((d) => (
            <Chip key={d.type} active={type === d.type} onClick={() => setType(d.type)} label={docTypeLabel(d.type, ar ? "ar" : "en")} />
          ))}
        </div>
        <label style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 200 }}>
          <Search size={15} style={{ position: "absolute", insetInlineStart: 10, opacity: 0.5 }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ar ? "ابحث برقم المستند أو العميل" : "Search number or client"}
            style={{
              width: "100%", minHeight: 42, padding: "8px 12px", paddingInlineStart: 32, borderRadius: 10,
              border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 13,
            }}
          />
        </label>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", border: "1px dashed var(--border)", borderRadius: 14 }}>
          <FileText size={22} style={{ opacity: 0.5 }} />
          <div style={{ marginTop: 8, fontSize: 13 }}>{ar ? "لا يوجد مستندات بعد." : "No documents yet."}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
          {filtered.map((d) => {
            const st = DOC_STATUS_LABELS[d.status];
            const client = ar ? d.client.nameAr || d.client.nameEn : d.client.nameEn || d.client.nameAr;
            return (
              <div key={d.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{docTypeLabel(d.doc_type, ar ? "ar" : "en")}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, color: st.color, border: `1px solid ${st.color}55`, background: `${st.color}18` }}>
                    {ar ? st.ar : st.en}
                  </span>
                </div>
                <Link to="/documents/$id" params={{ id: d.id }} style={{ fontSize: 13.5, fontWeight: 700, direction: "ltr", textDecoration: "none", color: "var(--foreground)", wordBreak: "break-all" }}>
                  {d.number}
                </Link>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", minHeight: 18 }}>{client || (ar ? "بدون عميل" : "No client")}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", direction: "ltr" }}>
                  {d.issue_date}{d.valid_until ? ` → ${d.valid_until}` : ""} · {d.currency}
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    marginTop: 6,
                    gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
                    alignItems: "stretch",
                  }}
                >
                  <Link
                    to="/documents/$id"
                    params={{ id: d.id }}
                    className="btn-primary"
                    style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", minWidth: 0 }}
                  >
                    {ar ? "تحرير" : "Edit"}
                  </Link>
                  <button className="btn-ghost" disabled={busy} onClick={() => duplicate(d)} style={{ minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", minWidth: 0 }}>
                    <Copy size={14} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ar ? "تكرار" : "Duplicate"}</span>
                  </button>
                  <button className="btn-ghost" disabled={busy} onClick={() => exportDoc(d)} style={{ minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", minWidth: 0 }} title="PDF">
                    <FileDown size={14} style={{ flexShrink: 0 }} /> PDF
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => remove(d)}
                    style={{ minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", color: "#EF4444", minWidth: 0 }}
                    title={ar ? "حذف" : "Delete"}
                  >
                    <Trash2 size={14} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ar ? "حذف" : "Delete"}</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: "nowrap", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 600, minHeight: 40,
        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        background: active ? "color-mix(in oklab, var(--primary) 16%, transparent)" : "var(--card)",
        color: active ? "var(--primary)" : "var(--foreground)",
      }}
    >
      {label}
    </button>
  );
}
