import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import { NoteToolbar } from "./NoteToolbar";
import { SlashMenu } from "./SlashMenu";

type Props = {
  noteId: string;
  content: string;
  onChange: (html: string, text: string) => void;
  editable?: boolean;
  onEditor?: (e: Editor | null) => void;
  onInsertImageClick?: () => void;
};

// A4 at 96 DPI is ~1123px tall. Roughly the header + title + meta + divider
// occupy ~245px at the top of the first PDF page; every subsequent page is a
// full 1123px slice from the tall rendered document.
const PDF_PAGE_HEIGHT = 1123;
const PDF_FIRST_PAGE_CONTENT = PDF_PAGE_HEIGHT - 245; // ~878px
const PDF_MIRROR_WIDTH = 714; // 794 - 40*2 padding

export function NoteEditor({ noteId, content, onChange, editable = true, onEditor, onInsertImageClick }: Props) {
  const { lang, t } = useApp();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [liveHtml, setLiveHtml] = useState(content);
  const [breaks, setBreaks] = useState<{ top: number; page: number }[]>([]);

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
      Placeholder.configure({ placeholder: t("slashHint") }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "note-table" } }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setLiveHtml(html);
      onChange(html, editor.getText());
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

  // Reset content only when switching notes (not on every autosave-driven prop change).
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content || "", { emitUpdate: false });
    setLiveHtml(content || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  // Off-screen mirror mimicking the PDF body width/typography, used only to
  // measure where page breaks fall in the exported PDF.
  useEffect(() => {
    if (!mirrorRef.current) {
      const m = document.createElement("div");
      m.className = "note-pdf-content note-pdf-mirror";
      m.setAttribute("aria-hidden", "true");
      m.style.cssText = [
        "position:absolute",
        "left:-99999px",
        "top:0",
        `width:${PDF_MIRROR_WIDTH}px`,
        "font-size:14px",
        "line-height:1.8",
        "color:#1E293B",
        "visibility:hidden",
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(m);
      mirrorRef.current = m;
    }
    return () => {
      mirrorRef.current?.remove();
      mirrorRef.current = null;
    };
  }, []);

  // Recompute page-break indicator positions whenever content changes.
  useEffect(() => {
    if (!editor) return;
    const mirror = mirrorRef.current;
    const editorRoot = editor.view.dom as HTMLElement;
    if (!mirror || !editorRoot) return;

    const compute = () => {
      mirror.innerHTML = liveHtml || "";
      const eBlocks = Array.from(editorRoot.children) as HTMLElement[];
      const mBlocks = Array.from(mirror.children) as HTMLElement[];
      const count = Math.min(eBlocks.length, mBlocks.length);
      if (count === 0) { setBreaks([]); return; }

      const result: { top: number; page: number }[] = [];
      let pageNum = 1;
      let pageStart = 0;

      for (let i = 0; i < count; i++) {
        const mb = mBlocks[i];
        const bottom = mb.offsetTop + mb.offsetHeight;
        const capacity = pageNum === 1 ? PDF_FIRST_PAGE_CONTENT : PDF_PAGE_HEIGHT;
        if (bottom > pageStart + capacity && pageNum < 30) {
          const eb = eBlocks[i];
          result.push({ top: Math.max(0, eb.offsetTop - 4), page: pageNum + 1 });
          pageNum++;
          pageStart = mb.offsetTop;
        }
      }
      setBreaks(result);
    };

    // Give the browser a frame so images/fonts can layout.
    const raf = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(raf);
  }, [liveHtml, editor]);

  const label = useMemo(() => (lang === "ar" ? "الصفحة" : "Page"), [lang]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {editable && <NoteToolbar editor={editor} onInsertImageClick={onInsertImageClick} />}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", position: "relative" }}>
        <div style={{ position: "relative" }}>
          <EditorContent editor={editor} />
          <SlashMenu editor={editor} />
          {breaks.map((b, i) => (
            <div
              key={`${i}-${b.page}`}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: -8,
                right: -8,
                top: b.top,
                height: 0,
                borderTop: "2px dashed rgba(59, 130, 246, 0.55)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -11,
                  insetInlineEnd: 0,
                  background: "linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)",
                  color: "#fff",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  padding: "2px 10px",
                  borderRadius: 999,
                  boxShadow: "0 2px 6px rgba(59,130,246,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                {label} {b.page}
              </span>
            </div>
          ))}
        </div>
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
        .note-pdf-mirror h1 { font-size: 22px; font-weight: 800; margin: 14px 0 8px; }
        .note-pdf-mirror h2 { font-size: 18px; font-weight: 800; margin: 12px 0 6px; }
        .note-pdf-mirror h3 { font-size: 16px; font-weight: 700; margin: 10px 0 4px; }
        .note-pdf-mirror p { margin: 6px 0; }
        .note-pdf-mirror ul, .note-pdf-mirror ol { padding-inline-start: 24px; margin: 6px 0; }
        .note-pdf-mirror img { display: block; max-width: 70%; max-height: 380px; height: auto; margin: 12px auto; }
        .note-pdf-mirror pre { padding: 12px; }
        .note-editor-content .note-table, .note-pdf-mirror table { border-collapse: collapse; width: 100%; margin: 12px 0; table-layout: fixed; overflow: hidden; border-radius: 8px; }
        .note-editor-content .note-table td, .note-editor-content .note-table th,
        .note-pdf-mirror table td, .note-pdf-mirror table th { border: 1px solid var(--border); padding: 8px 10px; vertical-align: top; min-width: 40px; position: relative; }
        .note-editor-content .note-table th, .note-pdf-mirror table th { background: rgba(24,159,209,.15); font-weight: 700; text-align: start; }
        .note-editor-content .note-table .selectedCell { background: rgba(24,159,209,.2); }
        .note-editor-content hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
        .note-editor-content blockquote[data-callout="info"] { background: rgba(24,159,209,.10); border-inline-start: 3px solid #189FD1; border-radius: 8px; padding: 10px 14px; color: var(--foreground); }
      `}</style>
    </div>
  );
}
