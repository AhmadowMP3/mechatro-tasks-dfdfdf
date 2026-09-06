// Measures the editable body against the A4 sheets drawn behind it and keeps
// the page spacers (and the page count) in sync with what the PDF will print.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { A4 } from "../DocPaper";
import { editorIsReady } from "./useStableEditor";
import { SHEET_GAP, readSpacers, sameSpacers, writeSpacers, type PageSpacer } from "./pagination";

export type PageGeometry = { top: number; left: number; width: number; height: number };

const PITCH = A4.height + SHEET_GAP;
const MAX_PASSES = 6;

export function usePageLayout(editor: Editor | null, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [pages, setPages] = useState(1);
  const [geo, setGeo] = useState<PageGeometry | null>(null);
  const passes = useRef(0);
  const frame = useRef<number | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || !editorIsReady(editor)) return;
    const body = container.querySelector<HTMLElement>(".pdf-flow");
    const flow = container.querySelector<HTMLElement>(".doc-editor-flow");
    if (!body || !flow) return;

    const cRect = container.getBoundingClientRect();
    const bRect = body.getBoundingClientRect();
    const next: PageGeometry = {
      top: bRect.top - cRect.top,
      left: bRect.left - cRect.left,
      width: bRect.width,
      height: bRect.height,
    };
    setGeo((prev) =>
      prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
        ? prev
        : next,
    );

    const H = next.height;
    if (H < 120) return;

    const dom = editor.view.dom as HTMLElement;
    const flowTop = flow.getBoundingClientRect().top;
    const blocks = Array.from(dom.children).filter((el): el is HTMLElement => el instanceof HTMLElement);

    // Map each rendered top-level block to its document position.
    const positions: number[] = [];
    let pos = 0;
    editor.state.doc.forEach((node) => {
      positions.push(pos);
      pos += node.nodeSize;
    });

    const spacers: PageSpacer[] = [];
    let shift = 0;
    let forceNext = false;
    let lastBottom = 0;

    blocks.forEach((el, i) => {
      if (el.classList.contains("doc-page-spacer")) return;
      const r = el.getBoundingClientRect();
      let top = r.top - flowTop + shift;
      const h = r.height;
      const p = positions[i];

      const pushTo = (target: number) => {
        const need = target - top;
        if (need <= 0.5 || p === undefined) return;
        spacers.push({ pos: p, h: need });
        shift += need;
        top += need;
      };

      let k = Math.max(0, Math.floor(top / PITCH));
      if (forceNext && top > k * PITCH + 1) {
        pushTo((k + 1) * PITCH);
        k += 1;
      } else if (top > k * PITCH + H - 1) {
        // Landed inside the gap between two sheets.
        pushTo((k + 1) * PITCH);
        k += 1;
      } else if (h <= H && top + h > k * PITCH + H + 0.5 && top > k * PITCH + 1) {
        // Would be cut by the sheet edge — move the whole block down.
        pushTo((k + 1) * PITCH);
        k += 1;
      }

      forceNext = el.hasAttribute("data-page-break") || !!el.querySelector("[data-page-break], .doc-page-break-mark");
      lastBottom = Math.max(lastBottom, top + h);
    });

    const needed = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / PITCH) + 1);
    setPages((prev) => (prev === needed ? prev : needed));

    if (!sameSpacers(readSpacers(editor), spacers)) {
      writeSpacers(editor, spacers);
      if (passes.current < MAX_PASSES) {
        passes.current += 1;
        frame.current = requestAnimationFrame(measure);
        return;
      }
    }
    passes.current = 0;
  }, [editor, containerRef]);

  const schedule = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    passes.current = 0;
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    schedule();
  });

  useEffect(() => {
    if (!editorIsReady(editor)) return;
    const onUpdate = () => schedule();
    editor.on("update", onUpdate);
    const dom = editor.view.dom as HTMLElement;
    const ro = new ResizeObserver(() => schedule());
    ro.observe(dom);
    const imgs = () => dom.querySelectorAll("img");
    imgs().forEach((img) => img.addEventListener("load", onUpdate));
    window.addEventListener("resize", onUpdate);
    // Fonts and late-loading images change block heights — re-measure then.
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => schedule());
    return () => {
      editor.off("update", onUpdate);
      ro.disconnect();
      imgs().forEach((img) => img.removeEventListener("load", onUpdate));
      window.removeEventListener("resize", onUpdate);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [editor, schedule]);

  return { pages, geo };
}
