// Word-style document editor: a sticky ribbon over a real A4 sheet that shows
// the branded letterhead (header + footer from the template) around a freely
// editable body — what you type is exactly what the PDF prints.

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { Editor } from "@tiptap/core";
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
import { PageBreak, DocField, ItemsTable, DivBlock, DocEditorCtxProvider } from "./extensions";
import { BlockFormat, InlineStyle, Superscript, Subscript } from "./text-attrs";
import { DocClientCard } from "../DocBody";
import { DocPaper } from "../DocPaper";
import { fieldValue, termsBlockHtml, type RichCtx } from "@/lib/docs/rich";
import { snippetHtml, type SnippetId } from "@/lib/docs/snippets";
import { docBlocks, blockLabel, type DocBlock } from "@/lib/docs/blocks";
import type { DocClient, LogoVariant } from "@/lib/docs/model";
import { PAPER, resolveMargins, type DocFooter, type DocHeader, type DocLang, type DocSection, type DocTheme } from "@/lib/docs/types";
import { toast } from "sonner";
import { editorIsReady, useStableEditor } from "./useStableEditor";
import { PageLayout, SHEET_GAP } from "./pagination";
import { usePageLayout } from "./usePageLayout";
import { A4 } from "../DocPaper";

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
  /** Page setup imported from the original Word file (wins over the template). */
  section?: DocSection | null;
  logoVariant?: LogoVariant;
  onLogoVariant?: (v: LogoVariant) => void;
  /** Live language / theme switches shown in the ribbon. */
  onLang?: (v: DocLang) => void;
  onTheme?: (v: DocTheme) => void;
  /** Terms & conditions from the type template, inserted on demand. */
  terms?: { ar: string; en: string };
  /** Save / export / preview buttons pinned to the ribbon. */
  actions?: React.ReactNode;
};

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function DocEditor({
  html, onChange, lang, theme, currency, meta, showClientBox, client,
  header, footer, logoVariant, onLogoVariant, onLang, onTheme, terms, actions,
}: Props) {
  const ar = lang === "ar";
  const paper = PAPER[theme];
  const lastEmitted = useRef(html);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [library, setLibrary] = useState<DocBlock[]>([]);

  // Shared reusable blocks composed in the template settings.
  useEffect(() => {
    let alive2 = true;
    docBlocks.list().then((b) => { if (alive2 && b) setLibrary(b); }).catch(() => {});
    return () => { alive2 = false; };
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

  // Live values the extensions read without ever being rebuilt.
  const langRef = useRef(lang);
  langRef.current = lang;
  const currencyRef = useRef(currency);
  currencyRef.current = currency;
  const fieldValuesRef = useRef(fieldValues);
  fieldValuesRef.current = fieldValues;

  // The extension list is created exactly once: rebuilding it would destroy
  // the editor mid-render, which is what used to blank the page when the
  // document language changed.
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
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: () => (langRef.current === "ar" ? "ابدأ الكتابة داخل المستند…" : "Start typing inside the document…"),
      }),
      PageBreak,
      PageLayout,
      DocField.configure({
        lang: langRef.current,
        values: {},
        getLang: () => langRef.current,
        getValues: () => fieldValuesRef.current,
      }),
      ItemsTable.configure({ lang: langRef.current, currency: currencyRef.current }),
    ],
    [],
  );

  const editor = useStableEditor(
    () => new Editor({
      extensions,
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
        onChangeRef.current(next);
      },
    }),
  );

  // Keep external resets (legacy conversion, template apply, undo from parent)
  // in sync without clobbering what is being typed.
  useEffect(() => {
    if (!editorIsReady(editor)) return;
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
  }, [editor, html]);

  // Language / currency / meta changes are applied in place — no rebuild, so
  // typing, cursor position and undo history all survive the switch.
  useEffect(() => {
    if (!editorIsReady(editor)) return;
    editor.setOptions({
      editorProps: {
        attributes: { class: "doc-rich doc-rich-editable", dir: ar ? "rtl" : "ltr", spellcheck: "false" },
      },
    });
    // Repaint decorations (placeholder, chips) without touching undo history.
    try {
      editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
    } catch {
      /* the view can be gone during an unmount — nothing to repaint then */
    }
  }, [editor, lang, currency, ar, fieldValues]);

  const insertImage = (file: File) => {
    if (!editorIsReady(editor)) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(ar ? "حجم الصورة أكبر من 3 ميغابايت" : "Image is larger than 3 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (!editorIsReady(editor)) return;
      if (src.startsWith("data:image/")) {
        editor
          .chain()
          .focus()
          .setImage({ src, width: Math.round(IMAGE_MAX_WIDTH * 0.6), align: "center" } as { src: string })
          .run();
      }
    };
    reader.readAsDataURL(file);
  };

  const templateTerms = (lang === "ar" ? terms?.ar : terms?.en) ?? "";

  const insert = (content: string) => {
    if (!editorIsReady(editor) || !content) return;
    editor.chain().focus().insertContent(content).run();
  };

  const insertSnippet = (id: SnippetId) => insert(snippetHtml(id, lang, templateTerms) ?? "");

  // Live A4 pagination: how many sheets to paint and where the body sits.
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const { pages, geo, repeats } = usePageLayout(editor, pagesRef);
  const fallbackWidth = A4.width - 2 * pageMarginsPx(header).side;

  // The writing layer is never clipped: content must always stay readable.
  // Anything that would land past the body band is pushed to the next sheet by
  // usePageLayout instead of being masked away (masking made text vanish).



  return (
    <div className="doc-editor">
      <Ribbon
        editor={editorIsReady(editor) ? editor : null}
        lang={lang}
        theme={theme}
        onLang={onLang}
        onTheme={onTheme}
        onImage={insertImage}
        onSnippet={insertSnippet}
        blocks={library.map((b) => ({ id: b.id, label: blockLabel(b, lang), html: b.html }))}
        onBlock={(blockHtml) => insert(blockHtml)}
        logoVariant={logoVariant}
        onLogoVariant={onLogoVariant}
        actions={actions}
        onInsertTerms={templateTerms.trim() ? () => insert(termsBlockHtml(lang, templateTerms) ?? "") : undefined}
      />
      <div className="doc-editor-canvas">
        <div className="doc-editor-pages" ref={pagesRef}>
          {/* Stacked A4 sheets painted behind the editable layer */}
          <div className="doc-editor-sheets" aria-hidden>
            {Array.from({ length: pages }, (_, i) => (
              <div key={i} className="doc-editor-sheet-slot" style={{ marginBottom: i === pages - 1 ? 0 : SHEET_GAP }}>
                <DocPaper
                  header={header}
                  footer={footer}
                  lang={lang}
                  theme={theme}
                  meta={meta}
                  logoVariant={logoVariant}
                  page={{ current: i + 1, total: pages }}
                  sizing="fixed"
                />
              </div>
            ))}
          </div>

          {/* The single continuous editable body, laid over the sheets */}
          <div
            className="doc-editor-flow doc-paper-body"
            style={{
              position: "absolute",
              top: geo?.top ?? 0,
              left: geo?.left ?? 0,
              width: geo?.width ?? fallbackWidth,
              maxWidth: geo?.width ?? fallbackWidth,
              fontSize: 12.5,
              lineHeight: 1.7,
              overflowWrap: "anywhere",
              // Same ink, font and direction as the printed sheet body.
              color: paper.ink,
              caretColor: paper.ink,
              direction: ar ? "rtl" : "ltr",
              textAlign: ar ? "right" : "left",
              fontFamily: "'Montserrat Arabic', 'Almarai', 'Montserrat', system-ui, sans-serif",
              zIndex: 2,
              visibility: geo ? "visible" : "hidden",
            }}
          >

            {showClientBox && (
              <div style={{ marginBottom: 14 }}>
                <DocClientCard client={client} lang={lang} theme={theme} />
              </div>
            )}
            <DocEditorCtxProvider value={{ lang, currency }}>
              <EditorContent editor={editor} />
            </DocEditorCtxProvider>

            {/* Table headers repainted at the top of continuation sheets */}
            {repeats.map((r) => (
              <div
                key={r.id}
                className="doc-row-head-repeat doc-rich"
                aria-hidden
                style={{ top: r.top, width: r.width }}
                dangerouslySetInnerHTML={{ __html: r.html }}
              />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
