// Measures the editable body against the A4 sheets drawn behind it and keeps
// the page spacers (and the page count) in sync with what the PDF will print.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { A4 } from "../DocPaper";
import { editorIsReady } from "./useStableEditor";
import { SHEET_GAP, readSpacers, sameSpacers, writeSpacers, type PageSpacer } from "./pagination";

export type PageGeometry = { top: number; left: number; width: number; height: number };

/** A table header row repainted at the top of a continuation page. */
export type HeaderRepeat = { id: string; top: number; width: number; html: string };

const PITCH = A4.height + SHEET_GAP;
function sameRepeats(a: HeaderRepeat[], b: HeaderRepeat[]) {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.id === b[i]!.id && Math.abs(r.top - b[i]!.top) < 1 && r.html === b[i]!.html);
}

export function usePageLayout(editor: Editor | null, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [pages, setPages] = useState(1);
  const [geo, setGeo] = useState<PageGeometry | null>(null);
  const [repeats, setRepeats] = useState<HeaderRepeat[]>([]);
  const frame = useRef<number | null>(null);
  const measureHost = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || !editorIsReady(editor)) return;
    // Prefer the padding-free content box so the writing layer lands exactly
    // inside the page margins; fall back to the padded body element.
    const content = container.querySelector<HTMLElement>("[data-doc-body-content]");
    const body = content ?? container.querySelector<HTMLElement>(".pdf-flow");
    const flow = container.querySelector<HTMLElement>(".doc-editor-flow");
    if (!body || !flow) return;

    const cRect = container.getBoundingClientRect();
    const bRect = body.getBoundingClientRect();
    // Without the inner content box, strip the padding from the border box.
    const cs = content ? null : getComputedStyle(body);
    const padL = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
    const padR = cs ? parseFloat(cs.paddingRight) || 0 : 0;
    const padT = cs ? parseFloat(cs.paddingTop) || 0 : 0;
    const padB = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
    const next: PageGeometry = {
      top: bRect.top - cRect.top + padT,
      left: bRect.left - cRect.left + padL,
      width: Math.max(0, bRect.width - padL - padR),
      height: Math.max(0, bRect.height - padT - padB),
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
    const flowRect = flow.getBoundingClientRect();
    const editorOffset = dom.getBoundingClientRect().top - flowRect.top;

    // Always measure a clean clone. Measuring the live editor would include
    // the spacers from the previous pass, making rows oscillate between pages.
    let host = measureHost.current;
    if (!host) {
      host = document.createElement("div");
      host.className = "doc-pagination-measure doc-paper-body doc-rich doc-rich-editable";
      host.setAttribute("aria-hidden", "true");
      document.body.appendChild(host);
      measureHost.current = host;
    }
    host.style.width = `${next.width}px`;
    host.style.fontSize = getComputedStyle(flow).fontSize;
    host.style.lineHeight = getComputedStyle(flow).lineHeight;
    host.style.fontFamily = getComputedStyle(flow).fontFamily;
    host.style.direction = getComputedStyle(flow).direction;
    host.innerHTML = dom.innerHTML;
    host.querySelectorAll(".doc-page-spacer, .doc-row-head-repeat").forEach((el) => el.remove());
    host.querySelectorAll<HTMLElement>(".doc-row-break").forEach((el) => {
      el.classList.remove("doc-row-break");
      el.style.removeProperty("--doc-row-gap");
    });

    const blocks = Array.from(host.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
    const liveBlocks = Array.from(dom.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains("doc-page-spacer"),
    );
    const hostTop = host.getBoundingClientRect().top;

    // Map each rendered top-level block to its document position.
    const positions: number[] = [];
    let pos = 0;
    editor.state.doc.forEach((node) => {
      positions.push(pos);
      pos += node.nodeSize;
    });

    // Document range of a rendered table row.
    const rowSpan = (row: HTMLTableRowElement): { from: number; to: number } | null => {
      try {
        const rowPos = editor.view.posAtDOM(row, 0);
        const $p = editor.state.doc.resolve(Math.max(0, rowPos));
        for (let d = $p.depth; d > 0; d--) {
          const node = $p.node(d);
          if (node.type.name.toLowerCase().includes("row")) {
            return { from: $p.before(d), to: $p.after(d) };
          }
        }
      } catch {
        /* the row can be gone between measure passes */
      }
      return null;
    };

    // A frozen copy of the table's first row, drawn on top of continuation
    // pages so a split table keeps its column titles.
    const headerMarkup = (table: HTMLTableElement): { html: string; height: number } | null => {
      const head = table.rows[0];
      if (!head) return null;
      const cells = Array.from(head.cells);
      const isHead = cells.length > 0 && cells.every((c) => c.tagName === "TH");
      if (!isHead) return null;
      const clone = table.cloneNode(false) as HTMLTableElement;
      clone.removeAttribute("style");
      const tbody = document.createElement("tbody");
      const rowClone = head.cloneNode(true) as HTMLTableRowElement;
      rowClone.classList.remove("doc-row-break");
      rowClone.removeAttribute("style");
      Array.from(rowClone.cells).forEach((c) => {
        c.style.removeProperty("--doc-row-gap");
        c.removeAttribute("contenteditable");
      });
      tbody.appendChild(rowClone);
      // Preserve the measured column widths so the repeat lines up exactly.
      const colgroup = document.createElement("colgroup");
      cells.forEach((c) => {
        const col = document.createElement("col");
        col.style.width = `${c.getBoundingClientRect().width}px`;
        colgroup.appendChild(col);
      });
      clone.appendChild(colgroup);
      clone.appendChild(tbody);
      clone.style.width = `${table.getBoundingClientRect().width}px`;
      clone.style.tableLayout = "fixed";
      return { html: clone.outerHTML, height: head.getBoundingClientRect().height };
    };

    const pendingRepeats: HeaderRepeat[] = [];

    // Break a long table between rows: the last row that still fits on the
    // page grows a transparent gap so the next row starts on the next sheet.
    const splitRows = (
      table: HTMLTableElement,
      startPage: number,
      bodyH: number,
      originTop: number,
      baseShift: number,
      out: PageSpacer[],
      liveTable: HTMLTableElement | null,
    ): number => {
      const rows = Array.from(table.rows);
      const head = headerMarkup(table);
      const headH = head ? head.height : 0;
      const tableW = table.getBoundingClientRect().width;
      let rowShift = 0;
      let page = startPage;
      let prev: HTMLTableRowElement | null = null;

      rows.forEach((row, idx) => {
        const rr = row.getBoundingClientRect();
        const rTop = rr.top - originTop + baseShift + rowShift;
        const rBottom = rTop + rr.height;
        const pageBottom = page * PITCH + bodyH;

        if (rBottom > pageBottom + 0.5 && prev && idx > 0 && rr.height <= bodyH) {
          // Start of the next sheet, leaving room for the repeated header
          // only when the row still fits underneath it.
          const reserve = rr.height + headH <= bodyH ? headH : 0;
          const target = (page + 1) * PITCH + reserve;
          const need = target - rTop;
          if (need > 0.5 && need < PITCH + headH) {
            const livePrev = liveTable?.rows[idx - 1];
            const span = livePrev ? rowSpan(livePrev) : null;
            if (span) {
              out.push({ pos: span.from, end: span.to, h: need, kind: "row" });
              rowShift += need;
              if (head && reserve > 0) {
                pendingRepeats.push({
                  id: `${span.from}-${page + 1}`,
                  top: (page + 1) * PITCH,
                  width: tableW,
                  html: head.html,
                });
              }
            }
          }
          page += 1;
        } else if (rBottom > pageBottom + 0.5) {
          page += 1;
        }
        prev = row;
      });


      return rowShift;
    };

    const spacers: PageSpacer[] = [];
    let shift = 0;
    let forceNext = false;
    let lastBottom = 0;

    blocks.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      let top = editorOffset + r.top - hostTop + shift;
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
      }

      const table = el.tagName === "TABLE" ? (el as HTMLTableElement) : el.querySelector("table");
      const liveBlock = liveBlocks[i];
      const liveTable = liveBlock?.tagName === "TABLE"
        ? (liveBlock as HTMLTableElement)
        : liveBlock?.querySelector<HTMLTableElement>("table") ?? null;
      const crosses = top + h > k * PITCH + H + 0.5;

      let added = 0;
      if (crosses && table && table.rows.length > 1) {
        // Long table: break between rows instead of moving the whole thing.
        added = splitRows(table, k, H, hostTop - editorOffset, shift, spacers, liveTable);
        shift += added;
      } else if (crosses && h <= H && top > k * PITCH + 1) {
        // Would be cut by the sheet edge — move the whole block down.
        pushTo((k + 1) * PITCH);
        k += 1;
      }

      forceNext = el.hasAttribute("data-page-break") || !!el.querySelector("[data-page-break], .doc-page-break-mark");
      lastBottom = Math.max(lastBottom, top + h + added);
    });

    const needed = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / PITCH) + 1);
    setPages((prev) => (prev === needed ? prev : needed));
    setRepeats((prev) => (sameRepeats(prev, pendingRepeats) ? prev : pendingRepeats));

    if (!sameSpacers(readSpacers(editor), spacers)) {
      writeSpacers(editor, spacers);
    }
  }, [editor, containerRef]);

  const schedule = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
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
    // Dragging a table or a block reflows the body without an editor update —
    // watch the DOM and the drag gestures so the sheets keep up.
    const mo = new MutationObserver(() => schedule());
    mo.observe(dom, { childList: true, subtree: true, attributes: true, characterData: true });
    const imgs = () => dom.querySelectorAll("img");
    imgs().forEach((img) => img.addEventListener("load", onUpdate));
    window.addEventListener("resize", onUpdate);
    dom.addEventListener("dragover", onUpdate);
    dom.addEventListener("drop", onUpdate);
    dom.addEventListener("dragend", onUpdate);
    dom.addEventListener("pointerup", onUpdate);
    // Fonts and late-loading images change block heights — re-measure then.
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => schedule());
    return () => {
      editor.off("update", onUpdate);
      ro.disconnect();
      mo.disconnect();
      imgs().forEach((img) => img.removeEventListener("load", onUpdate));
      window.removeEventListener("resize", onUpdate);
      dom.removeEventListener("dragover", onUpdate);
      dom.removeEventListener("drop", onUpdate);
      dom.removeEventListener("dragend", onUpdate);
      dom.removeEventListener("pointerup", onUpdate);
      if (frame.current) cancelAnimationFrame(frame.current);
      measureHost.current?.remove();
      measureHost.current = null;
    };
  }, [editor, schedule]);


  return { pages, geo, repeats };
}
