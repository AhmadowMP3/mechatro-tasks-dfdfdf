// Browser-side PDF importer. Reads a .pdf entirely in the browser (pdf.js),
// rebuilds paragraphs, tables and images as the Word-style rich HTML our
// editor understands, and drops the file's own running header/footer because
// our official template supplies the header, footer, logo and QR.

import { sanitizeHtml } from "@/lib/security/sanitize";
import { buildDigest, type DocxImport } from "./import-docx";

/** Rendered width cap inside the A4 sheet (matches the editor's own cap). */
const RENDER_MAX_WIDTH = 700;
/** Raster cap for extracted / rendered images. */
const MAX_IMAGE_WIDTH = 1400;
/** Band (fraction of page height) scanned for running headers/footers. */
const CHROME_BAND = 0.08;
/** Wider band for artwork: letterhead logos sit a little below the very top. */
const IMAGE_CHROME_BAND = 0.16;


export function isPdfFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === "application/pdf";
}

/* ── helpers ─────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const norm = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** Arabic in PDFs arrives as presentation forms (isolated / initial / medial /
 * final shapes) plus invisible bidi controls. NFKC folds every shape back to
 * the plain letter and splits the لا ligature, so the text is real Arabic
 * again — searchable, editable and correctly shaped by the browser. */
function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, "");
}

function isRtl(text: string): boolean {
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const la = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar > la;
}

/** Chrome lines repeat with only the page number changing. */
const chromeKey = (s: string) => norm(s).replace(/\d+/g, "#").toLowerCase();

function isPageNumber(text: string): boolean {
  const t = norm(text);
  return t.length <= 24 && /^(page|صفحة)?\s*\d+\s*(\/|of|من|-)?\s*\d*$/i.test(t);
}

/** Letterhead lines (contacts, site, generated-on stamp): our own template
 * prints these, so they never belong in the imported body — even in a
 * single-page file where cross-page repetition can't be measured. */
function looksLikeLetterhead(text: string): boolean {
  const t = norm(text);
  if (!t) return true;
  if (t.length > 160) return false;
  return (
    /[\w.+-]+@[\w-]+\.[\w.]+/.test(t) ||
    /(https?:\/\/|www\.)/i.test(t) ||
    /\+?\d[\d\s()-]{7,}/.test(t) ||
    /(هاتف|جوال|الهاتف|البريد الإلكتروني|العنوان|أنشئ في|الصفحة|mechatro|tel|mobile|e-?mail|address)/i.test(t)
  );
}


async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL("image/jpeg", 0.86);
}

function fitCanvas(w: number, h: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  return { canvas, scale };
}

/* ── line / block model ──────────────────────────────────── */

type Frag = { text: string; x: number; endX: number; size: number; bold: boolean; italic: boolean; color: string | null };
type Line = { y: number; height: number; x: number; endX: number; frags: Frag[]; text: string; rtl: boolean };
type PdfShape = { x0: number; y0: number; x1: number; y1: number; fill: string | null };
type Block =
  | { kind: "para"; y: number; lines: Line[] }
  | { kind: "table"; y: number; rows: Line[][] }
  | { kind: "image"; y: number; src: string; width: number; key: string };

/** Visual order is left→right; Arabic reads right→left, so the pieces of an
 * Arabic line have to be walked backwards. A space is inserted only where the
 * page really leaves one, so letters never drift apart mid-word. */
function orderedFrags(frags: Frag[], rtl: boolean): Frag[] {
  const sorted = frags.slice().sort((a, b) => a.x - b.x);
  return rtl ? sorted.reverse() : sorted;
}

function joinFrags(frags: Frag[], rtl: boolean): string {
  const ordered = orderedFrags(frags, rtl);
  let out = "";
  let prev: Frag | null = null;
  for (const f of ordered) {
    if (prev) {
      const gap = rtl ? prev.x - f.endX : f.x - prev.endX;
      const needsSpace = gap > Math.max(1, f.size * 0.18) && !/\s$/.test(out) && !/^\s/.test(f.text);
      if (needsSpace) out += " ";
    }
    out += f.text;
    prev = f;
  }
  return norm(out);
}

function fragsToLines(items: any[], styles: Record<string, any>, textColors: Array<string | null> = []): Line[] {
  const raw: Array<Frag & { y: number; h: number }> = [];
  let textIndex = -1;
  for (const it of items) {
    if (typeof it?.str !== "string") continue;
    textIndex += 1;
    const color = textColors[textIndex] ?? null;
    const str = normalizeText(String(it.str ?? ""));
    if (!str.trim()) continue;
    const t = it.transform as number[];
    const size = Math.abs(t?.[3] ?? 10) || 10;
    const x = t?.[4] ?? 0;
    const y = t?.[5] ?? 0;
    const family = String(styles?.[it.fontName]?.fontFamily ?? "");
    const fname = `${it.fontName ?? ""} ${family}`;
    raw.push({
      text: str,
      x,
      endX: x + (it.width ?? str.length * size * 0.5),
      size,
      bold: /bold|black|heavy|semibold/i.test(fname),
      italic: /italic|oblique/i.test(fname),
      color,
      y,
      h: it.height || size,
    });
  }
  raw.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  for (const f of raw) {
    const last = lines[lines.length - 1];
    const tol = Math.max(2, f.size * 0.5);
    if (last && Math.abs(last.y - f.y) <= tol) {
      last.frags.push(f);
      last.height = Math.max(last.height, f.h);
    } else {
      lines.push({ y: f.y, height: f.h, x: f.x, endX: f.endX, frags: [f], text: "", rtl: false });
    }
  }
  for (const l of lines) {
    l.frags.sort((a, b) => a.x - b.x);
    l.x = l.frags[0].x;
    l.endX = Math.max(...l.frags.map((f) => f.endX));
    l.rtl = isRtl(l.frags.map((f) => f.text).join(" "));
    l.text = joinFrags(l.frags, l.rtl);
  }
  return lines.filter((l) => l.text.length > 0);
}

/** Split a line into cells wherever a wide horizontal gap appears. */
function lineCells(line: Line): Frag[][] {
  const cells: Frag[][] = [];
  let current: Frag[] = [];
  let prev: Frag | null = null;
  for (const f of line.frags) {
    const gap = prev ? f.x - prev.endX : 0;
    if (prev && gap > Math.max(12, f.size * 1.6)) {
      cells.push(current);
      current = [];
    }
    current.push(f);
    prev = f;
  }
  if (current.length) cells.push(current);
  return cells;
}


function cellsText(cells: Frag[][], rtl: boolean): string[] {
  return cells.map((c) => joinFrags(c, rtl));
}


/** Group lines into paragraphs and tables. */
function groupBlocks(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const cols = lineCells(lines[i]).length;
    if (cols >= 2) {
      // Collect a run of similarly-columned lines -> one table.
      const run: Line[] = [lines[i]];
      let j = i + 1;
      while (j < lines.length) {
        const c = lineCells(lines[j]).length;
        const gap = lines[j - 1].y - lines[j].y;
        if (c < 2 || gap > Math.max(28, lines[j].height * 3)) break;
        run.push(lines[j]);
        j += 1;
      }
      if (run.length >= 2) {
        blocks.push({ kind: "table", y: run[0].y, rows: run.map((l) => [l]) });
        i = j;
        continue;
      }
    }
    // Paragraph: merge tightly-spaced following single-column lines.
    const para: Line[] = [lines[i]];
    let k = i + 1;
    while (k < lines.length) {
      const gap = lines[k - 1].y - lines[k].y;
      const lead = Math.max(lines[k].height, lines[k - 1].height);
      if (lineCells(lines[k]).length >= 2) break;
      if (gap > lead * 1.7) break;
      // A jump in font size means a heading, not a wrapped line.
      const prevSize = Math.max(...lines[k - 1].frags.map((f) => f.size));
      const nextSize = Math.max(...lines[k].frags.map((f) => f.size));
      if (Math.max(prevSize, nextSize) / Math.min(prevSize, nextSize) > 1.2) break;
      para.push(lines[k]);
      k += 1;
    }
    blocks.push({ kind: "para", y: para[0].y, lines: para });
    i = k;
  }
  return blocks;
}

/* ── HTML rendering ──────────────────────────────────────── */

/** Pick a readable colour: keep the source colour unless it would vanish on
 * the cell background it sits on. */
function readableColor(color: string | null, background: string | null): string | null {
  const bg = background ? colorLuminance(background) : 1;
  if (!color) return bg < 0.45 ? "#ffffff" : null;
  const fg = colorLuminance(color);
  if (Math.abs(fg - bg) < 0.22) return bg < 0.5 ? "#ffffff" : "#000000";
  if (fg > 0.92 && bg > 0.9) return "#000000";
  return color;
}

function fragHtml(f: Frag, baseSize: number, background: string | null = null): string {
  let html = esc(f.text);
  if (f.bold) html = `<strong>${html}</strong>`;
  if (f.italic) html = `<em>${html}</em>`;
  const ratio = f.size / baseSize;
  const styles: string[] = [];
  if (ratio >= 1.15 || ratio <= 0.85) {
    styles.push(`font-size:${Math.round(Math.min(28, Math.max(8, f.size)) * 10) / 10}pt`);
  }
  const color = readableColor(f.color, background);
  if (color && color !== "#000000") styles.push(`color:${color}`);
  if (styles.length) html = `<span style="${styles.join(";")}">${html}</span>`;
  return html;
}

/** One source line rendered in reading order, with real spacing. */
function lineHtml(line: Line, baseSize: number): string {
  const ordered = orderedFrags(line.frags, line.rtl);
  let out = "";
  let prev: Frag | null = null;
  for (const f of ordered) {
    if (prev) {
      const gap = line.rtl ? prev.x - f.endX : f.x - prev.endX;
      if (gap > Math.max(1, f.size * 0.18)) out += " ";
    }
    out += fragHtml(f, baseSize);
    prev = f;
  }
  return out;
}

function paraHtml(lines: Line[], baseSize: number, pageWidth: number): string {
  const text = lines.map((l) => l.text).join(" ");
  const rtl = isRtl(text);
  const size = Math.max(...lines.map((l) => Math.max(...l.frags.map((f) => f.size))));
  const bigger = size >= baseSize * 1.35;
  const allBold = lines.every((l) => l.frags.every((f) => f.bold));

  // Centred? compare left/right slack against the page box.
  const left = Math.min(...lines.map((l) => l.x));
  const right = pageWidth - Math.max(...lines.map((l) => l.endX));
  let align = "";
  if (Math.abs(left - right) < pageWidth * 0.04 && left > pageWidth * 0.12) align = "center";
  else if (rtl) align = "right";

  const inner = lines.map((l) => lineHtml(l, baseSize)).join(" ");

  const style = [
    align ? `text-align:${align}` : "",
    rtl ? "direction:rtl" : "direction:ltr",
  ].filter(Boolean).join(";");

  if ((bigger || (allBold && text.length < 90)) && text.length < 140) {
    const level = size >= baseSize * 1.7 ? 1 : size >= baseSize * 1.35 ? 2 : 3;
    return `<h${level} style="${style}">${inner}</h${level}>`;
  }
  if (/^\s*([•▪◦\-–*]|\d+[.)]|[أ-ي][.)])\s+/.test(text)) {
    return `<p style="${style};margin-inline-start:18pt">${inner}</p>`;
  }
  return `<p style="${style}">${inner}</p>`;
}

/** Columns are derived from where cells start across *all* rows, so a row with
 * an empty or merged cell still lands in the right column. */
const snapValues = (values: number[], tolerance = 1.5): number[] => {
  const sorted = values.slice().sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const group = groups[groups.length - 1];
    if (!group || Math.abs(value - group[group.length - 1]) > tolerance) groups.push([value]);
    else group.push(value);
  }
  return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
};

function cellVisualHtml(frags: Frag[], rtl: boolean, baseSize: number, background: string | null = null): string {
  const ordered = orderedFrags(frags, rtl);
  let html = "";
  let previous: Frag | null = null;
  for (const frag of ordered) {
    if (previous) {
      const gap = rtl ? previous.x - frag.endX : frag.x - previous.endX;
      if (gap > Math.max(1, frag.size * 0.18)) html += " ";
    }
    html += fragHtml(frag, baseSize, background);
    previous = frag;
  }
  return html || "&nbsp;";
}

/** Rebuild a table from its vector ruling lines when available. PDF files do
 * not contain table objects; the borders/fills are independent drawing paths.
 * Matching those paths with the text preserves empty cells, column widths and
 * cell colours while keeping the result editable. */
function tableHtml(rows: Line[][], baseSize: number, shapes: PdfShape[]): string {
  const rtl = isRtl(rows.map((r) => r[0].text).join(" "));
  const tableLines = rows.map((row) => row[0]);
  const textLeft = Math.min(...tableLines.map((line) => line.x));
  const textRight = Math.max(...tableLines.map((line) => line.endX));
  const tableBottom = Math.min(...tableLines.map((line) => line.y - line.height * 0.65));
  const tableTop = Math.max(...tableLines.map((line) => line.y + line.height * 1.15));
  const tableHeight = Math.max(1, tableTop - tableBottom);

  const verticals = shapes.filter((shape) => {
    const width = shape.x1 - shape.x0;
    const overlap = Math.min(shape.y1, tableTop + 4) - Math.max(shape.y0, tableBottom - 4);
    return width <= 2.5 && shape.y1 - shape.y0 >= 5 && overlap > Math.min(4, tableHeight * 0.2)
      && shape.x1 >= textLeft - 90 && shape.x0 <= textRight + 90;
  });
  let boundaries = snapValues(verticals.map((shape) => (shape.x0 + shape.x1) / 2));
  if (boundaries.length >= 2) {
    const relevant = boundaries.filter((x) => x <= textRight + 40 && x >= textLeft - 40);
    if (relevant.length >= 2) boundaries = relevant;
  }

  const fallbackCells = tableLines.flatMap((line) => lineCells(line));
  if (boundaries.length < 3 || boundaries.length > 16) {
    const starts = fallbackCells.map((cell) => Math.min(...cell.map((frag) => frag.x)));
    const anchors = snapValues(starts, 14);
    const right = Math.max(textRight, anchors[anchors.length - 1] ?? textRight);
    boundaries = anchors.length > 1
      ? [...anchors, right + Math.max(18, (right - anchors[0]) / anchors.length)]
      : [textLeft, textRight];
  }
  boundaries = boundaries.slice().sort((a, b) => a - b);
  const columnCount = Math.max(1, boundaries.length - 1);
  const tableWidth = Math.max(1, boundaries[boundaries.length - 1] - boundaries[0]);

  const borderShapes = shapes.filter((shape) => {
    const w = shape.x1 - shape.x0;
    const h = shape.y1 - shape.y0;
    return Boolean(shape.fill) && (w <= 2.5 || h <= 2.5)
      && shape.x1 >= boundaries[0] && shape.x0 <= boundaries[boundaries.length - 1]
      && shape.y1 >= tableBottom - 4 && shape.y0 <= tableTop + 4;
  });
  const borderCounts = new Map<string, number>();
  for (const shape of borderShapes) {
    if (!shape.fill) continue;
    borderCounts.set(shape.fill, (borderCounts.get(shape.fill) ?? 0) + 1);
  }
  const ranked = [...borderCounts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
  const borderColor = ranked.find((color) => colorLuminance(color) < 0.93) ?? "#b7b7b7";

  // Assign each fragment to the column it overlaps the most, so a value that
  // starts slightly before a ruling line still lands in its own cell instead
  // of leaving the column empty.
  const rowCells = tableLines.map((line) => {
    const cells: Frag[][] = Array.from({ length: columnCount }, () => []);
    for (const frag of line.frags) {
      let best = -1;
      let bestOverlap = -1;
      for (let i = 0; i < columnCount; i += 1) {
        const overlap = Math.min(frag.endX, boundaries[i + 1]) - Math.max(frag.x, boundaries[i]);
        if (overlap > bestOverlap) { bestOverlap = overlap; best = i; }
      }
      if (best < 0 || bestOverlap <= 0) {
        const center = (frag.x + frag.endX) / 2;
        best = center < boundaries[0] ? 0 : columnCount - 1;
      }
      cells[best].push(frag);
    }
    return cells;
  });

  const firstRow = rowCells[0] ?? [];
  const headerish =
    firstRow.length > 1 &&
    (firstRow.filter((cell) => cell.length).every((cell) => cell.every((frag) => frag.bold))
      || firstRow.filter((cell) => cell.length).every((cell) => cell.every((frag) => frag.size > baseSize * 1.05)));

  type Merged = { start: number; span: number; frags: Frag[] };

  const body = rowCells
    .map((cells, idx) => {
      const tag = idx === 0 && headerish ? "th" : "td";
      const line = tableLines[idx];
      const rowBottom = line.y - line.height * 0.65;
      const rowTop = line.y + line.height * 1.15;
      const centerY = (rowBottom + rowTop) / 2;

      // A wide value that visually crosses ruling lines with empty neighbours
      // is a merged cell in the source table.
      const merged: Merged[] = [];
      for (let i = 0; i < columnCount; i += 1) {
        const cell = cells[i];
        let span = 1;
        if (cell.length) {
          const right = Math.max(...cell.map((f) => f.endX));
          while (
            i + span < columnCount &&
            !cells[i + span].length &&
            right > boundaries[i + span] + 2
          ) span += 1;
        }
        merged.push({ start: i, span, frags: cell });
        i += span - 1;
      }

      const visual = rtl ? merged.slice().reverse() : merged;
      const tds = visual
        .map((cell) => {
          const left = boundaries[cell.start];
          const right = boundaries[cell.start + cell.span];
          const centerX = (left + right) / 2;
          const fills = shapes.filter((shape) => {
            const w = shape.x1 - shape.x0;
            const h = shape.y1 - shape.y0;
            return Boolean(shape.fill) && w > 3 && h > 3
              && centerX >= shape.x0 - 1 && centerX <= shape.x1 + 1
              && centerY >= shape.y0 - 1 && centerY <= shape.y1 + 1;
          }).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0));
          const background = fills[0]?.fill ?? null;
          const fragLeft = cell.frags.length ? Math.min(...cell.frags.map((f) => f.x)) : centerX;
          const fragRight = cell.frags.length ? Math.max(...cell.frags.map((f) => f.endX)) : centerX;
          const leftGap = fragLeft - left;
          const rightGap = right - fragRight;
          const align = Math.abs(leftGap - rightGap) < Math.max(3, (right - left) * 0.1)
            ? "center"
            : rtl ? "right" : "left";
          const style = [
            `border:1px solid ${borderColor}`,
            "padding:6px 8px",
            "overflow-wrap:anywhere",
            `text-align:${align}`,
            background ? `background-color:${background}` : "",
          ].filter(Boolean).join(";");
          const spanAttr = cell.span > 1 ? ` colspan="${cell.span}"` : "";
          return `<${tag}${spanAttr} style="${style}">${cellVisualHtml(cell.frags, rtl, baseSize, background)}</${tag}>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const colgroup = (rtl ? boundaries.slice(0, -1).map((_, i) => columnCount - 1 - i) : boundaries.slice(0, -1).map((_, i) => i))
    .map((index) => `<col style="width:${Math.round(((boundaries[index + 1] - boundaries[index]) / tableWidth) * 10000) / 100}%" />`)
    .join("");
  return `<table style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;direction:${rtl ? "rtl" : "ltr"}"><colgroup>${colgroup}</colgroup><tbody>${body}</tbody></table>`;
}


/* ── images ──────────────────────────────────────────────── */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** pdf.js colour operators carry different argument shapes: RGB comes as three
 * 0–255 channels, gray as one 0–1 value, CMYK as four 0–1 values, and some
 * generators emit a ready-made "#rrggbb" string. Reading only the first
 * argument (the old behaviour) turned every coloured fill into a gray/black
 * block, which is exactly what showed up in the imported tables. */
function pdfColor(args: any): string | null {
  const a = Array.isArray(args) ? args : args ? [args] : [];
  if (!a.length) return null;
  const first = a[0];
  if (typeof first === "string") {
    const s = first.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",").map((v) => parseFloat(v));
      if (p.length >= 3) return rgbHex(p[0], p[1], p[2]);
    }
    return null;
  }
  if (Array.isArray(first) && first.length >= 3) {
    const [r, g, b] = first as number[];
    const unit = r <= 1 && g <= 1 && b <= 1;
    return rgbHex(unit ? r * 255 : r, unit ? g * 255 : g, unit ? b * 255 : b);
  }
  const nums = a.filter((v) => typeof v === "number") as number[];
  if (nums.length >= 4) {
    const [c, m, y, k] = nums;
    return rgbHex(255 * (1 - Math.min(1, c + k)), 255 * (1 - Math.min(1, m + k)), 255 * (1 - Math.min(1, y + k)));
  }
  if (nums.length === 3) {
    const [r, g, b] = nums;
    const unit = r <= 1 && g <= 1 && b <= 1;
    return rgbHex(unit ? r * 255 : r, unit ? g * 255 : g, unit ? b * 255 : b);
  }
  if (nums.length === 1) {
    const v = nums[0] <= 1 ? nums[0] * 255 : nums[0];
    return rgbHex(v, v, v);
  }
  return null;
}

export function colorLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Collect vector rectangles used by PDF generators for cell backgrounds and
 * hairline borders, plus the fill colour in force at every text-showing
 * operator so white-on-dark table text survives the import. */
async function pageVectors(page: any): Promise<{ shapes: PdfShape[]; textColors: Array<string | null> }> {
  try {
    const pdfjs = await loadPdfjs();
    const OPS = pdfjs.OPS;
    const ops = await page.getOperatorList();
    const stack: string[] = [];
    let fill = "#000000";
    const shapes: PdfShape[] = [];
    const textColors: Array<string | null> = [];
    const showOps = new Set(
      [OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]
        .filter((v) => typeof v === "number"),
    );
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(fill);
      else if (fn === OPS.restore) fill = stack.pop() ?? "#000000";
      else if (
        fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillColor ||
        fn === OPS.setFillCMYKColor || fn === OPS.setFillColorN
      ) {
        fill = pdfColor(args) ?? fill;
      } else if (showOps.has(fn)) {
        textColors.push(fill);
      } else if (fn === OPS.constructPath) {
        const bounds = args?.[2];
        if (!bounds || bounds.length < 4) continue;
        const x0 = Number(bounds[0]);
        const y0 = Number(bounds[1]);
        const x1 = Number(bounds[2]);
        const y1 = Number(bounds[3]);
        const width = x1 - x0;
        const height = y1 - y0;
        if (![x0, y0, x1, y1].every(Number.isFinite) || width <= 0 || height <= 0) continue;
        // Ignore page/image clipping paths. Table geometry is made of thin
        // rules or modest cell-sized fills, never an almost full-page box.
        if (width > 560 && height > 780) continue;
        if (width > 520 && height > 80) continue;
        shapes.push({ x0, y0, x1, y1, fill });
      }
    }
    return { shapes, textColors };
  } catch {
    return { shapes: [], textColors: [] };
  }
}


/** Where each drawn image sits on the page, in PDF units (origin bottom-left). */
async function imageBoxes(page: any): Promise<Array<{ x: number; y: number; w: number; h: number }>> {
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const pdfjs = await loadPdfjs();
  const OPS = pdfjs.OPS;
  const paint = new Set(
    [OPS.paintImageXObject, OPS.paintImageXObjectRepeat, OPS.paintJpegXObject, OPS.paintInlineImageXObject]
      .filter((v) => typeof v === "number"),
  );
  const ops = await page.getOperatorList();
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i] as Matrix);
    else if (paint.has(fn)) {
      const w = Math.abs(ctm[0]);
      const h = Math.abs(ctm[3]);
      if (w < 20 || h < 20) continue;
      boxes.push({ x: ctm[4], y: Math.min(ctm[5], ctm[5] + ctm[3]), w, h });
      if (boxes.length >= 12) break;
    }
  }
  return boxes;
}

/** Crop each image region out of a rendered page — works for photos,
 * logos and vector artwork alike. Artwork sitting in the letterhead bands is
 * skipped: our own template already prints the logo, footer and QR. */
async function pageImages(page: any): Promise<Block[]> {
  try {
    const boxes = await imageBoxes(page);
    if (!boxes.length) return [];
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const pageHeight = viewport.height / scale;
    const topBand = pageHeight * (1 - IMAGE_CHROME_BAND);
    const bottomBand = pageHeight * IMAGE_CHROME_BAND;
    const body = boxes.filter((b) => {
      const mid = b.y + b.h / 2;
      return mid < topBand && mid > bottomBand;
    });
    if (!body.length) return [];
    const full = document.createElement("canvas");
    full.width = Math.round(viewport.width);
    full.height = Math.round(viewport.height);
    const fctx = full.getContext("2d");
    if (!fctx) return [];
    fctx.fillStyle = "#ffffff";
    fctx.fillRect(0, 0, full.width, full.height);
    await page.render({ canvasContext: fctx, viewport, canvas: full }).promise;

    const out: Block[] = [];
    for (const b of body) {
      const sw = Math.round(b.w * scale);
      const sh = Math.round(b.h * scale);
      const sx = Math.round(b.x * scale);
      const sy = Math.round(full.height - (b.y + b.h) * scale);
      if (sw < 8 || sh < 8) continue;
      const { canvas } = fitCanvas(sw, sh);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(full, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      out.push({
        kind: "image",
        y: b.y + b.h,
        src: await canvasToDataUrl(canvas),
        width: Math.min(RENDER_MAX_WIDTH, canvas.width),
        key: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)].join(":"),
      });
    }
    return out;

  } catch {
    return [];
  }
}


async function renderPage(page: any): Promise<string | null> {
  try {
    const viewport = page.getViewport({ scale: 2 });
    const { canvas } = fitCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = canvas.width / viewport.width;
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: 2 * scale }), canvas }).promise;
    return await canvasToDataUrl(canvas);
  } catch {
    return null;
  }
}

/* ── pdf.js loader ───────────────────────────────────────── */

/** pdf.js 6 relies on the very new Map.getOrInsert* helpers; older browsers
 * (and current Chromium builds) still lack them. */
function installMapPolyfills(): void {
  const proto: any = Map.prototype;
  if (typeof proto.getOrInsert !== "function") {
    proto.getOrInsert = function (key: any, value: any) {
      if (!this.has(key)) this.set(key, value);
      return this.get(key);
    };
  }
  if (typeof proto.getOrInsertComputed !== "function") {
    proto.getOrInsertComputed = function (key: any, fn: (k: any) => any) {
      if (!this.has(key)) this.set(key, fn(key));
      return this.get(key);
    };
  }
  const wproto: any = WeakMap.prototype;
  if (typeof wproto.getOrInsertComputed !== "function") {
    wproto.getOrInsertComputed = function (key: any, fn: (k: any) => any) {
      if (!this.has(key)) this.set(key, fn(key));
      return this.get(key);
    };
  }
}

let pdfjsPromise: Promise<any> | null = null;
async function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      installMapPolyfills();
      const lib: any = await import("pdfjs-dist/build/pdf.mjs");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

/* ── main conversion ─────────────────────────────────────── */

export async function convertPdf(file: File, opts?: { keepFormatting?: boolean }): Promise<DocxImport> {
  const keep = opts?.keepFormatting !== false;
  const warnings: string[] = [];
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;

  type Candidate = { key: string; size: number };
  type PageData = { blocks: Block[]; chrome: Candidate[]; local: Set<string>; height: number; width: number; shapes: PdfShape[] };
  const pages: PageData[] = [];
  let scanned = 0;
  let baseSizes: number[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const vectors = keep ? await pageVectors(page) : { shapes: [], textColors: [] };
    const content = await page.getTextContent();
    const lines = fragsToLines(content.items ?? [], content.styles ?? {}, vectors.textColors);

    if (!lines.length) {
      scanned += 1;
      const src = await renderPage(page);
      pages.push({
        blocks: src ? [{ kind: "image", y: 0, src, width: RENDER_MAX_WIDTH, key: `scan-${pages.length}` }] : [],
        chrome: [],
        local: new Set<string>(),
        height: viewport.height,
        width: viewport.width,
        shapes: [],
      });
      page.cleanup?.();
      continue;
    }

    baseSizes = baseSizes.concat(lines.flatMap((l) => l.frags.map((f) => f.size)));

    const topLimit = viewport.height * (1 - CHROME_BAND);
    const bottomLimit = viewport.height * CHROME_BAND;
    const bandLines = lines.filter((l) => l.y >= topLimit || l.y <= bottomLimit);
    const chromeLines: Candidate[] = bandLines.map((l) => ({
      key: chromeKey(l.text),
      size: Math.max(...l.frags.map((f) => f.size)),
    }));
    // The source file's own header/footer band never belongs in the body: our
    // template prints the logo, contact strip, footer and page number itself.
    const local = new Set<string>(bandLines.map((l) => chromeKey(l.text)));

    const shapes = vectors.shapes;

    const blocks = groupBlocks(lines);
    if (keep) {
      const imgs = await pageImages(page);
      blocks.push(...imgs);
    }
    blocks.sort((a, b) => b.y - a.y);

    pages.push({ blocks, chrome: chromeLines, local, height: viewport.height, width: viewport.width, shapes });
    page.cleanup?.();
  }


  const sizes = baseSizes.slice().sort((a, b) => a - b);
  const baseSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 11;

  // Repeated running header / footer lines across pages -> template chrome.
  // Titles are excluded: only body-sized (or smaller) short lines qualify.
  const chrome = new Set<string>();
  if (pages.length >= 2) {
    const counts = new Map<string, number>();
    for (const pg of pages) {
      const seen = new Set<string>();
      for (const c of pg.chrome) {
        if (!c.key || seen.has(c.key)) continue;
        if (c.size > baseSize * 1.15 || c.key.length > 140) continue;
        seen.add(c.key);
        counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
      }
    }
    const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
    for (const [t, n] of counts) if (n >= threshold) chrome.add(t);
  }

  const parts: string[] = [];
  const seenImages = new Set<string>();
  pages.forEach((pg, idx) => {
    if (idx > 0) parts.push('<div data-page-break="true"></div>');
    const drop = (t: string, inTable = false) => {
      const key = chromeKey(t);
      if (isPageNumber(t)) return true;
      if (chrome.has(key)) return true;
      // Real table rows can reach into the band area; only obvious letterhead
      // lines are removed there, everything else in the band always goes.
      if (pg.local.has(key)) return inTable ? looksLikeLetterhead(t) : true;
      return false;
    };
    for (const b of pg.blocks) {
      if (b.kind === "image") {
        // The same artwork in the same spot on several pages is letterhead.
        if (seenImages.has(b.key)) continue;
        seenImages.add(b.key);
        parts.push(`<p style="text-align:center"><img src="${b.src}" style="max-width:100%;height:auto" /></p>`);
        continue;
      }
      if (b.kind === "table") {
        const rows = b.rows.filter((r) => !drop(r[0].text, true));
        if (!rows.length) continue;
        parts.push(tableHtml(rows, baseSize, pg.shapes));
        continue;
      }
      const lines = b.lines.filter((l) => !drop(l.text));
      if (!lines.length) continue;
      parts.push(paraHtml(lines, baseSize, pg.width));
    }
  });


  const html = sanitizeHtml(parts.join("\n"));
  const text = htmlToText(html);
  const images = (html.match(/<img /g) ?? []).length;
  const tables = (html.match(/<table/g) ?? []).length;

  if (scanned > 0) {
    warnings.push(
      `${scanned} page(s) had no selectable text and were imported as page images.`,
    );
  }
  if (!text.trim() && !images) warnings.push("No readable content was found in this PDF.");

  try {
    await doc.destroy();
  } catch {
    /* ignore */
  }

  return { html, text, digest: buildDigest(html) || text, warnings: warnings.slice(0, 8), images, tables };
}

function htmlToText(html: string): string {
  if (typeof document === "undefined") return "";
  const host = document.createElement("div");
  host.innerHTML = html;
  host.querySelectorAll("p, div, li, tr, h1, h2, h3, br").forEach((el) => el.append("\n"));
  return (host.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
