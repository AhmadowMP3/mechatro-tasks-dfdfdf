import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Sun, Moon, GitBranch, FileDown, FileType2 } from "lucide-react";

import { useApp } from "@/lib/app-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireMaster } from "@/lib/route-guards";
import { docTemplates } from "@/lib/docs/api";
import { businessDocs, DOC_STATUS_LABELS, type BusinessDoc } from "@/lib/docs/docs-api";
import { docTypeLabel, type DocLang, type DocStatus, type DocTemplate, type DocTheme } from "@/lib/docs/types";
import {
  BLOCK_LABELS, emptyItemRow, newBlock, uid,
  type BlockKind, type DocBlock, type DocClient, type DocModel, type ItemsBlock,
} from "@/lib/docs/model";
import { PaginatedDoc } from "@/components/documents/PaginatedDoc";
import { exportDocPdf, exportDocWord } from "@/lib/docs/export-doc";
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
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"edit" | "preview">("edit");

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
        setDoc(d);
        setTpl(t);
        setDirty(false);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, isMasterAdmin]);

  const patch = (p: Partial<BusinessDoc>) => { setDoc((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  const patchClient = (p: Partial<DocClient>) => { setDoc((d) => (d ? { ...d, client: { ...d.client, ...p } } : d)); setDirty(true); };
  const patchModel = (p: Partial<DocModel>) => { setDoc((d) => (d ? { ...d, model: { ...d.model, ...p } } : d)); setDirty(true); };

  const setBlocks = (fn: (blocks: DocBlock[]) => DocBlock[]) => {
    setDoc((d) => (d ? { ...d, model: { ...d.model, blocks: fn(d.model.blocks) } } : d));
    setDirty(true);
  };
  const updateBlock = (blockId: string, p: Partial<DocBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.id === blockId ? ({ ...b, ...p } as DocBlock) : b)));
  const addBlock = (kind: BlockKind) => setBlocks((bs) => [...bs, newBlock(kind)]);
  const removeBlock = (blockId: string) => setBlocks((bs) => bs.filter((b) => b.id !== blockId));
  const moveBlock = (blockId: string, dir: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === blockId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

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

  const [exporting, setExporting] = useState<null | "pdf" | "word">(null);

  const meta = useMemo(() => {
    if (!doc) return undefined;
    const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : undefined);
    const client = doc.lang === "ar" ? doc.client.nameAr || doc.client.nameEn : doc.client.nameEn || doc.client.nameAr;
    return { number: doc.number, date: fmt(doc.issue_date) ?? "—", validUntil: fmt(doc.valid_until), client: client || undefined };
  }, [doc]);

  const exportAs = async (kind: "pdf" | "word") => {
    if (!doc || !tpl) return;
    try {
      setExporting(kind);
      const input = {
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
      };
      if (kind === "pdf") await exportDocPdf(input);
      else await exportDocWord(input);
      void logActivity(user?.id ?? null, "file_added", "business_doc", doc.id, {
        number: doc.number, doc_type: doc.doc_type, format: kind, theme: doc.theme, lang: doc.lang,
      });
    } catch (e) { toast.error((e as Error).message); }
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
        subtitle={ar ? "حرّر المحتوى على اليسار وشاهد الورقة النهائية مباشرة." : "Edit the content and watch the final A4 paper update live."}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to="/documents" className="btn-ghost" style={{ textDecoration: "none" }}>
              <ArrowLeft size={15} /> {ar ? "القائمة" : "All documents"}
            </Link>
            <button className="btn-ghost" onClick={() => exportAs("pdf")} disabled={!!exporting}>
              {exporting === "pdf" ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />} PDF
            </button>
            <button className="btn-ghost" onClick={() => exportAs("word")} disabled={!!exporting}>
              {exporting === "word" ? <Loader2 size={15} className="spin" /> : <FileType2 size={15} />} Word
            </button>
            <button className="btn-ghost" onClick={bumpRevision} disabled={saving}>
              <GitBranch size={15} /> {ar ? "نسخة جديدة" : "New revision"}
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} {ar ? "حفظ" : "Save"}
            </button>
          </div>
        }
      />

      {isMobile && (
        <div style={{ display: "flex", gap: 8 }}>
          <MiniToggle active={tab === "edit"} onClick={() => setTab("edit")} label={<span>{ar ? "تحرير" : "Edit"}</span>} />
          <MiniToggle active={tab === "preview"} onClick={() => setTab("preview")} label={<span>{ar ? "معاينة" : "Preview"}</span>} />
        </div>
      )}

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", alignItems: "start" }}>
        {/* ── Editor column ─────────────────────────────────────── */}
        <div style={{ display: isMobile && tab !== "edit" ? "none" : "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Section title={ar ? "بيانات المستند" : "Document settings"}>
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
          </Section>


          <Section title={ar ? "العميل / الجهة" : "Client / party"}>
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
          </Section>

          {doc.model.blocks.map((block, i) => (
            <BlockEditor
              key={block.id}
              ar={ar}
              block={block}
              index={i}
              count={doc.model.blocks.length}
              currency={doc.currency}
              onChange={(p) => updateBlock(block.id, p)}
              onRemove={() => removeBlock(block.id)}
              onMove={(dir) => moveBlock(block.id, dir)}
            />
          ))}

          <Section title={ar ? "إضافة بلوك" : "Add a block"}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
              {BLOCK_LABELS.map((b) => (
                <button key={b.kind} className="btn-ghost" onClick={() => addBlock(b.kind)} style={{ justifyContent: "flex-start", minHeight: 42 }}>
                  <Plus size={14} /> {ar ? b.ar : b.en}
                </button>
              ))}
            </div>
          </Section>
        </div>

        {/* ── Preview column ───────────────────────────────────── */}
        <div
          style={{
            position: isMobile ? "static" : "sticky",
            top: 12,
            display: isMobile && tab !== "preview" ? "none" : "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
              {ar ? "معاينة A4" : "A4 preview"} · {ar ? `${pageCount} صفحة` : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
            </span>
            <div style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
              <MiniToggle active={doc.theme === "light"} onClick={() => patch({ theme: "light" })} label={<Sun size={14} />} />
              <MiniToggle active={doc.theme === "dark"} onClick={() => patch({ theme: "dark" })} label={<Moon size={14} />} />
              <MiniToggle active={doc.lang === "ar"} onClick={() => patch({ lang: "ar" })} label="AR" />
              <MiniToggle active={doc.lang === "en"} onClick={() => patch({ lang: "en" })} label="EN" />
            </div>
          </div>
          <PaperPreview>
            <PaginatedDoc
              labels
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
          </PaperPreview>
        </div>
      </div>
    </div>
  );
}

/* ── Block editors ─────────────────────────────────────────────── */

function BlockEditor({
  ar, block, index, count, currency, onChange, onRemove, onMove,
}: {
  ar: boolean;
  block: DocBlock;
  index: number;
  count: number;
  currency: string;
  onChange: (p: Partial<DocBlock>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const label = BLOCK_LABELS.find((b) => b.kind === block.kind);
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{ar ? label?.ar : label?.en}</div>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
          <IconBtn onClick={() => onMove(-1)} disabled={index === 0}><ChevronUp size={15} /></IconBtn>
          <IconBtn onClick={() => onMove(1)} disabled={index === count - 1}><ChevronDown size={15} /></IconBtn>
          <IconBtn onClick={onRemove} danger><Trash2 size={15} /></IconBtn>
        </div>
      </div>

      {block.kind === "heading" && (
        <Row>
          <Text label={ar ? "عربي" : "Arabic"} value={block.ar} onChange={(v) => onChange({ ar: v } as Partial<DocBlock>)} />
          <Text label={ar ? "إنجليزي" : "English"} value={block.en} onChange={(v) => onChange({ en: v } as Partial<DocBlock>)} />
        </Row>
      )}

      {block.kind === "text" && (
        <Row>
          <Area label={ar ? "النص (عربي)" : "Text (AR)"} value={block.ar} onChange={(v) => onChange({ ar: v } as Partial<DocBlock>)} />
          <Area label={ar ? "النص (إنجليزي)" : "Text (EN)"} value={block.en} onChange={(v) => onChange({ en: v } as Partial<DocBlock>)} />
        </Row>
      )}

      {block.kind === "terms" && (
        <>
          <Row>
            <Text label={ar ? "العنوان (عربي)" : "Title (AR)"} value={block.titleAr} onChange={(v) => onChange({ titleAr: v } as Partial<DocBlock>)} />
            <Text label={ar ? "العنوان (إنجليزي)" : "Title (EN)"} value={block.titleEn} onChange={(v) => onChange({ titleEn: v } as Partial<DocBlock>)} />
          </Row>
          <Row>
            <Area label={ar ? "الشروط (عربي)" : "Terms (AR)"} value={block.ar} onChange={(v) => onChange({ ar: v } as Partial<DocBlock>)} />
            <Area label={ar ? "الشروط (إنجليزي)" : "Terms (EN)"} value={block.en} onChange={(v) => onChange({ en: v } as Partial<DocBlock>)} />
          </Row>
        </>
      )}

      {block.kind === "spacer" && (
        <Row>
          <Num label={ar ? "الارتفاع (px)" : "Height (px)"} value={block.size} min={4} max={200} onChange={(v) => onChange({ size: v } as Partial<DocBlock>)} />
        </Row>
      )}

      {block.kind === "pagebreak" && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {ar ? "يبدأ ما بعده في صفحة جديدة عند التصدير." : "Everything after this starts on a new page when exported."}
        </div>
      )}

      {block.kind === "keyvalue" && (
        <>
          <Row>
            <Text label={ar ? "العنوان (عربي)" : "Title (AR)"} value={block.titleAr} onChange={(v) => onChange({ titleAr: v } as Partial<DocBlock>)} />
            <Text label={ar ? "العنوان (إنجليزي)" : "Title (EN)"} value={block.titleEn} onChange={(v) => onChange({ titleEn: v } as Partial<DocBlock>)} />
          </Row>
          {block.rows.map((r, i) => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", flex: 1, minWidth: 0 }}>
                <Text label={ar ? `المفتاح ${i + 1} (ع)` : `Key ${i + 1} (AR)`} value={r.kAr} onChange={(v) => onChange({ rows: block.rows.map((x) => (x.id === r.id ? { ...x, kAr: v } : x)) } as Partial<DocBlock>)} />
                <Text label={ar ? "القيمة (ع)" : "Value (AR)"} value={r.vAr} onChange={(v) => onChange({ rows: block.rows.map((x) => (x.id === r.id ? { ...x, vAr: v } : x)) } as Partial<DocBlock>)} />
                <Text label={ar ? "المفتاح (EN)" : "Key (EN)"} value={r.kEn} onChange={(v) => onChange({ rows: block.rows.map((x) => (x.id === r.id ? { ...x, kEn: v } : x)) } as Partial<DocBlock>)} />
                <Text label={ar ? "القيمة (EN)" : "Value (EN)"} value={r.vEn} onChange={(v) => onChange({ rows: block.rows.map((x) => (x.id === r.id ? { ...x, vEn: v } : x)) } as Partial<DocBlock>)} />
              </div>
              <IconBtn onClick={() => onChange({ rows: block.rows.filter((x) => x.id !== r.id) } as Partial<DocBlock>)} danger><Trash2 size={15} /></IconBtn>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => onChange({ rows: [...block.rows, { id: uid(), kAr: "", kEn: "", vAr: "", vEn: "" }] } as Partial<DocBlock>)} style={{ alignSelf: "flex-start" }}>
            <Plus size={14} /> {ar ? "صف جديد" : "Add row"}
          </button>
        </>
      )}

      {block.kind === "table" && (
        <>
          <Row>
            <Text label={ar ? "العنوان (عربي)" : "Title (AR)"} value={block.titleAr} onChange={(v) => onChange({ titleAr: v } as Partial<DocBlock>)} />
            <Text label={ar ? "العنوان (إنجليزي)" : "Title (EN)"} value={block.titleEn} onChange={(v) => onChange({ titleEn: v } as Partial<DocBlock>)} />
          </Row>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))" }}>
            {block.headAr.map((h, ci) => (
              <Text
                key={`h-${ci}`}
                label={ar ? `ترويسة ${ci + 1}` : `Header ${ci + 1}`}
                value={ar ? h : block.headEn[ci] ?? ""}
                onChange={(v) =>
                  onChange(
                    (ar
                      ? { headAr: block.headAr.map((x, i2) => (i2 === ci ? v : x)) }
                      : { headEn: block.headEn.map((x, i2) => (i2 === ci ? v : x)) }) as Partial<DocBlock>,
                  )
                }
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn-ghost"
              onClick={() =>
                onChange({
                  headAr: [...block.headAr, `عمود ${block.headAr.length + 1}`],
                  headEn: [...block.headEn, `Column ${block.headEn.length + 1}`],
                  rows: block.rows.map((r) => ({ ...r, cellsAr: [...r.cellsAr, ""], cellsEn: [...r.cellsEn, ""] })),
                } as Partial<DocBlock>)
              }
            >
              <Plus size={14} /> {ar ? "عمود" : "Column"}
            </button>
            <button
              className="btn-ghost"
              disabled={block.headAr.length <= 1}
              onClick={() =>
                onChange({
                  headAr: block.headAr.slice(0, -1),
                  headEn: block.headEn.slice(0, -1),
                  rows: block.rows.map((r) => ({ ...r, cellsAr: r.cellsAr.slice(0, -1), cellsEn: r.cellsEn.slice(0, -1) })),
                } as Partial<DocBlock>)
              }
            >
              <Trash2 size={14} /> {ar ? "آخر عمود" : "Last column"}
            </button>
          </div>
          {block.rows.map((r, ri) => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", flex: 1, minWidth: 0 }}>
                {block.headAr.map((_, ci) => (
                  <Text
                    key={ci}
                    label={`${ri + 1}·${ci + 1}`}
                    value={(ar ? r.cellsAr[ci] : r.cellsEn[ci]) ?? ""}
                    onChange={(v) =>
                      onChange({
                        rows: block.rows.map((x) =>
                          x.id !== r.id
                            ? x
                            : ar
                              ? { ...x, cellsAr: x.cellsAr.map((cv, i2) => (i2 === ci ? v : cv)) }
                              : { ...x, cellsEn: x.cellsEn.map((cv, i2) => (i2 === ci ? v : cv)) },
                        ),
                      } as Partial<DocBlock>)
                    }
                  />
                ))}
              </div>
              <IconBtn onClick={() => onChange({ rows: block.rows.filter((x) => x.id !== r.id) } as Partial<DocBlock>)} danger><Trash2 size={15} /></IconBtn>
            </div>
          ))}
          <button
            className="btn-ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={() =>
              onChange({
                rows: [...block.rows, { id: uid(), cellsAr: block.headAr.map(() => ""), cellsEn: block.headEn.map(() => "") }],
              } as Partial<DocBlock>)
            }
          >
            <Plus size={14} /> {ar ? "صف جديد" : "Add row"}
          </button>
        </>
      )}

      {block.kind === "items" && <ItemsEditor ar={ar} block={block} currency={currency} onChange={onChange} />}
    </div>
  );
}

function ItemsEditor({
  ar, block, currency, onChange,
}: { ar: boolean; block: ItemsBlock; currency: string; onChange: (p: Partial<DocBlock>) => void }) {
  const set = (p: Partial<ItemsBlock>) => onChange(p as Partial<DocBlock>);
  const setRow = (rowId: string, p: Partial<ItemsBlock["rows"][number]>) =>
    set({ rows: block.rows.map((r) => (r.id === rowId ? { ...r, ...p } : r)) });

  return (
    <>
      <Row>
        <Text label={ar ? "العنوان (عربي)" : "Title (AR)"} value={block.titleAr} onChange={(v) => set({ titleAr: v })} />
        <Text label={ar ? "العنوان (إنجليزي)" : "Title (EN)"} value={block.titleEn} onChange={(v) => set({ titleEn: v })} />
      </Row>
      <Row>
        <Toggle label={ar ? "عمود الوحدة" : "Unit column"} value={block.showUnit} onChange={(v) => set({ showUnit: v })} />
        <Toggle label={ar ? "عمود الكمية" : "Qty column"} value={block.showQty} onChange={(v) => set({ showQty: v })} />
        <Toggle label={ar ? "عمود السعر" : "Price column"} value={block.showPrice} onChange={(v) => set({ showPrice: v })} />
        <Toggle label={ar ? "صفوف الإجماليات" : "Totals rows"} value={block.showTotals} onChange={(v) => set({ showTotals: v })} />
      </Row>
      <Row>
        <Num label={ar ? "الضريبة %" : "Tax %"} value={block.taxRate} min={0} max={100} onChange={(v) => set({ taxRate: v })} />
        <Num label={ar ? "خصم عام" : "Global discount"} value={block.discount} min={0} max={100000000} onChange={(v) => set({ discount: v })} />
        <Num label={ar ? "الشحن" : "Shipping"} value={block.shipping} min={0} max={100000000} onChange={(v) => set({ shipping: v })} />
      </Row>

      {block.rows.map((r, i) => (
        <div key={r.id} style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{ar ? `البند ${i + 1}` : `Item ${i + 1}`}</span>
            <span style={{ marginInlineStart: "auto", fontSize: 12, fontWeight: 700, direction: "ltr" }}>
              {((Number(r.qty) || 0) * (Number(r.price) || 0) - (Number(r.discount) || 0)).toLocaleString("en-US")} {currency}
            </span>
            <IconBtn onClick={() => set({ rows: block.rows.filter((x) => x.id !== r.id) })} danger><Trash2 size={15} /></IconBtn>
          </div>
          <Row>
            <Area label={ar ? "البيان (عربي)" : "Description (AR)"} value={r.descAr} onChange={(v) => setRow(r.id, { descAr: v })} />
            <Area label={ar ? "البيان (إنجليزي)" : "Description (EN)"} value={r.descEn} onChange={(v) => setRow(r.id, { descEn: v })} />
          </Row>
          <Row>
            <Text label={ar ? "الوحدة (ع)" : "Unit (AR)"} value={r.unitAr} onChange={(v) => setRow(r.id, { unitAr: v })} />
            <Text label={ar ? "الوحدة (EN)" : "Unit (EN)"} value={r.unitEn} onChange={(v) => setRow(r.id, { unitEn: v })} />
            <Num label={ar ? "الكمية" : "Qty"} value={r.qty} min={0} max={1000000} onChange={(v) => setRow(r.id, { qty: v })} />
            <Num label={ar ? "سعر الوحدة" : "Unit price"} value={r.price} min={0} max={100000000} onChange={(v) => setRow(r.id, { price: v })} />
            <Num label={ar ? "خصم السطر" : "Line discount"} value={r.discount} min={0} max={100000000} onChange={(v) => setRow(r.id, { discount: v })} />
          </Row>
        </div>
      ))}
      <button className="btn-ghost" onClick={() => set({ rows: [...block.rows, emptyItemRow()] })} style={{ alignSelf: "flex-start" }}>
        <Plus size={14} /> {ar ? "بند جديد" : "Add item"}
      </button>
    </>
  );
}

/* ── Preview scaler ───────────────────────────────────────────── */

function PaperPreview({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(0);
  const [paperHeight, setPaperHeight] = useState(1123);
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
    const ro = new ResizeObserver(() => setPaperHeight(Math.max(1123, inner.scrollHeight)));
    ro.observe(inner);
    setPaperHeight(Math.max(1123, inner.scrollHeight));
    return () => ro.disconnect();
  }, [inner]);

  const scale = width > 0 ? Math.min(1, width / 794) : 1;
  return (
    <div ref={setEl} style={{ width: "100%", overflow: "hidden" }}>
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
