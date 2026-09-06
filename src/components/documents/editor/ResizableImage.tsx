// Word-like resizable image node: keeps width + alignment on the node so the
// same size shows in the editor, the A4 preview, PDF, Word and the QR viewer.

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { editorIsReady } from "./useStableEditor";

export type ImgAlign = "left" | "center" | "right";

const MIN_W = 60;
/** Usable body width of the A4 sheet in px (matches the paper padding). */
const MAX_W = 700;

const marginFor = (align: ImgAlign) =>
  align === "center" ? "8px auto" : align === "right" ? "8px 0 8px auto" : "8px auto 8px 0";

export const ResizableImage = Image.extend({
  name: "image",
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as number | null,
        parseHTML: (el) => {
          const raw = (el as HTMLElement).getAttribute("width") || (el as HTMLElement).style.width;
          const n = parseInt(String(raw).replace("px", ""), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => {
          const w = attrs.width as number | null;
          if (!w) return {};
          return { width: String(Math.round(w)) };
        },
      },
      align: {
        default: "center" as ImgAlign,
        parseHTML: (el) => ((el as HTMLElement).getAttribute("data-align") as ImgAlign) || "center",
        renderHTML: (attrs) => ({ "data-align": (attrs.align as ImgAlign) || "center" }),
      },
      style: {
        default: null,
        // Inline style is what PDF/Word/print consume — rebuild it on render.
        renderHTML: (attrs) => {
          const w = attrs.width as number | null;
          const align = ((attrs.align as ImgAlign) || "center") satisfies ImgAlign;
          const bits = ["display:block", `margin:${marginFor(align)}`, "height:auto", "max-width:100%"];
          if (w) bits.push(`width:${Math.round(w)}px`);
          return { style: bits.join(";") };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

function ResizableImageView({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragAbortRef = useRef<AbortController | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const editable = editorIsReady(editor) && editor.isEditable;
  const align = ((node.attrs.align as ImgAlign) || "center") as ImgAlign;
  const width = (node.attrs.width as number | null) ?? null;

  useEffect(() => () => dragAbortRef.current?.abort(), []);

  const startDrag = useCallback(
    (e: React.PointerEvent, dir: 1 | -1) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const el = imgRef.current;
      if (!el) return;
      const startX = e.clientX;
      const startW = el.getBoundingClientRect().width;
      dragAbortRef.current?.abort();
      const dragAbort = new AbortController();
      dragAbortRef.current = dragAbort;
      setLive(Math.round(startW));

      const onMove = (ev: PointerEvent) => {
        if (!editorIsReady(editor)) return;
        const next = Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (ev.clientX - startX) * dir)));
        setLive(next);
        el.style.width = `${next}px`;
      };
      const onUp = (ev: PointerEvent) => {
        dragAbort.abort();
        if (dragAbortRef.current === dragAbort) dragAbortRef.current = null;
        if (!editorIsReady(editor)) return;
        const next = Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (ev.clientX - startX) * dir)));
        setLive(null);
        if (editorIsReady(editor)) updateAttributes({ width: next });
      };
      window.addEventListener("pointermove", onMove, { signal: dragAbort.signal });
      window.addEventListener("pointerup", onUp, { signal: dragAbort.signal });
    },
    [editable, editor, updateAttributes],
  );

  const update = (attrs: Record<string, unknown>) => {
    if (editorIsReady(editor)) updateAttributes(attrs);
  };
  const setPct = (pct: number) => update({ width: Math.round((MAX_W * pct) / 100) });

  return (
    <NodeViewWrapper
      className="doc-img-node"
      data-align={align}
      style={{ display: "flex", justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}
    >
      <div className={`doc-img-frame${selected ? " is-selected" : ""}`} style={{ width: width ? `${width}px` : undefined }}>
        <img
          ref={imgRef}
          src={String(node.attrs.src ?? "")}
          alt={String(node.attrs.alt ?? "")}
          title={String(node.attrs.title ?? "")}
          draggable={false}
          style={{ width: width ? `${width}px` : "60%", height: "auto", maxWidth: "100%", display: "block" }}
        />

        {editable && selected && (
          <>
            <span className="doc-img-h tl" onPointerDown={(e) => startDrag(e, -1)} />
            <span className="doc-img-h tr" onPointerDown={(e) => startDrag(e, 1)} />
            <span className="doc-img-h bl" onPointerDown={(e) => startDrag(e, -1)} />
            <span className="doc-img-h br" onPointerDown={(e) => startDrag(e, 1)} />
            {live != null && <span className="doc-img-size">{live}px</span>}
            <div className="doc-img-bar" contentEditable={false}>
              {[25, 50, 75, 100].map((p) => (
                <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setPct(p)}>
                  {p}%
                </button>
              ))}
              <i />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => update({ align: "left" })}>
                <AlignLeft size={13} />
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => update({ align: "center" })}>
                <AlignCenter size={13} />
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => update({ align: "right" })}>
                <AlignRight size={13} />
              </button>
              <i />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (editorIsReady(editor)) deleteNode(); }}>
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const IMAGE_MAX_WIDTH = MAX_W;
