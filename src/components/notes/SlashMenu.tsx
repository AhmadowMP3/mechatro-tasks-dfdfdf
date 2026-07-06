import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import type { Editor } from "@tiptap/react";
import {
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Minus,
  Table as TableIcon, Code, MessageSquare, FileText,
} from "lucide-react";

export type SlashItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  run: (editor: Editor) => void;
};

export function buildSlashItems(t: (k: never) => string): SlashItem[] {
  return [
    { key: "h1", label: t("slashInsertH1" as never), icon: <Heading1 size={18} />, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: "h2", label: t("slashInsertH2" as never), icon: <Heading2 size={18} />, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "h3", label: t("slashInsertH3" as never), icon: <Heading3 size={18} />, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: "bul", label: t("slashInsertBullet" as never), icon: <List size={18} />, run: (e) => e.chain().focus().toggleBulletList().run() },
    { key: "ord", label: t("slashInsertOrdered" as never), icon: <ListOrdered size={18} />, run: (e) => e.chain().focus().toggleOrderedList().run() },
    { key: "task", label: t("slashInsertTask" as never), icon: <ListChecks size={18} />, run: (e) => e.chain().focus().toggleTaskList().run() },
    { key: "quote", label: t("slashInsertQuote" as never), icon: <Quote size={18} />, run: (e) => e.chain().focus().toggleBlockquote().run() },
    { key: "div", label: t("slashInsertDivider" as never), icon: <Minus size={18} />, run: (e) => e.chain().focus().setHorizontalRule().run() },
    {
      key: "table", label: t("slashInsertTable" as never), icon: <TableIcon size={18} />,
      run: (e) => (e.chain().focus() as unknown as { insertTable: (o: { rows: number; cols: number; withHeaderRow: boolean }) => { run: () => void } }).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { key: "code", label: t("slashInsertCode" as never), icon: <Code size={18} />, run: (e) => e.chain().focus().toggleCodeBlock().run() },
    {
      key: "callout", label: t("slashInsertCallout" as never), icon: <MessageSquare size={18} />,
      run: (e) => e.chain().focus().insertContent('<blockquote data-callout="info"><p>💡 </p></blockquote>').run(),
    },
  ];
}

/** Popup that fires when the user types `/` at the start of a block. */
export function SlashMenu({ editor }: { editor: Editor | null }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const anchorPos = useRef<number>(0);

  const items = buildSlashItems(t as never);
  const filtered = query
    ? items.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      const { $from } = editor.state.selection;
      const beforeText = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
      const match = /(^|\s)\/([\w\p{L}]*)$/u.exec(beforeText);
      if (!match) { setOpen(false); return; }
      // Position popup near the caret
      const coords = editor.view.coordsAtPos($from.pos);
      const editorRect = (editor.view.dom as HTMLElement).getBoundingClientRect();
      setPos({ top: coords.bottom - editorRect.top + 6, left: coords.left - editorRect.left });
      setQuery(match[2]);
      anchorPos.current = $from.pos - match[2].length - 1; // position of the "/"
      setActive(0);
      setOpen(true);
    };
    editor.on("selectionUpdate", onUpdate);
    editor.on("update", onUpdate);
    return () => {
      editor.off("selectionUpdate", onUpdate);
      editor.off("update", onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (!open || !editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[active];
        if (item) run(item);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, active, filtered, editor]);

  const run = (item: (typeof items)[number]) => {
    if (!editor) return;
    const from = anchorPos.current;
    const to = editor.state.selection.$from.pos;
    editor.chain().focus().deleteRange({ from, to }).run();
    item.run(editor);
    setOpen(false);
  };

  if (!open || !pos || filtered.length === 0) return null;

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={{
        position: "absolute", top: pos.top, left: pos.left,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.4)",
        padding: 6, zIndex: 40, minWidth: 240, maxHeight: 320, overflow: "auto",
      }}
    >
      {filtered.map((it, i) => (
        <button
          key={it.key}
          onMouseDown={(e) => { e.preventDefault(); run(it); }}
          onMouseEnter={() => setActive(i)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", background: i === active ? "rgba(59,130,246,.18)" : "transparent",
            border: "none", borderRadius: 8, color: "var(--foreground)",
            cursor: "pointer", fontSize: 13, textAlign: "start",
          }}
        >
          <span style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", borderRadius: 6, color: "#189FD1" }}>{it.icon}</span>
          <span style={{ fontWeight: 600 }}>{it.label}</span>
        </button>
      ))}
      <div style={{ padding: "6px 10px 2px", fontSize: 10.5, color: "var(--muted)", display: "flex", gap: 12 }}>
        <span><FileText size={10} style={{ display: "inline", verticalAlign: "middle" }} /> ↑↓ Enter</span>
      </div>
    </div>
  );
}
