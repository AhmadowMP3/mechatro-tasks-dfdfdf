// Simplified Word-style editor used by the template settings page (default
// document content) and by the reusable-blocks library. Same engine and same
// output HTML as the full document editor — just a trimmed toolbar.

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontSize, FontFamily } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableRow } from "@tiptap/extension-table-row";
import { GeometryTable, ShadedTableCell, ShadedTableHeader } from "./table-cells";
import {
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Table as TableIcon, ImagePlus, Rows3, Columns3, Grid2x2X,
  Undo2, Redo2, Eraser, Loader2, Type,
} from "lucide-react";
import { toast } from "sonner";

import { ResizableImage, IMAGE_MAX_WIDTH } from "./ResizableImage";
import { PageBreak, DocField, ItemsTable, DivBlock, DocEditorCtxProvider } from "./extensions";
import { BlockFormat, InlineStyle, Superscript, Subscript } from "./text-attrs";
import { DOC_FIELDS, fieldLabel } from "@/lib/docs/rich";
import { prepareImage } from "@/lib/docs/upload";
import type { DocLang } from "@/lib/docs/types";
import { editorIsReady, useStableEditor } from "./useStableEditor";

type Props = {
  html: string;
  onChange: (html: string) => void;
  lang: DocLang;
  currency: string;
  placeholder?: string;
  minHeight?: number;
  /** Extra toolbar buttons pinned to the end (e.g. "save as block"). */
  extraTools?: React.ReactNode;
  /** Called with the editor's current selection HTML, for "save as block". */
  onReady?: (api: { insert: (html: string) => void; selectionHtml: () => string }) => void;
};

export function SimpleDocEditor({
  html, onChange, lang, currency, placeholder, minHeight = 220, extraTools, onReady,
}: Props) {
  const ar = lang === "ar";
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastEmitted = useRef(html);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [uploading, setUploading] = useState(false);

  // Live language / currency, read by the extensions without a rebuild.
  const langRef = useRef(lang);
  langRef.current = lang;
  const currencyRef = useRef(currency);
  currencyRef.current = currency;
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false, underline: false }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      BlockFormat,
      InlineStyle,
      Superscript,
      Subscript,
      DivBlock,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow" } }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      GeometryTable.configure({ resizable: true }),
      TableRow,
      ShadedTableHeader,
      ShadedTableCell,
      Placeholder.configure({
        placeholder: () =>
          placeholderRef.current ??
          (langRef.current === "ar" ? "اكتب المحتوى الافتراضي هنا…" : "Write the default content here…"),
      }),
      PageBreak,
      DocField.configure({ lang: langRef.current, values: {}, getLang: () => langRef.current }),
      ItemsTable.configure({ lang: langRef.current, currency: currencyRef.current }),
    ],
    [],
  );

  const editor = useStableEditor(
    () => new Editor({
      extensions,
      content: html || "<p></p>",
      editorProps: {
        attributes: { class: "doc-rich doc-rich-editable", dir: ar ? "rtl" : "ltr", spellcheck: "false" },
      },
      onUpdate: ({ editor: e }) => {
        const next = e.getHTML();
        lastEmitted.current = next;
        onChangeRef.current(next);
      },
    }),
  );

  useEffect(() => {
    if (!editorIsReady(editor)) return;
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
  }, [editor, html]);

  // Apply language / currency changes in place instead of recreating the
  // editor (recreating it used to blank the page mid-render).
  useEffect(() => {
    if (!editorIsReady(editor)) return;
    editor.setOptions({
      editorProps: {
        attributes: { class: "doc-rich doc-rich-editable", dir: ar ? "rtl" : "ltr", spellcheck: "false" },
      },
    });
    try { editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false)); } catch { /* view gone */ }
  }, [editor, lang, currency, ar]);

  useEffect(() => {
    if (!editorIsReady(editor) || !onReady) return;
    onReady({
      insert: (block: string) => { if (editorIsReady(editor)) editor.chain().focus().insertContent(block).run(); },
      selectionHtml: () => (editorIsReady(editor) ? editor.getHTML() : ""),
    });
  }, [editor, onReady]);


  const pickImage = async (file: File) => {
    try {
      setUploading(true);
      const { src } = await prepareImage(file);
      if (editorIsReady(editor)) {
        editor.chain().focus().setImage({ src, width: Math.round(IMAGE_MAX_WIDTH * 0.6), align: "center" } as { src: string }).run();
      }
    } catch {
      toast.error(ar ? "تعذّر إضافة الصورة (الحد 8 ميغابايت)" : "Could not add the image (8 MB max)");
    } finally {
      setUploading(false);
    }
  };

  if (!editorIsReady(editor)) return null;
  const run = (command: (live: Editor) => void) => {
    if (editorIsReady(editor)) command(editor);
  };
  const active = (nameOrAttrs: string | Record<string, unknown>, attributes?: Record<string, unknown>) => {
    try {
      if (!editorIsReady(editor)) return false;
      return typeof nameOrAttrs === "string"
        ? editor.isActive(nameOrAttrs, attributes)
        : editor.isActive(nameOrAttrs);
    } catch { return false; }
  };
  const chain = () => editor.chain().focus();
  const isTable = active("table");

  return (
    <div className="simple-doc-editor">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pickImage(f);
          e.currentTarget.value = "";
        }}
      />
      <div className="doc-ribbon simple-doc-ribbon">
        <div className="doc-ribbon-group">
          <SBtn onClick={() => run((e) => e.chain().focus().undo().run())} title={ar ? "تراجع" : "Undo"}><Undo2 size={15} /></SBtn>
          <SBtn onClick={() => run((e) => e.chain().focus().redo().run())} title={ar ? "إعادة" : "Redo"}><Redo2 size={15} /></SBtn>
          <select
            className="doc-ribbon-select"
            value={
              active("heading", { level: 1 }) ? "h1"
              : active("heading", { level: 2 }) ? "h2"
              : active("heading", { level: 3 }) ? "h3"
              : "p"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") chain().setParagraph().run();
              else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">{ar ? "نص عادي" : "Normal text"}</option>
            <option value="h1">{ar ? "عنوان 1" : "Heading 1"}</option>
            <option value="h2">{ar ? "عنوان 2" : "Heading 2"}</option>
            <option value="h3">{ar ? "عنوان 3" : "Heading 3"}</option>
          </select>
        </div>

        <div className="doc-ribbon-group">
          <SBtn active={active("bold")} onClick={() => chain().toggleBold().run()} title="Bold"><Bold size={15} /></SBtn>
          <SBtn active={active("italic")} onClick={() => chain().toggleItalic().run()} title="Italic"><Italic size={15} /></SBtn>
          <SBtn active={active("underline")} onClick={() => chain().toggleUnderline().run()} title="Underline"><UnderlineIcon size={15} /></SBtn>
          <SBtn active={active({ textAlign: "right" })} onClick={() => chain().setTextAlign("right").run()} title={ar ? "يمين" : "Right"}><AlignRight size={15} /></SBtn>
          <SBtn active={active({ textAlign: "center" })} onClick={() => chain().setTextAlign("center").run()} title={ar ? "وسط" : "Center"}><AlignCenter size={15} /></SBtn>
          <SBtn active={active({ textAlign: "left" })} onClick={() => chain().setTextAlign("left").run()} title={ar ? "يسار" : "Left"}><AlignLeft size={15} /></SBtn>
          <SBtn active={active("bulletList")} onClick={() => chain().toggleBulletList().run()} title={ar ? "قائمة نقطية" : "Bullets"}><List size={15} /></SBtn>
          <SBtn active={active("orderedList")} onClick={() => chain().toggleOrderedList().run()} title={ar ? "قائمة مرقمة" : "Numbered"}><ListOrdered size={15} /></SBtn>
        </div>

        <div className="doc-ribbon-group">
          <SBtn onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title={ar ? "جدول" : "Table"}><TableIcon size={15} /></SBtn>
          {isTable && (
            <>
              <SBtn onClick={() => chain().addRowAfter().run()} title={ar ? "إضافة صف" : "Add row"}><Rows3 size={15} /></SBtn>
              <SBtn onClick={() => chain().addColumnAfter().run()} title={ar ? "إضافة عمود" : "Add column"}><Columns3 size={15} /></SBtn>
              <SBtn danger onClick={() => chain().deleteRow().run()} title={ar ? "حذف صف" : "Delete row"}><Rows3 size={15} /></SBtn>
              <SBtn danger onClick={() => chain().deleteColumn().run()} title={ar ? "حذف عمود" : "Delete column"}><Columns3 size={15} /></SBtn>
              <SBtn danger onClick={() => chain().deleteTable().run()} title={ar ? "حذف الجدول" : "Delete table"}><Grid2x2X size={15} /></SBtn>
            </>
          )}
          <SBtn onClick={() => fileRef.current?.click()} title={ar ? "صورة" : "Image"}>
            {uploading ? <Loader2 size={15} className="spin" /> : <ImagePlus size={15} />}
          </SBtn>
          <SBtn onClick={() => chain().insertContent({ type: "itemsTable" }).run()} title={ar ? "جدول بنود بحساب تلقائي" : "Items table"}>
            <Type size={15} /> <span style={{ fontSize: 11.5 }}>{ar ? "بنود" : "Items"}</span>
          </SBtn>
          <select
            className="doc-ribbon-select"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              chain().insertContent({ type: "docField", attrs: { field: e.target.value } }).run();
              e.currentTarget.value = "";
            }}
            title={ar ? "حقل تلقائي" : "Auto field"}
          >
            <option value="">{ar ? "حقل تلقائي" : "Auto field"}</option>
            {DOC_FIELDS.map((f) => <option key={f.key} value={f.key}>{fieldLabel(f.key, lang)}</option>)}
          </select>
          <SBtn danger onClick={() => chain().unsetAllMarks().clearNodes().run()} title={ar ? "مسح التنسيق" : "Clear formatting"}><Eraser size={15} /></SBtn>
        </div>

        {extraTools && <div className="doc-ribbon-actions">{extraTools}</div>}
      </div>

      <div className="simple-doc-surface" style={{ minHeight }}>
        <DocEditorCtxProvider value={{ lang, currency }}><EditorContent editor={editor} /></DocEditorCtxProvider>
      </div>
    </div>
  );
}

function SBtn({ children, onClick, active, title, danger }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`doc-ribbon-btn${active ? " is-active" : ""}${danger ? " is-danger" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
