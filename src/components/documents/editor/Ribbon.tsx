// Word-style ribbon for the document editor.

import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Table as TableIcon, Image as ImageIcon, Link2, Minus, SeparatorHorizontal,
  Undo2, Redo2, Rows3, Columns3, Trash2, Type, Highlighter, Baseline, Braces,
} from "lucide-react";
import { DOC_FIELDS, fieldLabel } from "@/lib/docs/rich";
import type { DocLang } from "@/lib/docs/types";

const FONTS = [
  { v: "'Montserrat Arabic','Almarai',sans-serif", l: "Montserrat Arabic" },
  { v: "'Montserrat',sans-serif", l: "Montserrat" },
  { v: "Arial,Helvetica,sans-serif", l: "Arial" },
  { v: "'Times New Roman',serif", l: "Times New Roman" },
  { v: "Georgia,serif", l: "Georgia" },
  { v: "'Courier New',monospace", l: "Courier New" },
];
const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const COLORS = ["#0B1A2A", "#1E3A57", "#42C2EE", "#C9A227", "#22C55E", "#EF4444", "#F59E0B", "#FFFFFF"];
const HIGHLIGHTS = ["#FEF08A", "#BBF7D0", "#BFDBFE", "#FBCFE8", "#E2E8F0"];
const LINE_HEIGHTS = ["1.2", "1.4", "1.6", "1.8", "2"];

export function Ribbon({ editor, lang, onImage }: { editor: Editor | null; lang: DocLang; onImage: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ar = lang === "ar";
  if (!editor) return null;

  const chain = () => editor.chain().focus();
  const isTable = editor.isActive("table");

  return (
    <div className="doc-ribbon">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImage(f);
          e.currentTarget.value = "";
        }}
      />

      {/* Group: history + block type */}
      <div className="doc-ribbon-group">
        <RBtn onClick={() => chain().undo().run()} title={ar ? "تراجع" : "Undo"}><Undo2 size={15} /></RBtn>
        <RBtn onClick={() => chain().redo().run()} title={ar ? "إعادة" : "Redo"}><Redo2 size={15} /></RBtn>
        <select
          className="doc-ribbon-select"
          value={
            editor.isActive("heading", { level: 1 }) ? "h1"
            : editor.isActive("heading", { level: 2 }) ? "h2"
            : editor.isActive("heading", { level: 3 }) ? "h3"
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

      {/* Group: font */}
      <div className="doc-ribbon-group">
        <select
          className="doc-ribbon-select"
          value={(editor.getAttributes("textStyle").fontFamily as string) ?? ""}
          onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
          title={ar ? "الخط" : "Font"}
        >
          <option value="">{ar ? "الخط" : "Font"}</option>
          {FONTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
        </select>
        <select
          className="doc-ribbon-select doc-ribbon-select-sm"
          value={((editor.getAttributes("textStyle").fontSize as string) ?? "").replace("px", "")}
          onChange={(e) => (e.target.value ? chain().setFontSize(`${e.target.value}px`).run() : chain().unsetFontSize().run())}
          title={ar ? "الحجم" : "Size"}
        >
          <option value="">{ar ? "حجم" : "Size"}</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Group: marks */}
      <div className="doc-ribbon-group">
        <RBtn active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()} title="Bold"><Bold size={15} /></RBtn>
        <RBtn active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()} title="Italic"><Italic size={15} /></RBtn>
        <RBtn active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()} title="Underline"><UnderlineIcon size={15} /></RBtn>
        <RBtn active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()} title="Strike"><Strikethrough size={15} /></RBtn>
        <Palette icon={<Baseline size={15} />} colors={COLORS} onPick={(c) => chain().setColor(c).run()} onClear={() => chain().unsetColor().run()} title={ar ? "لون النص" : "Text color"} />
        <Palette icon={<Highlighter size={15} />} colors={HIGHLIGHTS} onPick={(c) => chain().toggleHighlight({ color: c }).run()} onClear={() => chain().unsetHighlight().run()} title={ar ? "تمييز" : "Highlight"} />
      </div>

      {/* Group: paragraph */}
      <div className="doc-ribbon-group">
        <RBtn active={editor.isActive({ textAlign: "right" })} onClick={() => chain().setTextAlign("right").run()} title={ar ? "يمين" : "Right"}><AlignRight size={15} /></RBtn>
        <RBtn active={editor.isActive({ textAlign: "center" })} onClick={() => chain().setTextAlign("center").run()} title={ar ? "وسط" : "Center"}><AlignCenter size={15} /></RBtn>
        <RBtn active={editor.isActive({ textAlign: "left" })} onClick={() => chain().setTextAlign("left").run()} title={ar ? "يسار" : "Left"}><AlignLeft size={15} /></RBtn>
        <RBtn active={editor.isActive({ textAlign: "justify" })} onClick={() => chain().setTextAlign("justify").run()} title={ar ? "ضبط" : "Justify"}><AlignJustify size={15} /></RBtn>
        <RBtn active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()} title={ar ? "قائمة نقطية" : "Bullets"}><List size={15} /></RBtn>
        <RBtn active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()} title={ar ? "قائمة مرقمة" : "Numbered"}><ListOrdered size={15} /></RBtn>
        <select
          className="doc-ribbon-select doc-ribbon-select-sm"
          value={(editor.getAttributes("paragraph").lineHeight as string) ?? ""}
          onChange={(e) => (e.target.value ? chain().setLineHeight(e.target.value).run() : chain().unsetLineHeight().run())}
          title={ar ? "تباعد الأسطر" : "Line height"}
        >
          <option value="">{ar ? "تباعد" : "Spacing"}</option>
          {LINE_HEIGHTS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <RBtn onClick={() => chain().setBlockDir("rtl").run()} title="RTL"><span style={{ fontSize: 11, fontWeight: 700 }}>RTL</span></RBtn>
        <RBtn onClick={() => chain().setBlockDir("ltr").run()} title="LTR"><span style={{ fontSize: 11, fontWeight: 700 }}>LTR</span></RBtn>
      </div>

      {/* Group: insert */}
      <div className="doc-ribbon-group">
        <RBtn onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title={ar ? "جدول" : "Table"}><TableIcon size={15} /></RBtn>
        {isTable && (
          <>
            <RBtn onClick={() => chain().addRowAfter().run()} title={ar ? "صف" : "Row"}><Rows3 size={15} /></RBtn>
            <RBtn onClick={() => chain().addColumnAfter().run()} title={ar ? "عمود" : "Column"}><Columns3 size={15} /></RBtn>
            <RBtn onClick={() => chain().deleteRow().run()} title={ar ? "حذف صف" : "Delete row"}><Trash2 size={15} /></RBtn>
            <RBtn onClick={() => chain().mergeOrSplit().run()} title={ar ? "دمج/فصل" : "Merge / split"}><Braces size={15} /></RBtn>
          </>
        )}
        <RBtn onClick={() => fileRef.current?.click()} title={ar ? "صورة" : "Image"}><ImageIcon size={15} /></RBtn>
        <RBtn
          onClick={() => {
            const url = window.prompt(ar ? "الرابط:" : "URL:", "https://");
            if (url) chain().setLink({ href: url }).run();
          }}
          title={ar ? "رابط" : "Link"}
        >
          <Link2 size={15} />
        </RBtn>
        <RBtn onClick={() => chain().setHorizontalRule().run()} title={ar ? "خط فاصل" : "Divider"}><Minus size={15} /></RBtn>
        <RBtn onClick={() => chain().insertContent({ type: "pageBreak" }).run()} title={ar ? "فاصل صفحة" : "Page break"}><SeparatorHorizontal size={15} /></RBtn>
      </div>

      {/* Group: smart content */}
      <div className="doc-ribbon-group">
        <RBtn onClick={() => chain().insertContent({ type: "itemsTable" }).run()} title={ar ? "جدول بنود بحساب تلقائي" : "Items table"}>
          <Type size={15} /> <span style={{ fontSize: 11.5 }}>{ar ? "بنود" : "Items"}</span>
        </RBtn>
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
      </div>
    </div>
  );
}

function RBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button type="button" className={`doc-ribbon-btn${active ? " is-active" : ""}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function Palette({ icon, colors, onPick, onClear, title }: { icon: React.ReactNode; colors: string[]; onPick: (c: string) => void; onClear: () => void; title: string }) {
  return (
    <div className="doc-ribbon-palette" title={title}>
      <span className="doc-ribbon-btn">{icon}</span>
      <div className="doc-ribbon-swatches">
        {colors.map((c) => (
          <button key={c} type="button" style={{ background: c }} onClick={() => onPick(c)} title={c} />
        ))}
        <button type="button" className="doc-ribbon-clear" onClick={onClear}>×</button>
      </div>
    </div>
  );
}
