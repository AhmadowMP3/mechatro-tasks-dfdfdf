// Fourth template settings section: the default body every new document of a
// type starts from, plus a shared library of reusable content blocks
// (text / tables / images) that can be dropped into any document.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown, LibraryBig, Pencil, X } from "lucide-react";

import { SimpleDocEditor } from "./editor/SimpleDocEditor";
import { docBlocks, blockLabel, type DocBlock } from "@/lib/docs/blocks";
import type { DocLang } from "@/lib/docs/types";

type Props = {
  lang: DocLang;
  /** Body language/currency used for field previews inside the editor. */
  bodyLang: DocLang;
  currency: string;
  html: string;
  onChange: (html: string) => void;
};

export function TemplateContentSection({ lang, bodyLang, currency, html, onChange }: Props) {
  const ar = lang === "ar";
  const insertRef = useRef<((html: string) => void) | null>(null);
  const getHtmlRef = useRef<(() => string) | null>(null);

  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<DocBlock | null>(null);
  const [draft, setDraft] = useState<{ name_ar: string; name_en: string; html: string } | null>(null);

  const load = () => {
    docBlocks
      .list()
      .then((rows) => {
        if (rows === null) { setUnavailable(true); setBlocks([]); return; }
        setUnavailable(false);
        setBlocks(rows);
      })
      .catch(() => setUnavailable(true));
  };
  useEffect(load, []);

  const startNew = () => {
    setEditing(null);
    setDraft({ name_ar: "", name_en: "", html: "<p></p>" });
  };

  const startEdit = (b: DocBlock) => {
    setEditing(b);
    setDraft({ name_ar: b.name_ar, name_en: b.name_en, html: b.html || "<p></p>" });
  };

  const saveBlock = async () => {
    if (!draft) return;
    if (!draft.name_ar.trim() && !draft.name_en.trim()) {
      toast.error(ar ? "أدخل اسماً للمقطع" : "Give the block a name");
      return;
    }
    try {
      setBusy(true);
      if (editing) await docBlocks.update(editing.id, draft);
      else await docBlocks.create({ ...draft, sort: blocks.length });
      setDraft(null);
      setEditing(null);
      load();
      toast.success(ar ? "تم حفظ المقطع" : "Block saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const removeBlock = async (b: DocBlock) => {
    if (!confirm(ar ? `حذف «${blockLabel(b, "ar")}»؟` : `Delete “${blockLabel(b, "en")}”?`)) return;
    try {
      setBusy(true);
      await docBlocks.remove(b.id);
      if (editing?.id === b.id) { setEditing(null); setDraft(null); }
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
    try { await docBlocks.reorder(next.map((b) => b.id)); }
    catch (e) { toast.error((e as Error).message); load(); }
  };

  const insertBlock = (b: DocBlock) => {
    if (!insertRef.current) return;
    insertRef.current(b.html || "");
    toast.success(ar ? "تمت الإضافة إلى المحتوى" : "Inserted into the content");
  };

  const saveCurrentAsBlock = () => {
    const current = getHtmlRef.current?.() ?? html;
    setEditing(null);
    setDraft({ name_ar: "", name_en: "", html: current || "<p></p>" });
  };

  const tools = useMemo(
    () => (
      <button className="btn-ghost" type="button" onClick={saveCurrentAsBlock} style={{ fontSize: 12.5 }}>
        <LibraryBig size={14} /> {ar ? "حفظ كمقطع جاهز" : "Save as block"}
      </button>
    ),
    [ar, html],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6 }}>
        {ar
          ? "كل مستند جديد من هذا النوع سيبدأ بهذا المحتوى: نصوص، جداول، صور، وحقول تلقائية. يمكن تعديله لاحقاً داخل المستند نفسه."
          : "Every new document of this type starts from this content: text, tables, images and auto fields. It stays fully editable inside the document."}
      </p>

      <SimpleDocEditor
        html={html}
        onChange={onChange}
        lang={bodyLang}
        currency={currency}
        minHeight={260}
        extraTools={tools}
        onReady={(api) => { insertRef.current = api.insert; getHtmlRef.current = api.selectionHtml; }}
      />

      {/* ── Reusable blocks library ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <strong style={{ fontSize: 13.5 }}>{ar ? "مكتبة المقاطع الجاهزة" : "Reusable blocks"}</strong>
        <button className="btn-ghost" type="button" onClick={startNew} disabled={unavailable} style={{ fontSize: 12.5 }}>
          <Plus size={14} /> {ar ? "مقطع جديد" : "New block"}
        </button>
      </div>

      {unavailable ? (
        <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", border: "1px dashed var(--border)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.6 }}>
          {ar
            ? "مكتبة المقاطع غير متاحة على هذا الخادم بعد (لم يتم تحديث قاعدة البيانات). المحتوى الافتراضي أعلاه يعمل بشكل طبيعي."
            : "The blocks library is not available on this backend yet (database not migrated). The default content above still works normally."}
        </div>
      ) : blocks.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
          {ar ? "لا توجد مقاطع بعد — أنشئ مقطعاً لتستخدمه في كل الأنواع." : "No blocks yet — create one to reuse it across every document type."}
        </div>
      ) : (
        <div className="doc-blocks-list">
          {blocks.map((b, i) => (
            <div key={b.id} className={`doc-block-row${editing?.id === b.id ? " is-active" : ""}`}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 600 }}>{blockLabel(b, ar ? "ar" : "en")}</span>
              <button className="btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => insertBlock(b)}>
                <Plus size={13} /> {ar ? "إدراج" : "Insert"}
              </button>
              <button className="btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => startEdit(b)}>
                <Pencil size={13} />
              </button>
              <button className="btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp size={13} />
              </button>
              <button className="btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>
                <ArrowDown size={13} />
              </button>
              <button className="btn-ghost" type="button" style={{ fontSize: 12, color: "var(--danger, #ef4444)" }} onClick={() => removeBlock(b)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "var(--muted, transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{editing ? (ar ? "تعديل المقطع" : "Edit block") : (ar ? "مقطع جديد" : "New block")}</strong>
            <button className="btn-ghost" type="button" onClick={() => { setDraft(null); setEditing(null); }} style={{ fontSize: 12 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
            <input
              className="input"
              placeholder={ar ? "الاسم بالعربية" : "Arabic name"}
              value={draft.name_ar}
              onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
            />
            <input
              className="input"
              placeholder={ar ? "الاسم بالإنجليزية" : "English name"}
              value={draft.name_en}
              onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
            />
          </div>
          <SimpleDocEditor
            html={draft.html}
            onChange={(v) => setDraft((d) => (d ? { ...d, html: v } : d))}
            lang={bodyLang}
            currency={currency}
            minHeight={180}
            placeholder={ar ? "محتوى المقطع…" : "Block content…"}
          />
          <div>
            <button className="btn-primary" type="button" onClick={saveBlock} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />} {ar ? "حفظ المقطع" : "Save block"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
