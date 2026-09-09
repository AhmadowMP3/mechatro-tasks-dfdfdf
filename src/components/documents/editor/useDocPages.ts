// The editor is the ONLY place the page model is computed.
//
// Watch the TipTap document → convert it to the canonical model (Phase 1) →
// measure it off-screen (Phase 3b) → decide the breaks (Phase 3c). Nothing
// here touches the DOM of the editor itself.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

import { fromTipTapJSON, type DocBlock } from "@/lib/docs/doc-model";
import { onFontsReady } from "@/lib/docs/measure";
import { buildPageModel, type DocPageModel } from "@/lib/docs/page-model-cache";
import type { PageChrome } from "@/lib/docs/geometry";
import type { DocHeader, DocSection } from "@/lib/docs/types";

export type ClampedImage = { blockIndex: number; scale: number };

export type DocPages = DocPageModel;

const EMPTY: DocPages = {
  pageModel: { pages: [{ parts: [], usedPx: 0 }], scaledImages: [] },
  clampedImages: [],
  pageStartNodes: [-1],
};

const DEBOUNCE_MS = 120;


type JSONNode = { type?: string; content?: JSONNode[] };

/** Blocks of the document, each remembering the top-level node it came from. */
function blocksByNode(editor: Editor): { blocks: DocBlock[]; nodeOfBlock: number[] } {
  const json = editor.getJSON() as JSONNode;
  const blocks: DocBlock[] = [];
  const nodeOfBlock: number[] = [];
  (json.content ?? []).forEach((node, index) => {
    const converted = fromTipTapJSON({ type: "doc", content: [node] }).blocks;
    for (const block of converted) {
      blocks.push(block);
      nodeOfBlock.push(index);
    }
  });
  return { blocks, nodeOfBlock };
}

/**
 * Live page model of the editable document.
 *
 * `reservePx` is space consumed at the top of page 1 by chrome that lives
 * inside the editable layer but outside the model (the client card).
 */
export function useDocPages(
  editor: Editor | null,
  chrome: PageChrome | null,
  opts: { reservePx?: number; header?: DocHeader | null; section?: DocSection | null } = {},
): DocPages {
  const { reservePx = 0, header = null, section = null } = opts;
  const [pages, setPages] = useState<DocPages>(EMPTY);
  const runRef = useRef(0);
  const lastRef = useRef<DocPages>(EMPTY);

  const headerPx = chrome?.headerPx ?? 0;
  const footerPx = chrome?.footerPx ?? 0;
  const qrPx = chrome?.qrPx ?? 0;
  const marginKey = `${header?.marginSide ?? ""}|${header?.marginTop ?? ""}|${header?.marginBottom ?? ""}|${section?.marginTopPx ?? ""}`;

  const compute = useCallback(async () => {
    if (!editor || editor.isDestroyed || !chrome) return;
    const id = ++runRef.current;

    const { blocks, nodeOfBlock } = blocksByNode(editor);

    let next: DocPages;
    try {
      next = await buildPageModel({
        blocks,
        nodeOfBlock,
        chrome: { headerPx, footerPx, qrPx },
        header,
        section,
        reservePx,
      });
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[docs] pagination failed", err);
      return;
    }
    if (id !== runRef.current || editor.isDestroyed) return;

    const prev = lastRef.current;
    const same =
      prev.pageModel.pages.length === next.pageModel.pages.length &&
      prev.pageStartNodes.join(",") === next.pageStartNodes.join(",") &&
      prev.clampedImages.length === next.clampedImages.length;
    if (same) return;

    lastRef.current = next;
    setPages(next);
  }, [editor, chrome, headerPx, footerPx, qrPx, reservePx, header, section, marginKey]);


  // Debounced recompute on every document change.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void compute(); }, DEBOUNCE_MS);
    };
    schedule();
    editor.on("update", schedule);
    const offFonts = onFontsReady(schedule);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("update", schedule);
      offFonts();
    };
  }, [editor, compute]);

  return pages;
}
