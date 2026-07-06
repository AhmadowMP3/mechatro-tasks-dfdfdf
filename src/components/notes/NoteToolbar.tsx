import type { Editor } from "@tiptap/react";
import { Bold, Italic, Underline as UIcon, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Link as LinkIcon, AlignRight, AlignCenter, AlignLeft, Image as ImageIcon, Undo2, Redo2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import type { DictKey } from "@/i18n/dict";

export function NoteToolbar({ editor, onInsertImageClick }: { editor: Editor | null; onInsertImageClick?: () => void }) {
  const { t } = useApp();
  if (!editor) return null;

  const btn = (active: boolean, disabled: boolean, onClick: () => void, icon: React.ReactNode, labelKey: DictKey) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={t(labelKey)}
      title={t(labelKey)}
      style={{
        width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6, border: "1px solid transparent",
        background: active ? "rgba(59,130,246,.2)" : "transparent",
        color: active ? "#3B82F6" : "var(--foreground)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon}
    </button>
  );

  const sep = <span style={{ width: 1, background: "var(--border)", margin: "0 4px", alignSelf: "stretch" }} />;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2,
      padding: "8px 12px",
      background: "var(--surface-2)",
      borderBottom: "1px solid var(--border)",
      position: "sticky", top: 0, zIndex: 5,
    }}>
      {btn(editor.isActive("bold"), false, () => editor.chain().focus().toggleBold().run(), <Bold size={16} />, "textBold")}
      {btn(editor.isActive("italic"), false, () => editor.chain().focus().toggleItalic().run(), <Italic size={16} />, "textItalic")}
      {btn(editor.isActive("underline"), false, () => editor.chain().focus().toggleUnderline().run(), <UIcon size={16} />, "textUnderline")}
      {btn(editor.isActive("strike"), false, () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={16} />, "textStrike")}
      {sep}
      {btn(editor.isActive("heading", { level: 1 }), false, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 size={16} />, "heading1")}
      {btn(editor.isActive("heading", { level: 2 }), false, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={16} />, "heading2")}
      {btn(editor.isActive("heading", { level: 3 }), false, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={16} />, "heading3")}
      {sep}
      {btn(editor.isActive("bulletList"), false, () => editor.chain().focus().toggleBulletList().run(), <List size={16} />, "bulletList")}
      {btn(editor.isActive("orderedList"), false, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={16} />, "orderedList")}
      {btn(editor.isActive("taskList"), false, () => editor.chain().focus().toggleTaskList().run(), <ListChecks size={16} />, "taskList")}
      {btn(editor.isActive("blockquote"), false, () => editor.chain().focus().toggleBlockquote().run(), <Quote size={16} />, "blockquote")}
      {sep}
      {btn(editor.isActive({ textAlign: "right" }), false, () => editor.chain().focus().setTextAlign("right").run(), <AlignRight size={16} />, "alignRight")}
      {btn(editor.isActive({ textAlign: "center" }), false, () => editor.chain().focus().setTextAlign("center").run(), <AlignCenter size={16} />, "alignCenter")}
      {btn(editor.isActive({ textAlign: "left" }), false, () => editor.chain().focus().setTextAlign("left").run(), <AlignLeft size={16} />, "alignLeft")}
      {sep}
      {btn(editor.isActive("link"), false, () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt(t("addNoteLink"), prev ?? "https://");
        if (url === null) return;
        if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      }, <LinkIcon size={16} />, "addNoteLink")}
      {onInsertImageClick && btn(false, false, onInsertImageClick, <ImageIcon size={16} />, "insertImage")}
      {sep}
      {btn(false, !editor.can().undo(), () => editor.chain().focus().undo().run(), <Undo2 size={16} />, "undoAction")}
      {btn(false, !editor.can().redo(), () => editor.chain().focus().redo().run(), <Redo2 size={16} />, "redoAction")}
    </div>
  );
}
