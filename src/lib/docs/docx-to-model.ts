// Word → Mechatro template.
//
// `docx-ooxml.ts` stays the extraction layer (document.xml, the styles.xml
// chain, numbering.xml, tables with vMerge/gridSpan, images). This module
// takes that extracted HTML and coerces it into the canonical doc model:
// structure and inline marks survive, every presentation decision (page
// setup, fonts, sizes, colours, spacing, headers/footers, shapes) is dropped
// so an imported document looks exactly like one created inside the app.

import {
  docFromBlocks,
  makeRun,
  normaliseRuns,
  type DocAlign,
  type DocBlock,
  type DocRun,
  type DocumentModel,
} from "./doc-model";
import { readHtmlTable } from "./html-table";

/** Usable body width of the Mechatro A4 sheet, in CSS pixels. */
export const TEMPLATE_BODY_WIDTH = 698;

export type ImportSummary = {
  counts: Record<"paragraph" | "heading" | "list" | "table" | "image" | "pageBreak", number>;
  images: number;
  /** Stable keys of what the importer deliberately threw away. */
  dropped: DroppedKind[];
};

export type DroppedKind =
  | "pageSetup"
  | "headersFooters"
  | "fontsAndColours"
  | "spacing"
  | "emptyParagraphs"
  | "shapes";

const ALIGN_MAP: Record<string, DocAlign> = {
  left: "left", start: "left", center: "center", right: "right", end: "right", justify: "justify",
};

const BOLD = new Set(["B", "STRONG"]);
const ITALIC = new Set(["I", "EM"]);
const UNDER = new Set(["U", "INS"]);
const STRIKE = new Set(["S", "STRIKE", "DEL"]);

type Marks = Parameters<typeof makeRun>[1];

function alignOf(el: Element, fallback: DocAlign = "left"): DocAlign {
  const raw = ((el as HTMLElement).style?.textAlign || el.getAttribute("align") || el.getAttribute("data-align") || "")
    .toLowerCase();
  return ALIGN_MAP[raw] ?? fallback;
}

function collectRuns(node: Node, marks: Marks, out: DocRun[]): void {
  if (node.nodeType === 3) {
    const text = node.nodeValue ?? "";
    if (text) out.push(makeRun(text, marks));
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName;
  if (tag === "BR") { out.push(makeRun("\n", marks)); return; }
  if (tag === "IMG" || tag === "SCRIPT" || tag === "STYLE") return;

  const next: Marks = { ...marks };
  const style = (el as HTMLElement).style;
  if (BOLD.has(tag) || Number(style?.fontWeight) >= 600) next.bold = true;
  if (ITALIC.has(tag) || style?.fontStyle === "italic") next.italic = true;
  if (UNDER.has(tag) || (style?.textDecoration ?? "").includes("underline")) next.underline = true;
  if (STRIKE.has(tag) || (style?.textDecoration ?? "").includes("line-through")) next.strike = true;
  if (tag === "SUP") next.superscript = true;
  if (tag === "SUB") next.subscript = true;
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    if (/^(https?:|mailto:|tel:)/i.test(href)) next.link = href;
  }

  for (const child of Array.from(el.childNodes)) collectRuns(child, next, out);
}

function runsOf(el: Element): DocRun[] {
  const out: DocRun[] = [];
  for (const child of Array.from(el.childNodes)) collectRuns(child, {}, out);
  return normaliseRuns(out);
}

const runsText = (runs: DocRun[]): string => runs.map((r) => r.text).join("").replace(/\u00a0/g, " ").trim();

/** Largest font size (pt) declared anywhere inside the paragraph. */
function maxFontPt(el: Element): number {
  let max = 0;
  const read = (node: Element) => {
    const raw = (node as HTMLElement).style?.fontSize ?? "";
    const m = /^([\d.]+)(pt|px)$/.exec(raw.trim());
    if (m) {
      const v = Number(m[1]);
      const pt = m[2] === "px" ? v * 0.75 : v;
      if (pt > max) max = pt;
    }
    for (const child of Array.from(node.children)) read(child);
  };
  read(el);
  return max;
}

/** Word "Heading N" already arrives as h1..h3; big + bold text becomes one too. */
function impliedHeadingLevel(el: Element): 1 | 2 | 3 | 0 {
  const text = (el.textContent ?? "").trim();
  if (!text || text.length > 120) return 0;
  const bold = !!el.querySelector("strong, b") || Number((el as HTMLElement).style?.fontWeight) >= 600;
  if (!bold) return 0;
  const pt = maxFontPt(el);
  if (pt >= 20) return 1;
  if (pt >= 18) return 2;
  if (pt >= 16) return 3;
  return 0;
}

function imageBlock(el: Element, align: DocAlign): DocBlock | null {
  const src = el.getAttribute("src") ?? "";
  if (!src) return null;
  const attrW = Number(el.getAttribute("width") ?? 0);
  const styleW = parseFloat((el as HTMLElement).style?.width ?? "");
  const raw = Number.isFinite(attrW) && attrW > 0 ? attrW : styleW;
  const widthPx = Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), TEMPLATE_BODY_WIDTH) : null;
  return { type: "image", src, widthPx, align };
}

/** A cell counts as a header cell when Word shaded it or set it bold. */
function looksLikeHeaderCell(cell: Element): boolean {
  if (cell.tagName === "TH") return true;
  const bg = ((cell as HTMLElement).style?.background || (cell as HTMLElement).style?.backgroundColor || "").trim();
  if (bg && !/transparent|^#f{3,6}$|rgba?\(\s*255,\s*255,\s*255/i.test(bg)) return true;
  const text = (cell.textContent ?? "").trim();
  return text.length > 0 && !!cell.querySelector("strong, b");
}

function tableBlock(el: Element): DocBlock | null {
  return readHtmlTable(el, runsOf, (cells) => cells.length > 0 && cells.every(looksLikeHeaderCell));
}

type Ctx = { blocks: DocBlock[]; images: number; dropped: Set<DroppedKind>; emptyParas: number };

function walk(parent: Element, ctx: Ctx): void {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName;

    if (child.hasAttribute("data-page-break")) { ctx.blocks.push({ type: "pageBreak" }); continue; }

    switch (tag) {
      case "P":
      case "PRE":
      case "BLOCKQUOTE": {
        const align = alignOf(child);
        const imgs = Array.from(child.querySelectorAll("img"));
        const runs = runsOf(child);
        if (imgs.length > 0) {
          for (const img of imgs) {
            const block = imageBlock(img, align === "left" ? "center" : align);
            if (block) { ctx.blocks.push(block); ctx.images += 1; }
          }
          if (runsText(runs).length === 0) continue;
        }
        if (runsText(runs).length === 0) { ctx.emptyParas += 1; continue; }
        const level = tag === "P" ? impliedHeadingLevel(child) : 0;
        ctx.blocks.push(level ? { type: "heading", level, align, runs } : { type: "paragraph", align, runs });
        continue;
      }
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
        const runs = runsOf(child);
        if (runsText(runs).length === 0) { ctx.emptyParas += 1; continue; }
        const level = Math.min(3, Number(tag.slice(1))) as 1 | 2 | 3;
        ctx.blocks.push({ type: "heading", level, align: alignOf(child), runs });
        continue;
      }
      case "UL":
      case "OL": {
        const items = Array.from(child.children)
          .filter((li) => li.tagName === "LI")
          .map((li) => runsOf(li))
          .filter((runs) => runsText(runs).length > 0);
        if (items.length > 0) ctx.blocks.push({ type: "list", ordered: tag === "OL", items });
        continue;
      }
      case "TABLE": {
        const block = tableBlock(child);
        if (block) ctx.blocks.push(block);
        continue;
      }
      case "IMG": {
        const block = imageBlock(child, "center");
        if (block) { ctx.blocks.push(block); ctx.images += 1; }
        continue;
      }
      case "HR":
        continue;
      case "SCRIPT":
      case "STYLE":
        continue;
      case "SVG":
      case "CANVAS":
      case "IFRAME":
      case "OBJECT":
      case "EMBED":
        ctx.dropped.add("shapes");
        continue;
      default: {
        // Wrappers contribute their children, never their own styling.
        if (child.children.length > 0) { walk(child, ctx); continue; }
        const runs = runsOf(child);
        if (runsText(runs).length > 0) ctx.blocks.push({ type: "paragraph", align: alignOf(child), runs });
        else ctx.emptyParas += 1;
      }
    }
  }
}

/**
 * Word-extracted HTML → the canonical model plus a summary of what was kept
 * and what was thrown away. Deterministic: the same file always yields the
 * same model.
 */
export function docxHtmlToDocModel(html: string): { doc: DocumentModel; summary: ImportSummary } {
  const counts: ImportSummary["counts"] = { paragraph: 0, heading: 0, list: 0, table: 0, image: 0, pageBreak: 0 };
  if (typeof DOMParser === "undefined") {
    return { doc: docFromBlocks([]), summary: { counts, images: 0, dropped: [] } };
  }

  const parsed = new DOMParser().parseFromString(`<body>${html ?? ""}</body>`, "text/html");
  const ctx: Ctx = { blocks: [], images: 0, dropped: new Set(), emptyParas: 0 };
  walk(parsed.body, ctx);

  // Trim page breaks that would open or close the document with a blank page.
  const blocks = ctx.blocks.slice();
  while (blocks.length > 0 && blocks[0].type === "pageBreak") blocks.shift();
  while (blocks.length > 0 && blocks[blocks.length - 1].type === "pageBreak") blocks.pop();

  for (const b of blocks) counts[b.type] += 1;

  const dropped: DroppedKind[] = ["pageSetup", "headersFooters", "fontsAndColours", "spacing"];
  if (ctx.emptyParas > 0) dropped.push("emptyParagraphs");
  if (ctx.dropped.has("shapes")) dropped.push("shapes");

  return { doc: docFromBlocks(blocks), summary: { counts, images: counts.image, dropped } };
}
