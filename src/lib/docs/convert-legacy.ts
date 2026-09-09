// Legacy → canonical model conversion.
//
// Two hops, both one-way:
//   1. legacy block documents  → Word-style HTML  (`blocksToHtml`)
//   2. Word-style HTML         → the canonical doc model (`htmlToDocModel`)
//
// Hop 2 holds the coercion rules the Word importer reuses: only the closed
// vocabulary of `doc-model.ts` survives. Fonts, sizes, colours, per-block
// margins, page geometry, headers, footers, floats and text boxes are dropped
// on the floor — the Mechatro template owns all of that.
//
// Conversion runs lazily: the first time an old document is opened it is
// converted, saved, and never converted again.

import { esc, buildItemsTableHtml, mergeItemsData, type RichCtx } from "./rich";
import type { DocModel } from "./model";
import { PAPER, type DocLang, type DocTheme } from "./types";
import {
  docFromBlocks,
  isDocBlockArray,
  makeRun,
  normaliseRuns,
  type DocAlign,
  type DocBlock,
  type DocRun,
  type DocumentModel,
} from "./doc-model";
import { readHtmlTable } from "./html-table";

/* ------------------------------------------- hop 1: legacy blocks → HTML */

const nl2p = (text: string, style = ""): string =>
  (text ?? "")
    .split(/\n{2,}/)
    .map((para) => `<p${style ? ` style="${style}"` : ""}>${esc(para).replace(/\n/g, "<br/>") || "<br/>"}</p>`)
    .join("");

export function blocksToHtml(model: DocModel, ctx: RichCtx): string {
  const ar = ctx.lang === "ar";
  const c = PAPER[ctx.theme];
  const out: string[] = [];

  for (const block of (model.blocks ?? []) as LegacyBlock[]) {
    out.push(blockToHtml(block, ar, c, ctx));
  }
  const html = out.filter(Boolean).join("");
  return html || "<p><br/></p>";
}

type Palette = { surface: string; border: string; muted: string; zebra: string };

/** Legacy blocks are read loosely — their types no longer exist in the model. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyBlock = any;

function blockToHtml(block: LegacyBlock, ar: boolean, c: Palette, ctx: RichCtx): string {
  switch (block.kind) {
    case "heading": {
      const t = ar ? block.ar : block.en;
      return t ? `<h2>${esc(t)}</h2>` : "";
    }
    case "text": {
      const t = ar ? block.ar : block.en;
      return t ? nl2p(t) : "";
    }
    case "spacer":
      return `<p style="margin:0"><br/></p>`;
    case "pagebreak":
      return `<div data-page-break="true"></div>`;
    case "terms": {
      const t = ar ? block.ar : block.en;
      const title = ar ? block.titleAr : block.titleEn;
      if (!t && !title) return "";
      return `${title ? `<h3>${esc(title)}</h3>` : ""}${t ? nl2p(t, "font-size:11px") : ""}`;
    }
    case "keyvalue": {
      const rows = ((block.rows ?? []) as LegacyBlock[]).filter((r) => (ar ? r.kAr || r.vAr : r.kEn || r.vEn));
      if (rows.length === 0) return "";
      const title = ar ? block.titleAr : block.titleEn;
      const body = rows
        .map(
          (r) =>
            `<tr><td style="border:1px solid ${c.border};padding:5px 8px;color:${c.muted};width:35%">${esc(ar ? r.kAr : r.kEn)}</td>` +
            `<td style="border:1px solid ${c.border};padding:5px 8px;font-weight:600">${esc(ar ? r.vAr : r.vEn)}</td></tr>`,
        )
        .join("");
      return `${title ? `<h3>${esc(title)}</h3>` : ""}<table style="width:100%;border-collapse:collapse;font-size:11.5px"><tbody>${body}</tbody></table>`;
    }
    case "table": {
      const head = (ar ? block.headAr : block.headEn) ?? [];
      if ((block.rows ?? []).length === 0) return "";
      const title = ar ? block.titleAr : block.titleEn;
      const th = (head as string[])
        .map((h: string) => `<th style="border:1px solid ${c.border};padding:6px 8px;background:${c.surface};text-align:inherit">${esc(h)}</th>`)
        .join("");
      const body = (block.rows as LegacyBlock[])
        .map((r: LegacyBlock, i: number) => {
          const cells = (ar ? r.cellsAr : r.cellsEn) ?? [];
          return (
            `<tr${i % 2 ? ` style="background:${c.zebra}"` : ""}>` +
            (head as string[]).map((_: string, ci: number) => `<td style="border:1px solid ${c.border};padding:6px 8px">${esc(cells[ci] ?? "")}</td>`).join("") +
            "</tr>"
          );
        })
        .join("");
      return `${title ? `<h3>${esc(title)}</h3>` : ""}<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
    }
    case "items": {
      const { id: _id, kind: _kind, startIndex: _si, ...data } = block;
      void _id; void _kind; void _si;
      return buildItemsTableHtml(mergeItemsData(data), ctx);
    }
    default:
      return "";
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* --------------------------------------------- hop 2: HTML → doc model */

const ALIGN_MAP: Record<string, DocAlign> = { left: "left", start: "left", center: "center", right: "right", end: "right", justify: "justify" };

function alignOf(el: Element, fallback: DocAlign = "left"): DocAlign {
  const raw = ((el as HTMLElement).style?.textAlign || el.getAttribute("align") || el.getAttribute("data-align") || "").toLowerCase();
  return ALIGN_MAP[raw] ?? fallback;
}

type Marks = Parameters<typeof makeRun>[1];

const BOLD = new Set(["B", "STRONG"]);
const ITALIC = new Set(["I", "EM"]);
const UNDER = new Set(["U", "INS"]);
const STRIKE = new Set(["S", "STRIKE", "DEL"]);

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
  if (BOLD.has(tag) || Number((el as HTMLElement).style?.fontWeight) >= 600) next.bold = true;
  if (ITALIC.has(tag) || (el as HTMLElement).style?.fontStyle === "italic") next.italic = true;
  if (UNDER.has(tag) || ((el as HTMLElement).style?.textDecoration ?? "").includes("underline")) next.underline = true;
  if (STRIKE.has(tag) || ((el as HTMLElement).style?.textDecoration ?? "").includes("line-through")) next.strike = true;
  if (tag === "SUP") next.superscript = true;
  if (tag === "SUB") next.subscript = true;
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    if (/^(https?:|mailto:|tel:)/i.test(href)) next.link = href;
  }

  for (const child of Array.from(el.childNodes)) collectRuns(child, next, out);
}

const runsOf = (el: Element): DocRun[] => {
  const out: DocRun[] = [];
  for (const child of Array.from(el.childNodes)) collectRuns(child, {}, out);
  return normaliseRuns(out);
};

function imageBlock(el: Element): DocBlock | null {
  const src = el.getAttribute("src") ?? "";
  if (!src) return null;
  const raw = Number(el.getAttribute("width") ?? parseFloat((el as HTMLElement).style?.width ?? ""));
  const align = ALIGN_MAP[(el.getAttribute("data-align") ?? "").toLowerCase()] ?? "center";
  return { type: "image", src, widthPx: Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null, align };
}

function tableBlock(el: Element): DocBlock | null {
  return readHtmlTable(el, runsOf, (cells) => cells.some((c) => c.tagName === "TH"));
}

function walkBlocks(parent: Element, out: DocBlock[]): void {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName;

    if (child.hasAttribute("data-page-break")) { out.push({ type: "pageBreak" }); continue; }

    switch (tag) {
      case "P":
      case "PRE":
      case "BLOCKQUOTE": {
        const img = child.querySelector("img");
        if (img && (child.textContent ?? "").trim() === "") {
          const block = imageBlock(img);
          if (block) out.push(block);
          continue;
        }
        out.push({ type: "paragraph", align: alignOf(child), runs: runsOf(child) });
        continue;
      }
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
        const level = Math.min(3, Number(tag.slice(1))) as 1 | 2 | 3;
        out.push({ type: "heading", level, align: alignOf(child), runs: runsOf(child) });
        continue;
      }
      case "UL":
      case "OL": {
        const items = Array.from(child.children)
          .filter((li) => li.tagName === "LI")
          .map((li) => runsOf(li));
        if (items.length > 0) out.push({ type: "list", ordered: tag === "OL", items });
        continue;
      }
      case "TABLE": {
        const block = tableBlock(child);
        if (block) out.push(block);
        continue;
      }
      case "IMG": {
        const block = imageBlock(child);
        if (block) out.push(block);
        continue;
      }
      case "HR":
        out.push({ type: "paragraph", align: "left", runs: [] });
        continue;
      case "SCRIPT":
      case "STYLE":
        continue;
      default: {
        // Wrappers (div/section/article/header-like boxes) contribute their
        // children, never their own styling.
        if (child.children.length > 0) { walkBlocks(child, out); continue; }
        const runs = runsOf(child);
        if (runs.length > 0) out.push({ type: "paragraph", align: alignOf(child), runs });
      }
    }
  }
}

/** Word-style HTML → the canonical model. Browser only (uses DOMParser). */
export function htmlToDocModel(html: string): DocumentModel {
  if (typeof DOMParser === "undefined") return docFromBlocks([]);
  const doc = new DOMParser().parseFromString(`<body>${html ?? ""}</body>`, "text/html");
  const blocks: DocBlock[] = [];
  walkBlocks(doc.body, blocks);
  return docFromBlocks(blocks);
}

/* --------------------------------------------------------------- helpers */

/** A legacy block document that still has no rich HTML body. */
export function needsConversion(model: DocModel): boolean {
  return !model.html || model.html.trim() === "";
}

/** True when `model.blocks` does not already hold the canonical model. */
export function needsModelConversion(model: DocModel): boolean {
  return !isDocBlockArray(model.blocks);
}

export function legacyLang(lang: DocLang): DocLang {
  return lang;
}

export function legacyTheme(theme: DocTheme): DocTheme {
  return theme;
}
