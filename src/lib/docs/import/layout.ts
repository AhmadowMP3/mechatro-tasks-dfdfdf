// Positioned text → document structure.
//
// Both PDF sources end up here: the text layer of a PDF made from Word/Excel
// (pdf.js) and the words recognised on a scanned page (OCR). Each gives boxes
// of text with a position on the page; this module rebuilds reading order,
// lines, paragraphs, lists and tables from the geometry alone — Arabic
// right-to-left included. Pure and deterministic, so it is unit-tested
// without a browser.

import { makeCell, makeRun, makeTable, type DocAlign, type DocBlock, type DocCell } from "../doc-model";

/**
 * One piece of text on a page. Coordinates in PDF points, y measured from the
 * top. `word` marks a box that is a whole word (OCR): neighbours always get a
 * space between them, however tight the gap.
 */
export type TextBox = { text: string; x: number; y: number; w: number; h: number; word?: true };

export type PageText = {
  width: number;
  height: number;
  boxes: TextBox[];
};

/** Bands of the page to ignore (the original letterhead), in points from each edge. */
export type CropBands = { topPt: number; bottomPt: number };

export type Segment = { x0: number; x1: number; text: string };

export type Line = {
  y: number;
  h: number;
  x0: number;
  x1: number;
  rtl: boolean;
  /** Runs of text separated by wide gaps — the cells of a table row. */
  segments: Segment[];
  text: string;
};

/** Structure recovered from one or more pages. */
export type PageLayout = {
  blocks: DocBlock[];
  /** Plain lines in reading order (field extraction, language guess). */
  lines: string[];
  /** Every table as rows of cell strings (items extraction). */
  tables: string[][][];
};

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN = /[A-Za-z]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Right-to-left as soon as Arabic is a real part of the line ("AutoCAD + PDF ملفات"). */
export function isRtlText(s: string): boolean {
  const ar = (s.match(ARABIC) ?? []).length;
  const la = (s.match(LATIN) ?? []).length;
  return ar > 0 && ar >= la * 0.3;
}

const clean = (s: string) => s.replace(INVISIBLE, "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/* ── lines ─────────────────────────────────────────────────────── */

/** Boxes inside the cropped bands (the original header/footer) are dropped. */
export function visibleBoxes(page: PageText, crop?: CropBands | null): TextBox[] {
  const top = crop?.topPt ?? 0;
  const bottom = page.height - (crop?.bottomPt ?? 0);
  return page.boxes.filter((b) => {
    if (!clean(b.text)) return false;
    const mid = b.y + b.h / 2;
    return mid >= top && mid <= bottom;
  });
}

/** Group boxes into visual lines, top to bottom. */
export function groupLines(boxes: TextBox[]): Line[] {
  const sorted = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: TextBox[][] = [];
  for (const box of sorted) {
    const mid = box.y + box.h / 2;
    const row = rows[rows.length - 1];
    if (row) {
      const rowMid = median(row.map((b) => b.y + b.h / 2));
      const rowH = median(row.map((b) => b.h));
      if (Math.abs(mid - rowMid) <= Math.min(rowH, box.h) * 0.45) {
        row.push(box);
        continue;
      }
    }
    rows.push([box]);
  }
  return rows.map(buildLine).filter((l) => l.segments.length > 0);
}

function buildLine(boxes: TextBox[]): Line {
  const h = median(boxes.map((b) => b.h)) || 10;
  const rtl = isRtlText(boxes.map((b) => b.text).join(" "));
  // Visual order along the line; joining follows the reading direction.
  const ordered = [...boxes].sort((a, b) => (rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x));

  // Word spacing is ~0.25 em (justified text stretches it to ~0.5 em); table
  // cells are separated by their padding on both sides (≥ ~0.75 em).
  const colGap = Math.max(h * 0.75, 6);
  const wordGap = h * 0.12;
  const segments: Segment[] = [];
  let cur: { x0: number; x1: number; parts: string[] } | null = null;
  let prevEdge = 0;
  let prevWord = false;
  for (const b of ordered) {
    const gap = rtl ? prevEdge - (b.x + b.w) : b.x - prevEdge;
    if (cur && gap <= colGap) {
      cur.parts.push(gap > wordGap || (prevWord && b.word) ? " " : "", b.text);
      cur.x0 = Math.min(cur.x0, b.x);
      cur.x1 = Math.max(cur.x1, b.x + b.w);
    } else {
      if (cur) segments.push({ x0: cur.x0, x1: cur.x1, text: clean(cur.parts.join("")) });
      cur = { x0: b.x, x1: b.x + b.w, parts: [b.text] };
    }
    prevEdge = rtl ? b.x : b.x + b.w;
    prevWord = b.word === true;
  }
  if (cur) segments.push({ x0: cur.x0, x1: cur.x1, text: clean(cur.parts.join("")) });
  const kept = mergeMarkers(segments.filter((s) => s.text));

  return {
    y: Math.min(...boxes.map((b) => b.y)),
    h,
    x0: Math.min(...boxes.map((b) => b.x)),
    x1: Math.max(...boxes.map((b) => b.x + b.w)),
    rtl,
    segments: kept,
    text: kept.map((s) => s.text).join("  "),
  };
}

/** A bullet or list number sits apart from its text (hanging indent): glue them. */
const MARKER_ONLY = /^(?:[●•▪■◦○‣∙·\-–*]|\(?[0-9٠-٩]{1,3}[.)]|[a-zA-Z][.)])$/;

function mergeMarkers(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const next = segments[i + 1];
    if (next && MARKER_ONLY.test(s.text)) {
      out.push({ x0: Math.min(s.x0, next.x0), x1: Math.max(s.x1, next.x1), text: `${s.text} ${next.text}` });
      i++;
      continue;
    }
    // A marker left over at the end (mirrored line) belongs to the text before it.
    const prev = out[out.length - 1];
    if (!next && prev && MARKER_ONLY.test(s.text)) {
      out[out.length - 1] = { x0: Math.min(s.x0, prev.x0), x1: Math.max(s.x1, prev.x1), text: `${s.text} ${prev.text}` };
      continue;
    }
    out.push(s);
  }
  return out;
}

/* ── tables ────────────────────────────────────────────────────── */

type Column = { x0: number; x1: number };
type Region = { start: number; end: number };

const bottomOf = (l: Line) => l.y + l.h;

/** Two lines belong to the same table row: they overlap or sit within the cell padding. */
const attached = (a: Line, b: Line) => b.y - bottomOf(a) < Math.min(a.h, b.h) * 0.45;

/** Merge segment intervals into columns (only multi-cell lines define columns). */
function columnsOf(lines: Line[]): Column[] {
  const spans = lines
    .filter((l) => l.segments.length >= 2)
    .flatMap((l) => l.segments.map((s) => ({ x0: s.x0, x1: s.x1 })))
    .sort((a, b) => a.x0 - b.x0);
  const cols: Column[] = [];
  for (const s of spans) {
    const last = cols[cols.length - 1];
    if (last && s.x0 <= last.x1 + 1.5) last.x1 = Math.max(last.x1, s.x1);
    else cols.push({ ...s });
  }
  return cols;
}

/** Columns a segment covers (several when it is a merged cell). */
function coveredColumns(s: Segment, cols: Column[]): number[] {
  const width = Math.max(1, s.x1 - s.x0);
  return cols
    .map((c, i) => ({ i, o: Math.min(c.x1, s.x1) - Math.max(c.x0, s.x0) }))
    .filter((h) => h.o > Math.min(width, c(cols, h.i)) * 0.3)
    .map((h) => h.i);
}
const c = (cols: Column[], i: number) => Math.max(1, cols[i]!.x1 - cols[i]!.x0);

/**
 * Find runs of lines that form a grid. A run starts at a line with two or
 * more cells and grows over the lines that keep fitting the same columns —
 * including the single-cell lines of a multi-line row (wrapped or centred
 * cells) — until a clear gap or a full-width paragraph line ends it.
 */
export function findTableRegions(lines: Line[]): Region[] {
  const regions: Region[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.segments.length < 2) { i++; continue; }
    // A multi-line first row may start with single-cell lines just above.
    let start = i;
    while (start > 0 && lines[start - 1]!.segments.length === 1 && attached(lines[start - 1]!, lines[start]!)
      && !regions.some((r) => r.end >= start - 1)) start--;
    let end = i;
    const gaps: number[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const prev = lines[j - 1]!;
      const line = lines[j]!;
      const gap = line.y - bottomOf(prev);
      if (gap > Math.max(line.h, prev.h) * 1.8) break;
      // A gap well above the table's own row gaps is the space before the
      // next block (often the next section's title), not another row.
      const rowGaps = gaps.filter((g) => g > 0);
      if (rowGaps.length >= 2 && gap > Math.max(median(rowGaps) * 2.2, line.h * 0.9)) break;
      gaps.push(gap);
      const cols = columnsOf(lines.slice(start, j + 1));
      if (cols.length < 2) break;
      if (line.segments.length >= 2) {
        // Every cell must land in the grid without swallowing all of it.
        if (line.segments.some((s) => coveredColumns(s, cols).length === 0)) break;
        end = j;
        continue;
      }
      // One cell: part of the table only while it sits inside a row — touching
      // the line above (a wrapped or vertically centred cell). After a real
      // gap a single line is the paragraph that follows the table.
      const only = line.segments[0]!;
      if (coveredColumns(only, cols).length === 0 || !attached(prev, line)) break;
      end = j;
    }
    const slice = lines.slice(start, end + 1);
    const rows = groupRows(slice);
    // Two side-by-side blocks of lines ("Bill To…" | "Invoice No.…") form one
    // row: still a table, its cells stacked line by line.
    const sideBySide = rows.length === 1 && slice.filter((l) => l.segments.length >= 2).length >= 2;
    if ((rows.length >= 2 || sideBySide) && columnsOf(slice).length >= 2) {
      regions.push({ start, end });
      i = end + 1;
    } else {
      i++;
    }
  }
  return regions;
}

/**
 * Lines → table rows. A new row starts where the gap exceeds the cell padding,
 * or where the step between lines jumps well above the table's usual step —
 * multi-line rows put their single-line cells half a line down, so inside a
 * row lines advance by half steps and a full step plus padding marks a new row.
 */
function groupRows(lines: Line[]): Line[][] {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const steps = sorted.slice(1).map((l, i) => l.y - sorted[i]!.y).filter((s) => s > 0.5);
  const typical = median(steps);
  const rows: Line[][] = [];
  let bottom = -Infinity;
  let prevY = -Infinity;
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    const step = line.y - prevY;
    const padded = line.y - bottom > line.h * 0.35;
    const jump = typical > 0 && step >= typical * 1.6 && step > line.h;
    if (row && !padded && !jump) {
      row.push(line);
      bottom = Math.max(bottom, bottomOf(line));
    } else {
      rows.push([line]);
      bottom = bottomOf(line);
    }
    prevY = line.y;
  }
  return rows;
}

function buildTable(
  lines: Line[],
  rtl: boolean,
  body: { x0: number; x1: number },
): { block: DocBlock; grid: string[][]; stacked: string[][] | null } {
  const cols = columnsOf(lines);
  const n = cols.length;
  // Logical order: right-to-left tables are read from the rightmost column.
  const order = cols.map((_, i) => i).sort((a, b) => (rtl ? cols[b]!.x1 - cols[a]!.x1 : cols[a]!.x0 - cols[b]!.x0));
  const logicalOf = new Map(order.map((col, k) => [col, k]));
  const rowGroups = groupRows(lines);

  // One row of side-by-side blocks: every line stays its own paragraph.
  if (rowGroups.length === 1) {
    const stacked: string[][] = Array.from({ length: n }, () => []);
    for (const line of [...lines].sort((a, b) => a.y - b.y)) {
      for (const s of line.segments) {
        const covered = coveredColumns(s, cols).map((ci) => logicalOf.get(ci)!).sort((a, b) => a - b);
        if (covered.length > 0) stacked[covered[0]!]!.push(s.text);
      }
    }
    const cells = stacked.map((paras) => makeCell(paras.length ? paras.map((t) => [makeRun(t)]) : [[]]));
    const block = makeTable(
      { headerRow: false, columns: n, rows: [cells] },
      { widthPct: 100, align: rtl ? "right" : "left", rtl },
    );
    return { block, grid: [stacked.map((p) => p.join(" "))], stacked };
  }

  const grid: string[][] = [];
  const rows: DocCell[][] = [];
  for (const rowLines of rowGroups) {
    // Collect each segment's text into the (logical) columns it covers.
    const texts: string[][] = Array.from({ length: n }, () => []);
    const spans = new Map<number, number>(); // first logical column → span
    for (const line of [...rowLines].sort((a, b) => a.y - b.y)) {
      for (const s of line.segments) {
        const covered = coveredColumns(s, cols).map((ci) => logicalOf.get(ci)!).sort((a, b) => a - b);
        if (covered.length === 0) continue;
        const first = covered[0]!;
        texts[first]!.push(s.text);
        if (covered.length > 1) spans.set(first, Math.max(spans.get(first) ?? 1, covered[covered.length - 1]! - first + 1));
      }
    }
    const cells: DocCell[] = [];
    const strings: string[] = new Array<string>(n).fill("");
    for (let k = 0; k < n; ) {
      const span = Math.min(spans.get(k) ?? 1, n - k);
      const text = clean(texts.slice(k, k + span).flat().join(" "));
      strings[k] = text;
      cells.push(makeCell(text ? [makeRun(text)] : [], { colSpan: span }));
      k += span;
    }
    rows.push(cells);
    grid.push(strings);
  }

  // Column widths from the space between neighbouring columns' centres.
  const left = cols[0]!.x0;
  const right = cols[n - 1]!.x1;
  const edges = cols.map((col, i) => (i === 0 ? left : (cols[i - 1]!.x1 + col.x0) / 2));
  const width = (i: number) => (i === n - 1 ? right : edges[i + 1]!) - edges[i]!;
  const bodyW = Math.max(1, body.x1 - body.x0);
  const widthPct = Math.min(100, Math.max(20, Math.round(((right - left) / bodyW) * 100)));
  const centred = widthPct < 95 && Math.abs((left + right) / 2 - (body.x0 + body.x1) / 2) < bodyW * 0.05;
  const block = makeTable(
    { headerRow: grid.length > 1, columns: n, rows },
    {
      colWidthsPct: order.map((ci) => Math.max(1, width(ci))),
      widthPct,
      align: centred ? "center" : rtl ? "right" : "left",
      rtl,
    },
  );
  return { block, grid, stacked: null };
}

/* ── paragraphs & lists ────────────────────────────────────────── */

const BULLET = /^[●•▪■◦○‣∙·\-–*]\s*/;
const NUMBERED = /^(?:\(?[0-9٠-٩]{1,3}[.)-]|[a-zA-Z][.)])\s+/;

function alignOf(line: Line, bodyX0: number, bodyX1: number): DocAlign {
  const bodyW = bodyX1 - bodyX0 || 1;
  const lineW = line.x1 - line.x0;
  const mid = (line.x0 + line.x1) / 2;
  if (lineW < bodyW * 0.75 && Math.abs(mid - (bodyX0 + bodyX1) / 2) < bodyW * 0.06) return "center";
  return line.rtl ? "right" : "left";
}

/** Bullet/number at the start of the line in reading order (mirrored text included). */
function listMarker(text: string): { ordered: boolean; rest: string } | null {
  const t = text.trim();
  if (BULLET.test(t)) return { ordered: false, rest: t.replace(BULLET, "") };
  // Mirrored bullet: right-to-left lines sometimes carry it at the end.
  const tail = /\s*[●•▪■◦○]$/.exec(t);
  if (tail) return { ordered: false, rest: t.slice(0, tail.index) };
  if (NUMBERED.test(t)) return { ordered: true, rest: t.replace(NUMBERED, "") };
  return null;
}

type Para = { kind: "para"; lines: Line[]; align: DocAlign; heading: 0 | 1 | 2 | 3 };
type List = { kind: "list"; ordered: boolean; items: string[]; last: Line };

/**
 * Lines → blocks. A table region becomes one table; bullet/number lines
 * become lists; other lines merge into paragraphs while they flow (small gap,
 * same alignment, same size), and a clearly larger line becomes a heading.
 */
export function linesToLayout(lines: Line[], opts: { rtl?: boolean } = {}): PageLayout {
  const blocks: DocBlock[] = [];
  const tables: string[][][] = [];
  const text: string[] = [];
  if (lines.length === 0) return { blocks, lines: text, tables };

  const pageRtl = opts.rtl ?? lines.filter((l) => l.rtl).length >= lines.length / 2;
  const bodyH = median(lines.map((l) => l.h)) || 10;
  const bodyX0 = Math.min(...lines.map((l) => l.x0));
  const bodyX1 = Math.max(...lines.map((l) => l.x1));
  const regions = findTableRegions(lines);

  let open: Para | List | null = null;
  const flush = () => {
    if (!open) return;
    if (open.kind === "list") {
      blocks.push({ type: "list", ordered: open.ordered, items: open.items.map((t) => [makeRun(clean(t))]) });
    } else {
      const runs = [makeRun(clean(open.lines.map((l) => l.text).join(" ")))];
      blocks.push(open.heading
        ? { type: "heading", level: open.heading, align: open.align, runs }
        : { type: "paragraph", align: open.align, runs });
    }
    open = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const region = regions.find((r) => r.start === i);
    if (region) {
      flush();
      const { block, grid, stacked } = buildTable(lines.slice(region.start, region.end + 1), pageRtl, { x0: bodyX0, x1: bodyX1 });
      blocks.push(block);
      if (stacked) {
        // Side-by-side blocks read as their own lines ("Bill To: …", "Attn: …").
        stacked.forEach((paras) => text.push(...paras));
      } else {
        tables.push(grid);
        grid.forEach((r) => text.push(r.filter(Boolean).join(" | ")));
      }
      i = region.end;
      continue;
    }
    const line = lines[i]!;
    text.push(line.text);
    const prevLine: Line | undefined = open ? (open.kind === "list" ? open.last : open.lines[open.lines.length - 1]) : undefined;
    const gap = prevLine ? line.y - bottomOf(prevLine) : Infinity;
    const tight = prevLine !== undefined && gap < Math.max(prevLine.h, line.h) * 0.7;

    const marker = listMarker(line.text);
    if (marker) {
      if (open?.kind === "list" && open.ordered === marker.ordered && gap < line.h * 2) {
        open.items.push(marker.rest);
        open.last = line;
      } else {
        flush();
        open = { kind: "list", ordered: marker.ordered, items: [marker.rest], last: line };
      }
      continue;
    }
    // A wrapped list item continues on the next, unmarked line.
    if (open?.kind === "list" && tight) {
      open.items[open.items.length - 1] += ` ${line.text}`;
      open.last = line;
      continue;
    }

    const ratio = line.h / bodyH;
    const heading: 0 | 1 | 2 | 3 = ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : ratio >= 1.25 ? 3 : 0;
    const align = alignOf(line, bodyX0, bodyX1);
    if (open?.kind === "para" && tight && open.align === align && open.heading === heading && prevLine && Math.abs(prevLine.h - line.h) < bodyH * 0.2) {
      open.lines.push(line);
    } else {
      flush();
      open = { kind: "para", lines: [line], align, heading };
    }
  }
  flush();
  return { blocks, lines: text, tables };
}

/**
 * Apply a text fix to every string of a layout — paragraphs, lists, table
 * cells and the plain lines — after words have been joined back together.
 */
export function mapLayoutText(layout: PageLayout, fix: (s: string) => string): PageLayout {
  const runs = (rs: { text: string }[]) => rs.map((r) => ({ ...r, text: fix(r.text) }));
  const blocks = layout.blocks.map((b): DocBlock => {
    switch (b.type) {
      case "paragraph":
      case "heading":
        return { ...b, runs: runs(b.runs) };
      case "list":
        return { ...b, items: b.items.map(runs) };
      case "table":
        return { ...b, rows: b.rows.map((row) => row.map((cell): DocCell => ({ ...cell, paragraphs: cell.paragraphs.map(runs) }))) };
      default:
        return b;
    }
  });
  return {
    blocks,
    lines: layout.lines.map(fix),
    tables: layout.tables.map((t) => t.map((r) => r.map(fix))),
  };
}

/** Pages → one layout, page breaks between pages. */
export function pagesToLayout(pages: PageText[], crop?: CropBands | null): PageLayout {
  const out: PageLayout = { blocks: [], lines: [], tables: [] };
  const all = pages.map((p) => groupLines(visibleBoxes(p, crop)));
  const flat = all.flat();
  const rtl = flat.filter((l) => l.rtl).length >= flat.length / 2;
  all.forEach((lines, i) => {
    const layout = linesToLayout(lines, { rtl });
    if (i > 0 && layout.blocks.length > 0 && out.blocks.length > 0) out.blocks.push({ type: "pageBreak" });
    out.blocks.push(...layout.blocks);
    out.lines.push(...layout.lines);
    out.tables.push(...layout.tables);
  });
  return out;
}
