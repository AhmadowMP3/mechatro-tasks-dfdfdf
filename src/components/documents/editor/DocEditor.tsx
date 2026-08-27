// Word-style document editor: a sticky ribbon over a real A4 sheet that shows
// the branded letterhead (header + footer from the template) around a freely
// editable body — what you type is exactly what the PDF prints.

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontSize, FontFamily } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { ResizableImage, IMAGE_MAX_WIDTH } from "./ResizableImage";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";

import { Ribbon } from "./Ribbon";
import { PageBreak, DocField, ItemsTable } from "./extensions";
import { BlockFormat } from "./text-attrs";
import { DocClientCard } from "../DocBody";
import { DocPaper } from "../DocPaper";
import { fieldValue, termsBlockHtml, type RichCtx } from "@/lib/docs/rich";
import { snippetHtml, type SnippetId } from "@/lib/docs/snippets";
import { docBlocks, blockLabel, type DocBlock } from "@/lib/docs/blocks";
import type { DocClient, LogoVariant } from "@/lib/docs/model";
import type { DocFooter, DocHeader, DocLang, DocTheme } from "@/lib/docs/types";
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
  /** Letterhead chrome drawn around the editable body. */
  header: DocHeader;
  footer: DocFooter;
  logoVariant?: LogoVariant;
  onLogoVariant?: (v: LogoVariant) => void;
  /** Terms & conditions from the type template, inserted on demand. */
  terms?: { ar: string; en: string };
  /** Save / export / preview buttons pinned to the ribbon. */
  actions?: React.ReactNode;
};

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function DocEditor({
  html, onChange, lang, theme, currency, meta, showClientBox, client,
  header, footer, logoVariant, onLogoVariant, terms, actions,
}: Props) {
  const ar = lang === "ar";
  const lastEmitted = useRef(html);
  const [library, setLibrary] = useState<DocBlock[]>([]);

  // Shared reusable blocks composed in the template settings.
  useEffect(() => {
    let alive = true;
    docBlocks.list().then((b) => { if (alive && b) setLibrary(b); }).catch(() => {});
    return () => { alive = false; };
  }, []);


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
        ResizableImage.configure({ inline: false, allowBase64: true }),
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
      if (src.startsWith("data:image/")) {
        editor
          ?.chain()
          .focus()
          .setImage({ src, width: Math.round(IMAGE_MAX_WIDTH * 0.6), align: "center" } as { src: string })
          .run();
      }
    };
    reader.readAsDataURL(file);
  };

  const templateTerms = (lang === "ar" ? terms?.ar : terms?.en) ?? "";

  const insertSnippet = (id: SnippetId) => {
    const block = snippetHtml(id, lang, templateTerms);
    if (block) editor?.chain().focus().insertContent(block).run();
  };

  return (
    <div className="doc-editor">
      <Ribbon
        editor={editor}
        lang={lang}
        onImage={insertImage}
        onSnippet={insertSnippet}
        blocks={library.map((b) => ({ id: b.id, label: blockLabel(b, lang), html: b.html }))}
        onBlock={(blockHtml) => editor?.chain().focus().insertContent(blockHtml).run()}
        logoVariant={logoVariant}
        onLogoVariant={onLogoVariant}
        actions={actions}
        onInsertTerms={
          templateTerms.trim()
            ? () => {
                const block = termsBlockHtml(lang, templateTerms);
                if (block) editor?.chain().focus().insertContent(block).run();
              }
            : undefined
        }
      />
      <div className="doc-editor-canvas">
        <div className="doc-editor-paper">
          <DocPaper
            header={header}
            footer={footer}
            lang={lang}
            theme={theme}
            meta={meta}
            logoVariant={logoVariant}
            page={{ current: 1, total: 1 }}
          >
            {showClientBox && (
              <div style={{ marginBottom: 14 }}>
                <DocClientCard client={client} lang={lang} theme={theme} />
              </div>
            )}
            <EditorContent editor={editor} />
          </DocPaper>
        </div>
      </div>
    </div>
  );
}
