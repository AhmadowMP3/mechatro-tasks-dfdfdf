import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { NoteToolbar } from "./NoteToolbar";

type Props = {
  noteId: string;
  content: string;
  onChange: (html: string, text: string) => void;
  editable?: boolean;
  onEditor?: (e: Editor | null) => void;
  onInsertImageClick?: () => void;
};

export function NoteEditor({ noteId, content, onChange, editable = true, onEditor, onInsertImageClick }: Props) {
  const { lang, t } = useApp();

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "note-link" } }),
      Image.configure({ HTMLAttributes: { class: "note-image" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: t("selectOrCreateNote") }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
    editorProps: {
      attributes: {
        dir: lang === "ar" ? "rtl" : "ltr",
        class: "note-editor-content",
      },
    },
  });

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  // Update content when switching notes.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === content) return;
    editor.commands.setContent(content || "", { emitUpdate: false });
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {editable && <NoteToolbar editor={editor} onInsertImageClick={onInsertImageClick} />}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .note-editor-content { outline: none; min-height: 300px; font-size: 15.5px; line-height: 1.75; color: var(--foreground); }
        .note-editor-content h1 { font-size: 28px; font-weight: 800; margin: 16px 0 10px; }
        .note-editor-content h2 { font-size: 22px; font-weight: 800; margin: 14px 0 8px; }
        .note-editor-content h3 { font-size: 18px; font-weight: 700; margin: 12px 0 6px; }
        .note-editor-content p { margin: 6px 0; }
        .note-editor-content ul, .note-editor-content ol { padding-inline-start: 24px; margin: 6px 0; }
        .note-editor-content ul[data-type="taskList"] { list-style: none; padding-inline-start: 0; }
        .note-editor-content ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
        .note-editor-content ul[data-type="taskList"] input[type="checkbox"] { margin-top: 6px; cursor: pointer; }
        .note-editor-content blockquote { border-inline-start: 3px solid var(--primary); padding-inline-start: 12px; color: var(--muted); margin: 8px 0; }
        .note-editor-content code { background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 4px; font-size: 13.5px; }
        .note-editor-content pre { background: rgba(0,0,0,.3); padding: 12px; border-radius: 8px; overflow-x: auto; }
        .note-editor-content a.note-link { color: #3B82F6; text-decoration: underline; }
        .note-editor-content img.note-image { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .note-editor-content p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted); pointer-events: none; float: inline-start; height: 0; }
        .note-editor-content:focus { outline: none; }
        .ProseMirror-focused { outline: none; }
      `}</style>
    </div>
  );
}
