// Word-style document editor: a ribbon over a real A4 sheet with the branded
// header/footer chrome around a freely editable body.

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontSize, FontFamily } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";

import { Ribbon } from "./Ribbon";
import { PageBreak, DocField, ItemsTable } from "./extensions";
import { BlockFormat } from "./text-attrs";
import { DocClientCard } from "../DocBody";
import { fieldValue, type RichCtx } from "@/lib/docs/rich";
import type { DocClient } from "@/lib/docs/model";
import { PAPER, type DocLang, type DocTheme } from "@/lib/docs/types";
import { toast } from "sonner";

type Props = {
  html: string;
  onChange: (html: string) => void;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  meta: RichCtx["meta"];
  showClientBox: boolean;
  client: DocClient;
};

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function DocEditor({ html, onChange, lang, theme, currency, meta, showClientBox, client }: Props) {
  const ar = lang === "ar";
  const palette = PAPER[theme];
  const lastEmitted = useRef(html);

  const ctx = useMemo<RichCtx>(() => ({ lang, theme, currency, meta }), [lang, theme, currency, meta]);
  const fieldValues = useMemo(() => {
    const totals = { subtotal: 0, tax: 0, grand: 0 };
    const out: Record<string, string> = {};
    for (const key of ["number", "date", "validUntil", "client", "currency"]) {
      out[key] = fieldValue(key, ctx, totals);
    }
    return out;
  }, [ctx]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
        Underline,
        TextStyle,
        Color,
        FontSize,
        FontFamily,
        BlockFormat,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow" } }),
        Image.configure({ inline: false, allowBase64: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder: ar ? "ابدأ الكتابة داخل المستند…" : "Start typing inside the document…" }),
        PageBreak,
        DocField.configure({ lang, values: fieldValues }),
        ItemsTable.configure({ lang, currency }),
      ],
      content: html || "<p></p>",
      editorProps: {
        attributes: {
          class: "doc-rich doc-rich-editable",
          dir: ar ? "rtl" : "ltr",
          spellcheck: "false",
        },
      },
      onUpdate: ({ editor: e }) => {
        const next = e.getHTML();
        lastEmitted.current = next;
        onChange(next);
      },
    },
    [lang, currency],
  );

  // Keep external resets (legacy conversion, template apply, undo from parent)
  // in sync without clobbering what is being typed.
  useEffect(() => {
    if (!editor) return;
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
  }, [editor, html]);

  // Refresh auto-field chips when meta/currency changes.
  useEffect(() => {
    if (!editor) return;
    const ext = editor.extensionManager.extensions.find((x) => x.name === "docField");
    if (ext) (ext.options as { lang: DocLang; values: Record<string, string> }).values = fieldValues;
    editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  }, [editor, fieldValues]);

  const insertImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(ar ? "حجم الصورة أكبر من 3 ميغابايت" : "Image is larger than 3 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (src.startsWith("data:image/")) editor?.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="doc-editor">
      <Ribbon editor={editor} lang={lang} onImage={insertImage} />
      <div className="doc-editor-canvas">
        <div
          className="doc-editor-sheet"
          dir={ar ? "rtl" : "ltr"}
          style={{ background: palette.bg, color: palette.ink }}
        >
          {showClientBox && (
            <div style={{ marginBottom: 14 }}>
              <DocClientCard client={client} lang={lang} theme={theme} />
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
