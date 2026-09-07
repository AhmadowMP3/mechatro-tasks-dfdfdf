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

export function isPdfFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === "application/pdf";
}

/* ── helpers ─────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const norm = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

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

type Frag = { text: string; x: number; endX: number; size: number; bold: boolean; italic: boolean };
type Line = { y: number; height: number; x: number; endX: number; frags: Frag[]; text: string };
type Block =
  | { kind: "para"; y: number; lines: Line[] }
  | { kind: "table"; y: number; rows: Line[][] }
  | { kind: "image"; y: number; src: string; width: number };

function fragsToLines(items: any[], styles: Record<string, any>): Line[] {
  const raw: Array<Frag & { y: number; h: number }> = [];
  for (const it of items) {
    const str = String(it.str ?? "");
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
      lines.push({ y: f.y, height: f.h, x: f.x, endX: f.endX, frags: [f], text: "" });
    }
  }
  for (const l of lines) {
    l.frags.sort((a, b) => a.x - b.x);
    l.x = l.frags[0].x;
    l.endX = Math.max(...l.frags.map((f) => f.endX));
    l.text = norm(l.frags.map((f) => f.text).join(" "));
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

function cellsText(cells: Frag[][]): string[] {
  return cells.map((c) => norm(c.map((f) => f.text).join(" ")));
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

function fragHtml(f: Frag, baseSize: number): string {
  let html = esc(f.text);
  if (f.bold) html = `<strong>${html}</strong>`;
  if (f.italic) html = `<em>${html}</em>`;
  const ratio = f.size / baseSize;
  if (ratio >= 1.15 || ratio <= 0.85) {
    html = `<span style="font-size:${Math.round(Math.min(28, Math.max(8, f.size)) * 10) / 10}pt">${html}</span>`;
  }
  return html;
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

  const inner = lines
    .map((l) => l.frags.map((f) => fragHtml(f, baseSize)).join(" "))
    .join(" ");

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

function tableHtml(rows: Line[][], baseSize: number): string {
  const grid = rows.map((r) => cellsText(lineCells(r[0])));
  const width = Math.max(...grid.map((r) => r.length));
  const rtl = isRtl(grid.flat().join(" "));
  const body = grid
    .map((cells, idx) => {
      const padded = [...cells];
      while (padded.length < width) padded.push("");
      const tag = idx === 0 ? "th" : "td";
      const tds = padded
        .map((c) => `<${tag} style="border:1px solid rgba(128,128,128,.45);padding:6px 8px;overflow-wrap:anywhere">${esc(c) || "&nbsp;"}</${tag}>`)
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  void baseSize;
  return `<table style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;direction:${rtl ? "rtl" : "ltr"}"><tbody>${body}</tbody></table>`;
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
  const names: any = {}; for (const k in OPS) names[(OPS as any)[k]] = k;
  const seq = ops.fnArray.map((f: number) => names[f]);
  const g: any = globalThis; g.__imgDbg = g.__imgDbg || []; g.__imgDbg.push({ seq: seq.filter((n: string) => /image|transform|save|restore/i.test(n)).slice(0, 40), args: JSON.stringify(ops.argsArray.filter((a: any, i: number) => /image|transform/i.test(seq[i])).slice(0, 6)).slice(0, 400) });
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
 * logos and vector artwork alike. */
async function pageImages(page: any): Promise<Block[]> {
  console.log("[pdfimp] pageImages start");
  try {
    const boxes = await imageBoxes(page);
    console.log("[pdfimp] boxes", JSON.stringify(boxes));
    if (!boxes.length) return [];
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const full = document.createElement("canvas");
    full.width = Math.round(viewport.width);
    full.height = Math.round(viewport.height);
    const fctx = full.getContext("2d");
    if (!fctx) return [];
    fctx.fillStyle = "#ffffff";
    fctx.fillRect(0, 0, full.width, full.height);
    await page.render({ canvasContext: fctx, viewport, canvas: full }).promise;

    const out: Block[] = [];
    for (const b of boxes) {
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
      });
    }
    return out;
  } catch (e) {
    console.log("[pdfimp] error", String((e as Error)?.stack || e));
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
  type PageData = { blocks: Block[]; chrome: Candidate[]; height: number; width: number };
  const pages: PageData[] = [];
  let scanned = 0;
  let baseSizes: number[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines = fragsToLines(content.items ?? [], content.styles ?? {});

    if (!lines.length) {
      scanned += 1;
      const src = await renderPage(page);
      pages.push({
        blocks: src ? [{ kind: "image", y: 0, src, width: RENDER_MAX_WIDTH }] : [],
        chrome: [],
        height: viewport.height,
        width: viewport.width,
      });
      page.cleanup?.();
      continue;
    }

    baseSizes = baseSizes.concat(lines.flatMap((l) => l.frags.map((f) => f.size)));

    const topLimit = viewport.height * (1 - CHROME_BAND);
    const bottomLimit = viewport.height * CHROME_BAND;
    const chromeLines: Candidate[] = lines
      .filter((l) => l.y >= topLimit || l.y <= bottomLimit)
      .map((l) => ({ key: chromeKey(l.text), size: Math.max(...l.frags.map((f) => f.size)) }));

    const blocks = groupBlocks(lines);
    if (keep) {
      const imgs = await pageImages(page);
      blocks.push(...imgs);
    }
    blocks.sort((a, b) => b.y - a.y);

    pages.push({ blocks, chrome: chromeLines, height: viewport.height, width: viewport.width });
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
  pages.forEach((pg, idx) => {
    if (idx > 0) parts.push('<div data-page-break="true"></div>');
    for (const b of pg.blocks) {
      if (b.kind === "image") {
        parts.push(`<p style="text-align:center"><img src="${b.src}" style="max-width:100%;height:auto" /></p>`);
        continue;
      }
      if (b.kind === "table") {
        const rows = b.rows.filter((r) => !chrome.has(chromeKey(r[0].text)));
        if (!rows.length) continue;
        parts.push(tableHtml(rows, baseSize));
        continue;
      }
      const lines = b.lines.filter((l) => !chrome.has(chromeKey(l.text)) && !isPageNumber(l.text));
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
