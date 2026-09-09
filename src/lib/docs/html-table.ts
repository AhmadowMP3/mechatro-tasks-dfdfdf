// Shared HTML <table> → canonical DocTable reader.
//
// Both the Word importer and the legacy-HTML converter go through here so a
// merged or shaded cell survives exactly the same way on either path.

import { makeCell, normaliseRuns, type DocCell, type DocRun, type DocTable } from "./doc-model";

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "TABLE", "BLOCKQUOTE", "PRE"]);

/**
 * A cell can hold several paragraphs (Word merged cells often do). Keep them
 * as separate lines instead of gluing their text together.
 */
function cellRuns(cell: Element, runsOf: RunsOf): DocRun[] {
  const blocks = Array.from(cell.children).filter((c) => BLOCK_TAGS.has(c.tagName));
  if (blocks.length < 2) return runsOf(cell);
  const out: DocRun[] = [];
  for (const child of blocks) {
    const runs = runsOf(child);
    if (runs.map((r) => r.text).join("").replace(/\s/g, "") === "") continue;
    if (out.length > 0) out.push({ text: "\n" });
    out.push(...runs);
  }
  return normaliseRuns(out);
}

type RunsOf = (el: Element) => DocRun[];

const intAttr = (el: Element, name: string): number => {
  const n = Number(el.getAttribute(name) ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
};

function fillOf(cell: Element): string | null {
  const style = (cell as HTMLElement).style;
  return (
    style?.backgroundColor ||
    style?.background ||
    cell.getAttribute("data-bg") ||
    cell.getAttribute("bgcolor") ||
    null
  );
}

/**
 * Read a table element into canonical rows. Cells absorbed by a rowSpan above
 * them are not emitted; `columns` stays the full grid width.
 */
export function readHtmlTable(
  el: Element,
  runsOf: RunsOf,
  isHeaderRow: (firstRowCells: Element[]) => boolean,
): DocTable | null {
  const rowEls = Array.from(el.querySelectorAll("tr"));
  if (rowEls.length === 0) return null;

  const rows: DocCell[][] = rowEls.map((tr) =>
    Array.from(tr.children)
      .filter((c) => c.tagName === "TD" || c.tagName === "TH")
      .map((cell) =>
        makeCell(cellRuns(cell, runsOf), {
          colSpan: intAttr(cell, "colspan"),
          rowSpan: intAttr(cell, "rowspan"),
          fill: fillOf(cell),
        }),
      ),
  );

  // Grid width has to account for cells carried down by a rowSpan.
  const carry: number[] = new Array(rows.length).fill(0);
  let columns = 1;
  rows.forEach((row, ri) => {
    let width = carry[ri] ?? 0;
    for (const cell of row) {
      width += cell.colSpan;
      for (let k = 1; k < cell.rowSpan; k++) {
        if (ri + k < carry.length) carry[ri + k] += cell.colSpan;
      }
    }
    if (width > columns) columns = width;
  });

  const firstCells = Array.from(rowEls[0].children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
  return { type: "table", headerRow: isHeaderRow(firstCells), columns, rows };
}
