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
export type DocTable = { type: "table"; headerRow: boolean; columns: number; rows: DocRun[][][] };
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
    case "table":
      return (
        typeof b.headerRow === "boolean" &&
        typeof b.columns === "number" &&
        Number.isInteger(b.columns) &&
        b.columns > 0 &&
        Array.isArray(b.rows) &&
        b.rows.every((row) => Array.isArray(row) && row.every(isRunArray))
      );
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
      case "table":
        return {
          type: "table",
          content: b.rows.map((row, ri) => ({
            type: "tableRow",
            content: Array.from({ length: b.columns }, (_, ci) => ({
              type: b.headerRow && ri === 0 ? "tableHeader" : "tableCell",
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [paraJSON(row[ci] ?? [])],
            })),
          })),
        };
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
        const rows = rowNodes.map((r) => (r.content ?? []).map((cell) => runsFromJSON(cell.content)));
        const columns = Math.max(1, ...rows.map((r) => r.length));
        const headerRow = (rowNodes[0]?.content ?? []).some((c) => c.type === "tableHeader");
        blocks.push({
          type: "table",
          headerRow,
          columns,
          rows: rows.map((r) => Array.from({ length: columns }, (_, i) => r[i] ?? [])),
        });
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
          const cells = Array.from({ length: b.columns }, (_, ci) => `<${tag}><p>${runsHtml(row[ci] ?? [])}</p></${tag}>`).join("");
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
