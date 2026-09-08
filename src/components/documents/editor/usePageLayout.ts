// Measures the editable body against the A4 sheets drawn behind it and keeps
// the page spacers (and the page count) in sync with what the PDF will print.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { A4 } from "../DocPaper";
import { editorIsReady } from "./useStableEditor";
import { SHEET_GAP, readSpacers, sameSpacers, writeSpacers, type PageSpacer } from "./pagination";
import { BODY_SAFETY } from "@/lib/docs/page-metrics";
import { isWordBlankBlock, snapWordPageStartBlock, visibleWordText } from "@/lib/docs/page-start";

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
  const applyingLayout = useRef(false);
  const refineFrame = useRef<number | null>(null);
  const refineRef = useRef<((applied: PageSpacer[], round: number) => void) | null>(null);

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
      host.setAttribute("aria-hidden", "true");
      measureHost.current = host;
    }
    // The clone must inherit exactly the same cascade as the writing layer
    // (paper, flow and ProseMirror scoped rules), otherwise line heights differ
    // by a few percent per block and every page breaks in the wrong place.
    host.className = "doc-pagination-measure doc-paper-body doc-rich doc-rich-editable ProseMirror";
    if (host.parentElement !== flow) flow.appendChild(host);
    host.style.width = `${next.width}px`;
    // Typography must come from the cascade, exactly like the writing layer.
    // Copying computed values here freezes line-height to an absolute pixel
    // value, so nested text with a different font-size measured too short and
    // every page took more content than it can hold.
    host.style.removeProperty("font-size");
    host.style.removeProperty("line-height");
    host.style.removeProperty("font-family");
    host.style.direction = getComputedStyle(dom).direction;
    host.innerHTML = dom.innerHTML;
    host.querySelectorAll(".doc-page-spacer, .doc-row-head-repeat").forEach((el) => el.remove());
    host.querySelectorAll<HTMLElement>(".doc-row-break").forEach((el) => {
      el.classList.remove("doc-row-break");
      el.style.removeProperty("--doc-row-gap");
    });
    // The source DOM already contains decorations from the previous layout
    // pass. They are presentation-only and must never become input to the next
    // measurement, otherwise page-start lifts are applied repeatedly and the
    // document oscillates while scrolling.
    host.querySelectorAll<HTMLElement>(".doc-page-first-block, .doc-blank-collapsed").forEach((el) => {
      el.classList.remove("doc-page-first-block", "doc-blank-collapsed");
      el.style.removeProperty("--doc-page-start-lift");
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
    const pageStartLifts = new Map<HTMLElement, number>();
    const isBlank = (el: HTMLElement) => isWordBlankBlock(el);
    const isBreak = (el: HTMLElement) =>
      el.hasAttribute("data-page-break") ||
      el.classList.contains("doc-page-break-anchor") ||
      !!el.querySelector("[data-page-break], .doc-page-break-mark");

    const mark = (i: number, cls: string, startLift = 0) => {
      const from = positions[i];
      const to = ends[i];
      if (from === undefined || to === undefined) return;
      classMarks.push({ pos: from, end: to, h: 0, kind: "class", cls, startLift });
    };
    /** Return the first element that actually paints content. Word commonly
     * wraps it in several divs and leaves empty paragraphs before it. */
    /** Normalise a page start in the measurement DOM and return the *actual*
     * number of pixels by which its first painted content moved upward.
     * Measuring the delta is important: CSS margin collapsing means summing
     * computed margins/padding can greatly overestimate this value. That
     * overestimate was added to the page spacer and caused the large band
     * below headers on pages 2+ of imported Word documents. */
    const normalisePageStart = (el: HTMLElement): number => {
      return snapWordPageStartBlock(el, false);
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
        const startLift = normalisePageStart(el);
        pageStartLifts.set(el, startLift);
        mark(i, "doc-page-first-block", startLift);
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
              out.push({ pos: span.from, end: span.to, h: need, kind: "row", reserve });
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

    // Keep the same array: automatic-page analysis below can discover more
    // blank Word blocks after this point, and those class decorations must be
    // written back to the live editor in the same measurement pass.
    const spacers: PageSpacer[] = classMarks;
    let shift = 0;
    let forcedPageTop: number | null = null;
    let lastBottom = 0;
    let lastContentPage = -1;
    let pendingBlankIndexes: number[] = [];

    const collapsePendingPageBlanks = () => {
      pendingBlankIndexes.forEach((index) => {
        const el = blocks[index];
        if (el) el.style.display = "none";
        mark(index, "doc-blank-collapsed");
      });
      pendingBlankIndexes = [];
    };

    blocks.forEach((el, i) => {
      const p = positions[i];

      // A manual/Word page-break is an instruction, not document content.
      // Its visual marker is zero-height, and the next real block performs one
      // exact jump to the following sheet's body origin.
      const explicitBreak =
        el.hasAttribute("data-page-break") ||
        el.classList.contains("doc-page-break-anchor") ||
        !!el.querySelector("[data-page-break], .doc-page-break-mark");
      if (explicitBreak) {
        const breakRect = el.getBoundingClientRect();
        const breakTop = editorOffset + breakRect.top - hostTop + shift;
        // Remember the page after the break itself, rather than deriving it
        // later from the following block. The latter may already be in the
        // inter-sheet gap and used to skip a second page accidentally.
        const breakPage = Math.max(0, Math.floor(Math.max(0, breakTop) / PITCH));
        forcedPageTop = (breakPage + 1) * PITCH;
        return;
      }

      // A blank paragraph must not open a sheet: let it sit in the page gap
      // instead of pushing it down and eating the new page's top margin.
      const blankBlock =
        !el.querySelector("img,table,hr,svg,canvas") &&
        visibleWordText(el) === "";

      if (blankBlock) {
        // In particular, ignore blank Word paragraphs after an explicit page
        // break; they must not consume the top of the next page.
        pendingBlankIndexes.push(i);
        return;
      }

      // IMPORTANT: collapse a pending Word blank run before measuring this
      // visible block. The old order measured first and hid the blanks second,
      // so their old height was permanently baked into the page spacer and
      // appeared as the large white band below every imported-page header.
      let r = el.getBoundingClientRect();
      let top = editorOffset + r.top - hostTop + shift;
      let h = r.height;
      let k = Math.max(0, Math.floor(top / PITCH));
      if (pendingBlankIndexes.length > 0 && (forcedPageTop !== null || k > lastContentPage)) {
        collapsePendingPageBlanks();
        r = el.getBoundingClientRect();
        top = editorOffset + r.top - hostTop + shift;
        h = r.height;
        k = Math.max(0, Math.floor(top / PITCH));
      } else if (pendingBlankIndexes.length > 0) {
        pendingBlankIndexes = [];
      }

      const pushTo = (target: number) => {
        if (p === undefined) return;
        // Normalise first, then compensate by the measured movement. Never
        // derive this from a sum of CSS margins: collapsed margins are not
        // additive and caused oversized spacers in imported Word documents.
        const lift = pageStartLifts.get(el) ?? normalisePageStart(el);
        const need = target - top + lift;
        if (need <= 0.5) return;
        spacers.push({ pos: p, h: need });
        const end = ends[i];
        const startLift = pageStartLifts.get(el) ?? lift;
        if (end !== undefined) spacers.push({
          pos: p,
          end,
          h: 0,
          kind: "class",
          cls: "doc-page-first-block",
          startLift,
        });
        shift += need - lift;
        top = target;
      };

      // Empty Word paragraphs can contain invisible RTL controls. If such a
      // run is the only thing between the previous page and this first visible
      // block, collapse it and let the next measurement pass place the block
      // at the true body origin.
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
        // The very first row must fit on the current page. If it does not, the
        // table cannot be split here at all: move the whole block to the next
        // sheet first, otherwise its rows keep running past the page edge and
        // print over the footer and the next header.
        // Dry run: find the first row that does not fit on this page. If that
        // is the header row or the very first body row, the table must move to
        // the next sheet as a whole — splitting there would either run past the
        // page edge or strand a lonely header at the foot of the page.
        const limit = k * PITCH + H + 0.5;
        let firstOverflow = -1;
        for (let r = 0; r < table.rows.length; r++) {
          const rect = table.rows[r]!.getBoundingClientRect();
          const rTop = editorOffset + rect.top - hostTop + shift;
          if (rTop + rect.height > limit) {
            firstOverflow = r;
            break;
          }
        }
        if (firstOverflow >= 0 && firstOverflow <= 1 && top > k * PITCH + 1) {
          pushTo((k + 1) * PITCH);
          k += 1;
        }
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
      lastContentPage = Math.max(lastContentPage, k);
    });

    const needed = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / PITCH) + 1);
    setPages((prev) => (prev === needed ? prev : needed));
    setRepeats((prev) => (sameRepeats(prev, pendingRepeats) ? prev : pendingRepeats));

    if (!sameSpacers(readSpacers(editor), spacers)) {
      applyingLayout.current = true;
      writeSpacers(editor, spacers);
      // MutationObserver callbacks run before this microtask. This prevents
      // our own decorations from scheduling a competing measurement while
      // still allowing the next genuine document change through.
      queueMicrotask(() => {
        applyingLayout.current = false;
      });
    }

    // The clone can never model the live sheet perfectly (collapsed margins,
    // late fonts, table layout). Verify the real result and cancel whatever
    // white band is actually left at the top of each sheet.
    if (refineFrame.current) cancelAnimationFrame(refineFrame.current);
    refineFrame.current = requestAnimationFrame(() => refineRef.current?.(spacers, 0));
  }, [editor, containerRef]);

  /** Compare the printed page starts with the sheet origins and correct the
   * spacer heights by the measured residual. Runs at most a few frames and
   * stops as soon as every page start sits on its margin. */
  const refine = useCallback((applied: PageSpacer[], round: number) => {
    if (round > 3 || !editorIsReady(editor)) return;
    const container = containerRef.current;
    if (!container) return;
    const bodies = Array.from(container.querySelectorAll<HTMLElement>("[data-doc-body-content]"));
    const firstBody = bodies[0];
    if (!firstBody) return;
    const dom = editor.view.dom as HTMLElement;
    const origin = firstBody.getBoundingClientRect().top;

    const next = applied.map((s) => ({ ...s }));
    const pageEntries = next.filter((s) => s.kind === undefined || s.kind === "block");
    const rowEntries = next.filter((s) => s.kind === "row");
    const spacerEls = Array.from(dom.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("doc-page-spacer"),
    );
    const rowEls = Array.from(dom.querySelectorAll<HTMLElement>("tr.doc-row-break"));
    let changed = false;

    const correct = (entry: PageSpacer, target: HTMLElement | null, reserve: number) => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (rect.height <= 0) return;
      const top = rect.top - origin - reserve;
      const page = Math.round(top / PITCH);
      if (page < 1) return;
      const residual = top - page * PITCH;
      if (Math.abs(residual) < 1) return;
      const h = Math.max(0, entry.h - residual);
      if (Math.abs(h - entry.h) < 1) return;
      entry.h = h;
      changed = true;
    };

    spacerEls.forEach((el, i) => {
      const entry = pageEntries[i];
      if (!entry) return;
      let sibling = el.nextElementSibling;
      while (sibling instanceof HTMLElement && sibling.classList.contains("doc-page-spacer")) {
        sibling = sibling.nextElementSibling;
      }
      correct(entry, sibling instanceof HTMLElement ? sibling : null, 0);
    });

    rowEls.forEach((el, i) => {
      const entry = rowEntries[i];
      if (!entry) return;
      const nextRow = el.nextElementSibling;
      correct(entry, nextRow instanceof HTMLElement ? nextRow : null, entry.reserve ?? 0);
    });

    if (!changed) return;
    applyingLayout.current = true;
    writeSpacers(editor, next);
    queueMicrotask(() => {
      applyingLayout.current = false;
    });
    if (refineFrame.current) cancelAnimationFrame(refineFrame.current);
    refineFrame.current = requestAnimationFrame(() => refineRef.current?.(next, round + 1));
  }, [editor, containerRef]);

  refineRef.current = refine;

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

    // Watch the available page width, not the editor's changing height. Page
    // spacer decorations deliberately change that height and observing it was
    // a self-triggering layout loop.
    let observedWidth = dom.getBoundingClientRect().width;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? observedWidth;
      if (Math.abs(width - observedWidth) < 0.5) return;
      observedWidth = width;
      schedule();
    });
    ro.observe(dom);
    // Dragging or resizing a node can change presentation without changing the
    // document. Ignore mutations made solely by our pagination decorations.
    const paginationOnlyMutation = (record: MutationRecord) => {
      if (record.type === "attributes") {
        const target = record.target;
        return target instanceof HTMLElement && (
          target.classList.contains("doc-page-first-block") ||
          target.classList.contains("doc-blank-collapsed") ||
          target.classList.contains("doc-row-break")
        );
      }
      if (record.type === "childList") {
        const changed = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
        return changed.length > 0 && changed.every(
          (node) => node instanceof HTMLElement && (
            node.classList.contains("doc-page-spacer") || node.classList.contains("doc-row-head-repeat")
          ),
        );
      }
      return false;
    };
    const mo = new MutationObserver((records) => {
      if (applyingLayout.current || records.every(paginationOnlyMutation)) return;
      schedule();
    });
    mo.observe(dom, { childList: true, subtree: true, attributes: true, characterData: true });
    // Capture image loads for images inserted after this effect was installed.
    dom.addEventListener("load", onUpdate, true);
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
      dom.removeEventListener("load", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
      dom.removeEventListener("dragover", onUpdate);
      dom.removeEventListener("drop", onImmediate);

      dom.removeEventListener("dragend", onUpdate);
      dom.removeEventListener("pointerup", onUpdate);
      if (frame.current) cancelAnimationFrame(frame.current);
      if (refineFrame.current) cancelAnimationFrame(refineFrame.current);
      measureHost.current?.remove();
      measureHost.current = null;
    };
  }, [editor, schedule]);


  return { pages, geo, repeats };
}
