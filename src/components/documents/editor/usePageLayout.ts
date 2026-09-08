// Measures the editable body against the A4 sheets drawn behind it and keeps
// the page spacers (and the page count) in sync with what the PDF will print.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { A4 } from "../DocPaper";
import { editorIsReady } from "./useStableEditor";
import { SHEET_GAP, readSpacers, sameSpacers, writeSpacers, type PageSpacer } from "./pagination";
import { BODY_SAFETY } from "@/lib/docs/page-metrics";

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

    // Same usable body box as the preview/PDF (identical safety reserve), so
    // both views break the document on exactly the same line.
    const H = Math.max(0, next.height - BODY_SAFETY);
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
    const ends: number[] = [];
    let pos = 0;
    editor.state.doc.forEach((node) => {
      positions.push(pos);
      pos += node.nodeSize;
      ends.push(pos);
    });

    // ── Page-start normalisation ────────────────────────────────────
    // Word documents open (and resume after every page break) with empty
    // spacer paragraphs and fat top margins. The preview strips them; the
    // writing layer used to keep them, which is the blank band under the
    // header. Collapse them in the measured clone AND paint the matching
    // display classes on the live nodes, so both agree.
    const classMarks: PageSpacer[] = [];
    const isBlank = (el: HTMLElement) =>
      !el.querySelector("img,table,hr,svg,canvas") &&
      el.tagName !== "IMG" &&
      el.tagName !== "TABLE" &&
      el.tagName !== "HR" &&
      (el.textContent ?? "").trim() === "";
    const isBreak = (el: HTMLElement) =>
      el.hasAttribute("data-page-break") ||
      el.classList.contains("doc-page-break-anchor") ||
      !!el.querySelector("[data-page-break], .doc-page-break-mark");

    const mark = (i: number, cls: string) => {
      const from = positions[i];
      const to = ends[i];
      if (from === undefined || to === undefined) return;
      classMarks.push({ pos: from, end: to, h: 0, kind: "class", cls });
    };
    /** Zero the top spacing of an element and the wrappers it starts. */
    const zeroTopChain = (el: HTMLElement) => {
      let node: HTMLElement | null = el;
      let guard = 0;
      while (node && guard++ < 6) {
        node.style.marginTop = "0";
        node.style.paddingTop = "0";
        const first: Element | null = node.firstElementChild;
        node = first instanceof HTMLElement ? first : null;

      }
    };

    let atPageStart = true;
    blocks.forEach((el, i) => {
      if (isBreak(el)) {
        atPageStart = true;
        return;
      }
      if (isBlank(el)) {
        if (atPageStart) {
          el.style.display = "none";
          mark(i, "doc-blank-collapsed");
        }
        return;
      }
      if (atPageStart) {
        zeroTopChain(el);
        mark(i, "doc-page-first-block");
        atPageStart = false;
      }
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

        if (rBottom > pageBottom + 0.5 && prev && idx > 0) {
          // Start of the next sheet, leaving room for the repeated header
          // only when the row still fits underneath it.
          const reserve = rr.height + headH <= bodyH ? headH : 0;
          const target = (page + 1) * PITCH + reserve;
          const need = target - rTop;
          if (need > 0.5) {

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

    const spacers: PageSpacer[] = [...classMarks];
    let shift = 0;
    let forcedPageTop: number | null = null;
    let lastBottom = 0;

    blocks.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      let top = editorOffset + r.top - hostTop + shift;
      const h = r.height;
      const p = positions[i];

      // A manual/Word page-break is an instruction, not document content.
      // Its visual marker is zero-height, and the next real block performs one
      // exact jump to the following sheet's body origin.
      const explicitBreak =
        el.hasAttribute("data-page-break") ||
        el.classList.contains("doc-page-break-anchor") ||
        !!el.querySelector("[data-page-break], .doc-page-break-mark");
      if (explicitBreak) {
        // Remember the page after the break itself, rather than deriving it
        // later from the following block. The latter may already be in the
        // inter-sheet gap and used to skip a second page accidentally.
        const breakPage = Math.max(0, Math.floor(Math.max(0, top) / PITCH));
        forcedPageTop = (breakPage + 1) * PITCH;
        return;
      }

      const pushTo = (target: number) => {
        const need = target - top;
        if (need <= 0.5 || p === undefined) return;
        spacers.push({ pos: p, h: need });
        shift += need;
        top += need;
      };

      // A blank paragraph must not open a sheet: let it sit in the page gap
      // instead of pushing it down and eating the new page's top margin.
      const blankBlock =
        !el.querySelector("img,table,hr,svg,canvas") &&
        (el.textContent ?? "").trim() === "";

      let k = Math.max(0, Math.floor(top / PITCH));
      if (blankBlock) {
        // In particular, ignore blank Word paragraphs after an explicit page
        // break; they must not consume the top of the next page.
        return;
      }
      if (forcedPageTop !== null) {
        pushTo(forcedPageTop);
        k = Math.max(0, Math.floor(top / PITCH));
        forcedPageTop = null;
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
      } else if (crosses && top > k * PITCH + 1) {
        // Would be cut by the sheet edge — move the whole block down so it
        // starts at the top of the next sheet. Blocks taller than one page
        // still overflow, but they never get hidden.
        pushTo((k + 1) * PITCH);
        k += 1;
      }


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
    // Typing (Enter especially) must re-paginate in the same frame, otherwise
    // the new line renders past the sheet edge before the next measure pass.
    const onImmediate = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = null;
      measure();
    };
    editor.on("update", onImmediate);
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
    dom.addEventListener("drop", onImmediate);
    dom.addEventListener("dragend", onUpdate);
    dom.addEventListener("pointerup", onUpdate);
    // Fonts and late-loading images change block heights — re-measure then.
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => schedule());
    return () => {
      editor.off("update", onImmediate);
      ro.disconnect();
      mo.disconnect();
      imgs().forEach((img) => img.removeEventListener("load", onUpdate));
      window.removeEventListener("resize", onUpdate);
      dom.removeEventListener("dragover", onUpdate);
      dom.removeEventListener("drop", onImmediate);

      dom.removeEventListener("dragend", onUpdate);
      dom.removeEventListener("pointerup", onUpdate);
      if (frame.current) cancelAnimationFrame(frame.current);
      measureHost.current?.remove();
      measureHost.current = null;
    };
  }, [editor, schedule]);


  return { pages, geo, repeats };
}
