// Shared HTML <table> → canonical DocTable reader.
//
// Both the Word importer and the legacy-HTML converter go through here so a
// merged or shaded cell survives exactly the same way on either path.

import { makeCell, makeTable, normaliseRuns, type DocCell, type DocRun, type DocTable } from "./doc-model";

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "TABLE", "BLOCKQUOTE", "PRE"]);

/**
 * A cell can hold several paragraphs (Word merged cells often do). Each one is
 * kept as its own paragraph so the lines never glue together.
 */
function cellParagraphs(cell: Element, runsOf: RunsOf): DocRun[][] {
  const blocks = Array.from(cell.children).filter((c) => BLOCK_TAGS.has(c.tagName));
  if (blocks.length < 2) return [normaliseRuns(runsOf(cell))];
  const out: DocRun[][] = [];
  for (const child of blocks) {
    const runs = normaliseRuns(runsOf(child));
    if (runs.map((r) => r.text).join("").replace(/\s/g, "") === "") continue;
    out.push(runs);
  }
  return out.length > 0 ? out : [[]];
}


type RunsOf = (el: Element) => DocRun[];

const intAttr = (el: Element, name: string): number => {
  const n = Number(el.getAttribute(name) ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
};

function fillOf(cell: Element): string | null {
  const style = (cell as HTMLElement).style;
  const own =
    style?.backgroundColor ||
    style?.background ||
    cell.getAttribute("data-bg") ||
    cell.getAttribute("bgcolor") ||
    null;
  if (own) return own;
  // Word also shades the paragraph rather than the cell; when every block in
  // the cell carries the same shading it is, visually, the cell's fill.
  const shadeOf = (b: HTMLElement) => b.style?.backgroundColor || b.style?.background || b.getAttribute("data-bg") || "";
  // Empty spacer paragraphs carry no shading in Word, so they must not veto a
  // fill that every paragraph with text agrees on.
  const blocks = (Array.from(cell.children).filter((c) => BLOCK_TAGS.has(c.tagName)) as HTMLElement[])
    .filter((b) => (b.textContent ?? "").replace(/\s/g, "") !== "" || shadeOf(b) !== "");
  if (blocks.length === 0) return null;
  const first = shadeOf(blocks[0]);
  if (!first) return null;
  return blocks.every((b) => shadeOf(b) === first) ? first : null;
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
        makeCell(cellParagraphs(cell, runsOf), {
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
  return makeTable({ headerRow: isHeaderRow(firstCells), columns, rows }, readTableGeometry(el, columns));
}

/** Column grid, table width, alignment and RTL as authored in the source. */
function readTableGeometry(el: Element, columns: number) {
  const cols = Array.from(el.querySelectorAll("colgroup > col"));
  const parsed = cols
    .map((c) => parseFloat(((c as HTMLElement).style?.width || c.getAttribute("width") || "").replace("%", "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const colWidthsPct = parsed.length === columns ? parsed : null;

  const attrPct = parseFloat(el.getAttribute("data-width-pct") ?? "");
  const stylePct = parseFloat(((el as HTMLElement).style?.width || "").replace("%", ""));
  const widthPct = Number.isFinite(attrPct) && attrPct > 0
    ? attrPct
    : Number.isFinite(stylePct) && stylePct > 0
      ? stylePct
      : 100;

  const rawAlign = (el.getAttribute("data-table-align") || el.getAttribute("align") || "").toLowerCase();
  const align = rawAlign === "center" || rawAlign === "right" ? rawAlign : "left";
  const rtl = (el.getAttribute("dir") || "").toLowerCase() === "rtl";
  return { colWidthsPct, widthPct, align, rtl };
}
