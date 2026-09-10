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
import { TableRow } from "@tiptap/extension-table-row";
import { GeometryTable, ShadedTableCell, ShadedTableHeader } from "./table-cells";

import { Ribbon } from "./Ribbon";
import { PageBreak, DocField, ItemsTable, DivBlock, DocEditorCtxProvider } from "./extensions";
import { BlockFormat, InlineStyle, Superscript, Subscript } from "./text-attrs";
import { DocClientCard } from "../DocBody";
import { DocPaper } from "../DocPaper";
import { fieldValue, termsBlockHtml, type RichCtx } from "@/lib/docs/rich";
import { snippetHtml, type SnippetId } from "@/lib/docs/snippets";
import { docBlocks, blockLabel, type DocBlock } from "@/lib/docs/blocks";
import type { DocClient, LogoVariant } from "@/lib/docs/model";
import { PAPER, type DocFooter, type DocHeader, type DocLang, type DocSection, type DocTheme } from "@/lib/docs/types";
import { A4_SIZE, HEADER_GAP_PX, FOOTER_GAP_PX, type PageChrome } from "@/lib/docs/geometry";
import { useDocPages } from "./useDocPages";
import type { DocPageModel } from "@/lib/docs/page-model-cache";

import { clampSpacer, pageSpacerKey, pageSpacerPlugin, type SpacerMap } from "./page-spacers";
import { toast } from "sonner";
import { editorIsReady, useStableEditor } from "./useStableEditor";

/** Vertical gap between two sheets on screen. */
const PAGE_GAP_PX = 24;


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
  /** The computed page model, published so preview and PDF reuse it. */
  onPageModel?: (model: DocPageModel) => void;
};


const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function DocEditor({
  html, onChange, lang, theme, currency, meta, showClientBox, client,
  header, footer, section, logoVariant, onLogoVariant, onLang, onTheme, terms, actions, onPageModel,
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
      GeometryTable.configure({ resizable: true }),
      TableRow,
      ShadedTableHeader,
      ShadedTableCell,
      Placeholder.configure({
        placeholder: () => (langRef.current === "ar" ? "ابدأ الكتابة داخل المستند…" : "Start typing inside the document…"),
      }),
      PageBreak,
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

  /* ── Live A4 pages ───────────────────────────────────────────────────── */

  const pagesRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const clientBoxRef = useRef<HTMLDivElement | null>(null);
  const spacers = useRef<SpacerMap>(new Map());

  const [chrome, setChrome] = useState<PageChrome | null>(null);
  const [bodyRect, setBodyRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [reservePx, setReservePx] = useState(0);

  // Chrome heights + the exact box the body writes in, read from sheet one.
  useEffect(() => {
    const measure = () => {
      const sheet = sheetRef.current;
      const pagesEl = pagesRef.current;
      if (!sheet || !pagesEl) return;
      const body = sheet.querySelector("[data-doc-body-content]") as HTMLElement | null;
      if (!body) return;
      const s = sheet.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      const p = pagesEl.getBoundingClientRect();
      const nextChrome: PageChrome = {
        headerPx: Math.max(0, b.top - s.top - HEADER_GAP_PX),
        footerPx: Math.max(0, s.bottom - b.bottom - FOOTER_GAP_PX),
        qrPx: 0,
      };
      setChrome((prev) =>
        prev && Math.abs(prev.headerPx - nextChrome.headerPx) < 0.5 && Math.abs(prev.footerPx - nextChrome.footerPx) < 0.5
          ? prev
          : nextChrome,
      );
      const rect = { top: b.top - p.top, left: b.left - p.left, width: b.width };
      setBodyRect((prev) =>
        prev && Math.abs(prev.top - rect.top) < 0.5 && Math.abs(prev.left - rect.left) < 0.5 && Math.abs(prev.width - rect.width) < 0.5
          ? prev
          : rect,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (pagesRef.current) ro.observe(pagesRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [lang, theme, header, footer, section, logoVariant]);

  // The client card lives in the editable layer but not in the block model:
  // reserve its height on page one.
  useEffect(() => {
    const el = clientBoxRef.current;
    if (!showClientBox || !el) { setReservePx(0); return; }
    const measure = () => setReservePx((prev) => {
      const h = el.getBoundingClientRect().height;
      return Math.abs(prev - h) < 0.5 ? prev : h;
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showClientBox, client, lang, theme]);

  const docPages = useDocPages(
    editorIsReady(editor) ? editor : null,
    chrome,
    { reservePx, header, section },
  );
  const { pageModel, clampedImages, pageStartNodes } = docPages;
  const pageCount = Math.max(1, pageModel.pages.length);

  // Publish the model: the preview and the PDF render from this exact split.
  const onPageModelRef = useRef(onPageModel);
  onPageModelRef.current = onPageModel;
  useEffect(() => { onPageModelRef.current?.(docPages); }, [docPages]);


  // One spacer decoration plugin, fed from a ref so heights can be tuned
  // without rebuilding the editor.
  useEffect(() => {
    if (!editorIsReady(editor)) return;
    editor.registerPlugin(pageSpacerPlugin(() => spacers.current));
    return () => {
      try { editor.unregisterPlugin(pageSpacerKey); } catch { /* view already gone */ }
    };
  }, [editor]);

  // Tune each spacer until the first block of every page sits exactly on that
  // page's body top. Heights only ever grow or shrink towards >= 0.
  useEffect(() => {
    if (!editorIsReady(editor)) return;
    let frame = 0;
    let passes = 0;

    const repaint = () => {
      if (!editorIsReady(editor)) return;
      try {
        editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
      } catch { /* the view can be gone during unmount */ }
    };

    const pass = () => {
      if (!editorIsReady(editor)) return;
      const flow = flowRef.current;
      if (!flow) return;
      const flowTop = flow.getBoundingClientRect().top;
      const active = new Set<number>();
      let changed = false;

      pageStartNodes.forEach((nodeIndex, pageIndex) => {
        if (pageIndex === 0 || nodeIndex < 0) return;
        const dom = topLevelDom(editor, nodeIndex);
        if (!dom) return;
        active.add(nodeIndex);
        const desired = pageIndex * (A4_SIZE.height + PAGE_GAP_PX);
        const current = dom.getBoundingClientRect().top - flowTop;
        const previous = spacers.current.get(nodeIndex) ?? 0;
        const next = clampSpacer(previous + (desired - current), nodeIndex);
        if (Math.abs(next - previous) > 0.5) {
          spacers.current.set(nodeIndex, next);
          changed = true;
        }
      });

      for (const key of Array.from(spacers.current.keys())) {
        if (!active.has(key)) {
          spacers.current.delete(key);
          changed = true;
        }
      }

      if (changed) {
        repaint();
        passes += 1;
        if (passes < 6) frame = requestAnimationFrame(pass);
      }
    };

    frame = requestAnimationFrame(pass);
    return () => cancelAnimationFrame(frame);
  }, [editor, pageStartNodes, chrome, reservePx, html]);

  const clampedNotice = clampedImages.length > 0
    ? ar
      ? `تم تصغير ${clampedImages.length} صورة لتناسب الصفحة`
      : `${clampedImages.length} image(s) scaled down to fit the page`
    : null;

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
      {clampedNotice && <div className="doc-editor-notice">{clampedNotice}</div>}
      <div className="doc-editor-canvas">
        <div
          className="doc-editor-pages"
          ref={pagesRef}
          style={{ height: pageCount * A4_SIZE.height + (pageCount - 1) * PAGE_GAP_PX }}
        >
          {Array.from({ length: pageCount }, (_, i) => (
            <div
              key={i}
              ref={i === 0 ? sheetRef : undefined}
              className="doc-editor-sheet"
              style={{ top: i * (A4_SIZE.height + PAGE_GAP_PX) }}
            >
              <DocPaper
                header={header}
                section={section}
                footer={footer}
                lang={lang}
                theme={theme}
                meta={meta}
                logoVariant={logoVariant}
                page={{ current: i + 1, total: pageCount }}
                sizing="fixed"
              />
            </div>
          ))}

          {bodyRect && (
            <div
              className="doc-editor-layer"
              style={{ top: bodyRect.top, insetInlineStart: bodyRect.left, width: bodyRect.width }}
            >
              <div
                className="doc-editor-flow doc-paper-body"
                ref={flowRef}
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  overflowWrap: "anywhere",
                  color: paper.ink,
                  caretColor: paper.ink,
                  direction: ar ? "rtl" : "ltr",
                  textAlign: ar ? "right" : "left",
                  fontFamily: "'Montserrat Arabic', 'Almarai', 'Montserrat', system-ui, sans-serif",
                }}
              >
                {showClientBox && (
                  <div ref={clientBoxRef} style={{ marginBottom: 14 }}>
                    <DocClientCard client={client} lang={lang} theme={theme} />
                  </div>
                )}
                <DocEditorCtxProvider value={{ lang, currency }}>
                  <EditorContent editor={editor} />
                </DocEditorCtxProvider>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** DOM node of the nth top-level block in the editor. */
function topLevelDom(editor: Editor, nodeIndex: number): HTMLElement | null {
  let offset = 0;
  let index = 0;
  let found: number | null = null;
  editor.state.doc.forEach((_node, pos) => {
    if (index === nodeIndex) found = pos;
    index += 1;
    offset = pos;
  });
  void offset;
  if (found === null) return null;
  try {
    const dom = editor.view.nodeDOM(found);
    return dom instanceof HTMLElement ? dom : null;
  } catch {
    return null;
  }
}

