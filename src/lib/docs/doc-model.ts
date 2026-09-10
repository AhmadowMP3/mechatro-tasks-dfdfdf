// The canonical document model.
//
// This is a CLOSED vocabulary. The whole pipeline (editor, Word import, HTML
// serialisation, PDF export) is built on the guarantee that nothing outside
// this set ever enters a document.
//
// Deliberately NOT in the model: font family, font size, text colour,
// background colour, per-block margins, page geometry, columns, headers,
// footers, floats and text boxes. The Mechatro template owns all of those; a
// block can never carry styling that competes with the letterhead.

/* ------------------------------------------------------------------ types */

export type DocAlign = "left" | "center" | "right" | "justify";

export const DOC_ALIGNS: readonly DocAlign[] = ["left", "center", "right", "justify"];

/** The only inline formatting a document can carry. */
export type DocRun = {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  superscript?: true;
  subscript?: true;
  /** Absolute http(s)/mailto/tel link. */
  link?: string;
};

export type DocParagraph = { type: "paragraph"; align: DocAlign; runs: DocRun[] };
export type DocHeading = { type: "heading"; level: 1 | 2 | 3; align: DocAlign; runs: DocRun[] };
export type DocList = { type: "list"; ordered: boolean; items: DocRun[][] };

/**
 * One table cell. A cell absorbed by another cell's rowSpan is NOT emitted —
 * the row simply has fewer entries while `columns` stays the grid width.
 * `fill` is the only colour the model carries, because Word table shading is
 * structural information (it marks header and section rows), not styling.
 */
export type DocCell = {
  /** One entry per paragraph inside the cell, in order; never empty. */
  paragraphs: DocRun[][];
  /** >= 1 */
  colSpan: number;
  /** >= 1 */
  rowSpan: number;
  /** "#RRGGBB" from the source document, or absent. */
  fill?: string;
};


export type TableAlign = "left" | "center" | "right";

/**
 * Tables carry their grid geometry, because a Word table that is 56% of the
 * body width with a 93/7 column split is structure, not styling: without it
 * every imported table collapses to full width with equal columns.
 */
export type DocTable = {
  type: "table";
  headerRow: boolean;
  columns: number;
  rows: DocCell[][];
  /** One per grid column, each > 0, summing to 100. */
  colWidthsPct: number[];
  /** Table width as a percentage of the body width. */
  widthPct: number;
  align: TableAlign;
  /** Word bidiVisual — mirror the column order. */
  rtl: boolean;
};

/** Body width of the Mechatro A4 sheet in CSS px (page width minus margins). */
export const BODY_WIDTH_PX = 794 - 2 * 48;

const TABLE_ALIGNS: readonly TableAlign[] = ["left", "center", "right"];

const equalWidths = (columns: number): number[] => {
  const n = Math.max(1, Math.round(columns));
  return new Array(n).fill(Math.round((100 / n) * 100) / 100);
};

export function isColWidths(value: unknown, columns: number): value is number[] {
  if (!Array.isArray(value) || value.length !== columns) return false;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return false;
  const sum = value.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) <= 0.5;
}

/** Geometry of a table, falling back to the legacy full-width equal grid. */
export function tableGeometry(t: DocTable): { colWidthsPct: number[]; widthPct: number; align: TableAlign; rtl: boolean } {
  const cols = isColWidths(t.colWidthsPct, t.columns) ? t.colWidthsPct : equalWidths(t.columns);
  const w = typeof t.widthPct === "number" && Number.isFinite(t.widthPct) && t.widthPct > 0
    ? Math.min(100, t.widthPct)
    : 100;
  const align = (TABLE_ALIGNS as readonly string[]).includes(t.align as string) ? (t.align as TableAlign) : "left";
  return { colWidthsPct: cols, widthPct: w, align, rtl: t.rtl === true };
}

/** Normalise any width list to `columns` positive entries summing to 100. */
export function normaliseColWidths(raw: number[] | null | undefined, columns: number): number[] {
  const n = Math.max(1, Math.round(columns));
  const src = (raw ?? []).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (src.length !== n) return equalWidths(n);
  const total = src.reduce((a, b) => a + b, 0);
  if (total <= 0) return equalWidths(n);
  const pct = src.map((v) => Math.round((v / total) * 10000) / 100);
  // Absorb rounding drift into the last column so the sum is exactly 100.
  const drift = Math.round((100 - pct.reduce((a, b) => a + b, 0)) * 100) / 100;
  pct[pct.length - 1] = Math.round((pct[pct.length - 1] + drift) * 100) / 100;
  return pct;
}

/** Build a table block with validated geometry. */
export function makeTable(
  base: { headerRow: boolean; columns: number; rows: DocCell[][] },
  geo: { colWidthsPct?: number[] | null; widthPct?: number | null; align?: string | null; rtl?: boolean } = {},
): DocTable {
  const columns = Math.max(1, Math.round(base.columns));
  const widthRaw = typeof geo.widthPct === "number" && Number.isFinite(geo.widthPct) && geo.widthPct > 0 ? geo.widthPct : 100;
  return {
    type: "table",
    headerRow: base.headerRow,
    columns,
    rows: base.rows,
    colWidthsPct: normaliseColWidths(geo.colWidthsPct, columns),
    widthPct: Math.min(100, Math.round(widthRaw * 100) / 100),
    align: (TABLE_ALIGNS as readonly string[]).includes(geo.align ?? "") ? (geo.align as TableAlign) : "left",
    rtl: geo.rtl === true,
  };
}
export type DocImage = { type: "image"; src: string; widthPx: number | null; align: DocAlign };
export type DocPageBreak = { type: "pageBreak" };

export type DocBlock = DocParagraph | DocHeading | DocList | DocTable | DocImage | DocPageBreak;

export const DOC_BLOCK_TYPES = ["paragraph", "heading", "list", "table", "image", "pageBreak"] as const;

export type DocumentModel = {
  version: 1;
  blocks: DocBlock[];
};

/* ------------------------------------------------------------- constructors */

export function emptyParagraph(): DocParagraph {
  return { type: "paragraph", align: "left", runs: [] };
}

export function emptyDoc(): DocumentModel {
  return { version: 1, blocks: [emptyParagraph()] };
}

export function docFromBlocks(blocks: DocBlock[]): DocumentModel {
  return { version: 1, blocks: blocks.length > 0 ? blocks : [emptyParagraph()] };
}

/* ------------------------------------------------------------- type guards */

const isAlign = (v: unknown): v is DocAlign => typeof v === "string" && (DOC_ALIGNS as readonly string[]).includes(v);

const RUN_FLAGS = ["bold", "italic", "underline", "strike", "superscript", "subscript"] as const;
const RUN_KEYS = new Set<string>(["text", "link", ...RUN_FLAGS]);

export function isDocRun(value: unknown): value is DocRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.text !== "string") return false;
  for (const key of Object.keys(r)) {
    if (!RUN_KEYS.has(key)) return false;
  }
  for (const flag of RUN_FLAGS) {
    if (flag in r && r[flag] !== true) return false;
  }
  if ("link" in r && typeof r.link !== "string") return false;
  return true;
}

const isRunArray = (v: unknown): v is DocRun[] => Array.isArray(v) && v.every(isDocRun);

export const FILL_RE = /^#[0-9A-Fa-f]{6}$/;

export function isDocCell(value: unknown): value is DocCell {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  if (!Array.isArray(c.paragraphs) || c.paragraphs.length === 0 || !c.paragraphs.every(isRunArray)) return false;
  if (!Number.isInteger(c.colSpan) || (c.colSpan as number) < 1) return false;
  if (!Number.isInteger(c.rowSpan) || (c.rowSpan as number) < 1) return false;
  if ("fill" in c && c.fill !== undefined && !(typeof c.fill === "string" && FILL_RE.test(c.fill))) return false;
  return true;
}


/** Normalise a colour to "#RRGGBB", or undefined when it is not usable. */
export function normaliseFill(raw: string | null | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v || /^(auto|transparent|inherit|none)$/i.test(v)) return undefined;
  if (FILL_RE.test(v)) return v.toUpperCase();
  const short = /^#([0-9A-Fa-f]{3})$/.exec(v);
  if (short) return `#${short[1].split("").map((c) => c + c).join("")}`.toUpperCase();
  const bare = /^([0-9A-Fa-f]{6})$/.exec(v);
  if (bare) return `#${v}`.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`.toUpperCase();
  }
  return undefined;
}

/**
 * Build a cell. Accepts either the canonical nested paragraphs or a flat run
 * list (legacy callers / stored documents), which becomes a single paragraph.
 * A cell always carries at least one — possibly empty — paragraph.
 */
export function makeCell(
  content: DocRun[] | DocRun[][],
  opts: { colSpan?: number; rowSpan?: number; fill?: string | null } = {},
): DocCell {
  const nested: DocRun[][] = Array.isArray(content) && content.every((p) => Array.isArray(p))
    ? (content as DocRun[][])
    : [content as DocRun[]];
  const paragraphs = nested.length > 0 ? nested : [[]];
  const cell: DocCell = {
    paragraphs,
    colSpan: Math.max(1, Math.round(opts.colSpan ?? 1)),
    rowSpan: Math.max(1, Math.round(opts.rowSpan ?? 1)),
  };
  const fill = normaliseFill(opts.fill);
  if (fill) cell.fill = fill;
  return cell;
}


export function isDocBlock(value: unknown): value is DocBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  switch (b.type) {
    case "paragraph":
      return isAlign(b.align) && isRunArray(b.runs);
    case "heading":
      return (b.level === 1 || b.level === 2 || b.level === 3) && isAlign(b.align) && isRunArray(b.runs);
    case "list":
      return typeof b.ordered === "boolean" && Array.isArray(b.items) && b.items.every(isRunArray);
    case "table": {
      const base =
        typeof b.headerRow === "boolean" &&
        typeof b.columns === "number" &&
        Number.isInteger(b.columns) &&
        b.columns > 0 &&
        Array.isArray(b.rows) &&
        b.rows.every((row) => Array.isArray(row) && row.every(isDocCell));
      if (!base) return false;
      // Geometry is validated when present; legacy tables without any of it
      // are accepted and fall back to a full-width equal grid.
      const columns = b.columns as number;
      if (b.colWidthsPct !== undefined && !isColWidths(b.colWidthsPct, columns)) return false;
      if (b.widthPct !== undefined && !(typeof b.widthPct === "number" && b.widthPct > 0 && b.widthPct <= 100)) return false;
      if (b.align !== undefined && !(TABLE_ALIGNS as readonly string[]).includes(b.align as string)) return false;
      if (b.rtl !== undefined && typeof b.rtl !== "boolean") return false;
      return true;
    }
    case "image":
      return typeof b.src === "string" && b.src !== "" && isAlign(b.align) && (b.widthPx === null || typeof b.widthPx === "number");
    case "pageBreak":
      return true;
    default:
      // Anything outside the closed vocabulary is rejected.
      return false;
  }
}

export function isDocBlockArray(value: unknown): value is DocBlock[] {
  return Array.isArray(value) && value.length > 0 && value.every(isDocBlock);
}

export function isDocModel(value: unknown): value is DocumentModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  return d.version === 1 && isDocBlockArray(d.blocks);
}

/* ------------------------------------------------------------- run helpers */

/** Build a normalised run: unknown flags dropped, false flags omitted. */
export function makeRun(text: string, marks: Partial<Record<(typeof RUN_FLAGS)[number], boolean>> & { link?: string } = {}): DocRun {
  const run: DocRun = { text };
  for (const flag of RUN_FLAGS) {
    if (marks[flag]) run[flag] = true;
  }
  if (marks.link) run.link = marks.link;
  return run;
}

const sameMarks = (a: DocRun, b: DocRun) =>
  RUN_FLAGS.every((f) => !!a[f] === !!b[f]) && (a.link ?? "") === (b.link ?? "");

/** Merge adjacent runs with identical formatting and drop empty ones. */
export function normaliseRuns(runs: DocRun[]): DocRun[] {
  const out: DocRun[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const prev = out[out.length - 1];
    if (prev && sameMarks(prev, run)) prev.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

/* -------------------------------------------------------- TipTap JSON <-> */

type JSONNode = { type: string; attrs?: Record<string, unknown>; content?: JSONNode[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };

function runsToJSON(runs: DocRun[]): JSONNode[] {
  return runs
    .filter((r) => r.text !== "")
    .map((r) => {
      const marks: { type: string; attrs?: Record<string, unknown> }[] = [];
      if (r.bold) marks.push({ type: "bold" });
      if (r.italic) marks.push({ type: "italic" });
      if (r.underline) marks.push({ type: "underline" });
      if (r.strike) marks.push({ type: "strike" });
      if (r.superscript) marks.push({ type: "superscript" });
      if (r.subscript) marks.push({ type: "subscript" });
      if (r.link) marks.push({ type: "link", attrs: { href: r.link } });
      return marks.length > 0 ? { type: "text", text: r.text, marks } : { type: "text", text: r.text };
    });
}

function runsFromJSON(content: JSONNode[] | undefined): DocRun[] {
  const runs: DocRun[] = [];
  const walk = (nodes: JSONNode[] | undefined) => {
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        runs.push(makeRun("\n"));
        continue;
      }
      if (n.type === "text" && typeof n.text === "string") {
        const marks = n.marks ?? [];
        const link = marks.find((m) => m.type === "link")?.attrs?.href;
        runs.push(
          makeRun(n.text, {
            bold: marks.some((m) => m.type === "bold"),
            italic: marks.some((m) => m.type === "italic"),
            underline: marks.some((m) => m.type === "underline"),
            strike: marks.some((m) => m.type === "strike"),
            superscript: marks.some((m) => m.type === "superscript"),
            subscript: marks.some((m) => m.type === "subscript"),
            link: typeof link === "string" ? link : undefined,
          }),
        );
        continue;
      }
      walk(n.content);
    }
  };
  walk(content);
  return normaliseRuns(runs);
}

const paraJSON = (runs: DocRun[], align: DocAlign = "left"): JSONNode => ({
  type: "paragraph",
  attrs: { textAlign: align },
  content: runsToJSON(runs),
});

/**
 * Grid column where each emitted cell of row `ri` starts, accounting for the
 * cells carried down by a rowSpan in the rows above it.
 */
function columnIndexes(rows: DocCell[][], ri: number): number[] {
  // Walk the grid from the top, marking the columns each rowSpan reaches.
  const spans: { col: number; lastRow: number }[] = [];
  for (let r = 0; r <= ri; r++) {
    const busy = new Set(spans.filter((s) => s.lastRow >= r).map((s) => s.col));
    let col = 0;
    const starts: number[] = [];
    for (const cell of rows[r] ?? []) {
      while (busy.has(col)) col += 1;
      starts.push(col);
      if (cell.rowSpan > 1) {
        for (let k = 0; k < cell.colSpan; k++) spans.push({ col: col + k, lastRow: r + cell.rowSpan - 1 });
      }
      col += cell.colSpan;
    }
    if (r === ri) return starts;
  }
  return [];
}

/** Model → TipTap document JSON. */
export function toTipTapJSON(doc: DocumentModel): JSONNode {
  const content: JSONNode[] = doc.blocks.map((b): JSONNode => {
    switch (b.type) {
      case "paragraph":
        return paraJSON(b.runs, b.align);
      case "heading":
        return { type: "heading", attrs: { level: b.level, textAlign: b.align }, content: runsToJSON(b.runs) };
      case "list":
        return {
          type: b.ordered ? "orderedList" : "bulletList",
          content: b.items.map((item) => ({ type: "listItem", content: [paraJSON(item)] })),
        };
      case "table": {
        const geo = tableGeometry(b);
        // TipTap stores PIXEL widths, so each column's share of the table's
        // own width (a fraction of the body) becomes a concrete px value.
        const tableWidthPx = (BODY_WIDTH_PX * geo.widthPct) / 100;
        const colPx = geo.colWidthsPct.map((p) => Math.max(12, Math.round((tableWidthPx * p) / 100)));
        return {
          type: "table",
          content: b.rows.map((row, ri) => {
            const cols = columnIndexes(b.rows, ri);
            return {
              type: "tableRow",
              content: row.map((cell, ci) => {
                const start = cols[ci] ?? 0;
                const widths = colPx.slice(start, start + cell.colSpan);
                return {
                  type: b.headerRow && ri === 0 ? "tableHeader" : "tableCell",
                  attrs: {
                    colspan: cell.colSpan,
                    rowspan: cell.rowSpan,
                    colwidth: widths.length === cell.colSpan ? widths : null,
                    backgroundColor: cell.fill ?? null,
                  },
                  content: cell.paragraphs.map((p) => paraJSON(p)),
                };
              }),
            };
          }),
        };
      }
      case "image":
        return { type: "image", attrs: { src: b.src, width: b.widthPx, align: b.align } };
      case "pageBreak":
        return { type: "pageBreak" };
    }
  });
  return { type: "doc", content: content.length > 0 ? content : [paraJSON([])] };
}

/** TipTap document JSON → model. Anything unknown is coerced to paragraphs. */
export function fromTipTapJSON(json: unknown): DocumentModel {
  const root = (json ?? {}) as JSONNode;
  const blocks: DocBlock[] = [];

  const pushNode = (n: JSONNode) => {
    switch (n.type) {
      case "paragraph": {
        const align = isAlign(n.attrs?.textAlign) ? (n.attrs!.textAlign as DocAlign) : "left";
        blocks.push({ type: "paragraph", align, runs: runsFromJSON(n.content) });
        return;
      }
      case "heading": {
        const raw = Number(n.attrs?.level ?? 2);
        const level = (raw === 1 || raw === 2 || raw === 3 ? raw : 3) as 1 | 2 | 3;
        const align = isAlign(n.attrs?.textAlign) ? (n.attrs!.textAlign as DocAlign) : "left";
        blocks.push({ type: "heading", level, align, runs: runsFromJSON(n.content) });
        return;
      }
      case "bulletList":
      case "orderedList": {
        const items = (n.content ?? []).map((li) => runsFromJSON(li.content));
        blocks.push({ type: "list", ordered: n.type === "orderedList", items });
        return;
      }
      case "table": {
        const rowNodes = n.content ?? [];
        const rows: DocCell[][] = rowNodes.map((r) =>
          (r.content ?? []).map((cell) => {
            // Every paragraph inside the cell survives the round-trip.
            const paras = (cell.content ?? []).filter((c) => c.type === "paragraph" || c.type === "heading");
            const paragraphs = paras.length > 0
              ? paras.map((p) => runsFromJSON(p.content))
              : [runsFromJSON(cell.content)];
            return makeCell(paragraphs, {
              colSpan: Number(cell.attrs?.colspan ?? 1),
              rowSpan: Number(cell.attrs?.rowspan ?? 1),
              fill: typeof cell.attrs?.backgroundColor === "string" ? cell.attrs.backgroundColor : null,
            });
          }),
        );

        const columns = Math.max(1, ...rows.map((r) => r.reduce((sum, c) => sum + c.colSpan, 0)));
        const headerRow = (rowNodes[0]?.content ?? []).some((c) => c.type === "tableHeader");
        blocks.push({ type: "table", headerRow, columns, rows });
        return;
      }
      case "image": {
        const src = String(n.attrs?.src ?? "");
        if (!src) return;
        const w = Number(n.attrs?.width);
        const align = isAlign(n.attrs?.align) ? (n.attrs!.align as DocAlign) : "center";
        blocks.push({ type: "image", src, widthPx: Number.isFinite(w) && w > 0 ? Math.round(w) : null, align });
        return;
      }
      case "pageBreak":
        blocks.push({ type: "pageBreak" });
        return;
      default: {
        // Unknown node: keep its text as a plain paragraph, never its styling.
        const runs = runsFromJSON(n.content);
        if (runs.length > 0) blocks.push({ type: "paragraph", align: "left", runs });
      }
    }
  };

  for (const node of root.content ?? []) pushNode(node);
  return docFromBlocks(blocks);
}

/* ------------------------------------------------------------ HTML output */

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runHtml(run: DocRun): string {
  let html = escHtml(run.text).replace(/\n/g, "<br/>");
  if (run.bold) html = `<strong>${html}</strong>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.strike) html = `<s>${html}</s>`;
  if (run.superscript) html = `<sup>${html}</sup>`;
  if (run.subscript) html = `<sub>${html}</sub>`;
  if (run.link) html = `<a href="${escHtml(run.link)}">${html}</a>`;
  return html;
}

const runsHtml = (runs: DocRun[]) => runs.map(runHtml).join("") || "<br/>";
const alignAttr = (a: DocAlign) => (a === "left" ? "" : ` style="text-align:${a}"`);

/** Model → the Word-style HTML kept on `model.html` for older readers. */
export function toHtml(doc: DocumentModel): string {
  const out = doc.blocks.map((b) => {
    switch (b.type) {
      case "paragraph":
        return `<p${alignAttr(b.align)}>${runsHtml(b.runs)}</p>`;
      case "heading":
        return `<h${b.level}${alignAttr(b.align)}>${runsHtml(b.runs)}</h${b.level}>`;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        return `<${tag}>${b.items.map((i) => `<li><p>${runsHtml(i)}</p></li>`).join("")}</${tag}>`;
      }
      case "table": {
        const rows = b.rows.map((row, ri) => {
          const tag = b.headerRow && ri === 0 ? "th" : "td";
          const cells = row
            .map((cell) => {
              const cs = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
              const rs = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
              const bg = cell.fill ? ` style="background-color:${cell.fill}"` : "";
              const body = cell.paragraphs.map((p) => `<p>${runsHtml(p)}</p>`).join("");
              return `<${tag}${cs}${rs}${bg}>${body}</${tag}>`;

            })
            .join("");
          return `<tr>${cells}</tr>`;
        });
        return `<table><tbody>${rows.join("")}</tbody></table>`;
      }
      case "image": {
        const w = b.widthPx ? ` width="${Math.round(b.widthPx)}"` : "";
        return `<img src="${escHtml(b.src)}"${w} data-align="${b.align}"/>`;
      }
      case "pageBreak":
        return `<div data-page-break="true"></div>`;
    }
  });
  return out.join("") || "<p><br/></p>";
}
