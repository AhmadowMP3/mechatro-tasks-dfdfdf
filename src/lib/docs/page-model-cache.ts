// One page engine for the editor, the preview and the PDF.
//
// The editor computes the page model while you type and publishes it here.
// The preview and the exporter read that very model — they never paginate
// again. A document that was never opened in the editor this session is
// computed once, with the same functions and the same inputs, and cached.

import { htmlToDocModel } from "./convert-legacy";
import type { DocBlock } from "./doc-model";
import { BLOCK_GAP_PX, bodyBox, pageWithMargins, type PageChrome } from "./geometry";
import { measureBlocks, type Measured } from "./measure";
import { paginate, type PageModel } from "./paginate";
import type { DocHeader, DocSection } from "./types";

export type DocPageModel = {
  pageModel: PageModel;
  /** Index of the top-level node that opens each page (-1 for an empty page). */
  pageStartNodes: number[];
  clampedImages: Array<{ blockIndex: number; scale: number }>;
  /** Top-level node each block came from (same length as the block list). */
  nodeOfBlock: number[];
  /** 1 when a reserved slot (client card) precedes the blocks, else 0. */
  blockOffset: number;
};


export type BuildPageModelArgs = {
  blocks: DocBlock[];
  /** Top-level node each block came from (same length as `blocks`). */
  nodeOfBlock: number[];
  chrome: PageChrome;
  header?: DocHeader | null;
  section?: DocSection | null;
  /** Space consumed at the top of page 1 outside the block model (client card). */
  reservePx?: number;
};

/** Letterhead chrome of the standard Mechatro sheet, used when nothing has
 *  been measured yet (a document opened straight into preview/export). */
export const ESTIMATED_CHROME: PageChrome = { headerPx: 168, footerPx: 148, qrPx: 0 };
/** Height the client card takes on page one when it has not been measured. */
export const ESTIMATED_CLIENT_CARD_PX = 132;

/**
 * The single break decision. Text blocks stay whole (a page opens on a whole
 * node in the editor); tables may break between rows, never inside a merged
 * row group.
 */
export async function buildPageModel(args: BuildPageModelArgs): Promise<DocPageModel> {
  const { blocks, nodeOfBlock, chrome, header = null, section = null, reservePx = 0 } = args;
  const geometry = pageWithMargins(header, section);
  const box = bodyBox(chrome, geometry);

  const measured = await measureBlocks(blocks, box);
  const prepared: Measured[] = measured.map((m) =>
    m.block.type === "table"
      ? m
      : { block: m.block, heightPx: m.heightPx, splittable: false },
  );

  const offset = reservePx > 0 ? 1 : 0;
  const input: Measured[] = offset
    ? [{ block: { type: "paragraph", align: "left", runs: [] }, heightPx: reservePx, splittable: false }, ...prepared]
    : prepared;

  const model = paginate(input, box.heightPx, BLOCK_GAP_PX);


  const pageStartNodes = model.pages.map((page) => {
    const first = page.parts[0];
    if (!first) return -1;
    const blockIndex = first.blockIndex - offset;
    if (blockIndex < 0) return -1;
    return nodeOfBlock[blockIndex] ?? -1;
  });

  return {
    pageModel: model,
    pageStartNodes,
    clampedImages: model.scaledImages.map((s) => ({ blockIndex: s.blockIndex - offset, scale: s.scale })),
    nodeOfBlock,
    blockOffset: offset,
  };
}


/** Split a document body into its top-level nodes and canonical blocks. */
export function blocksFromHtml(html: string): { blocks: DocBlock[]; nodeOfBlock: number[]; nodeCount: number } {
  const blocks: DocBlock[] = [];
  const nodeOfBlock: number[] = [];
  if (typeof DOMParser === "undefined") return { blocks, nodeOfBlock, nodeCount: 0 };

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const nodes = Array.from(doc.body.children);
  nodes.forEach((node, index) => {
    for (const block of htmlToDocModel(node.outerHTML).blocks) {
      blocks.push(block);
      nodeOfBlock.push(index);
    }
  });
  return { blocks, nodeOfBlock, nodeCount: nodes.length };
}

/* ------------------------------------------------------------------ cache */

const cache = new Map<string, DocPageModel>();
const MAX_ENTRIES = 12;

/** Stable key for a page model: same inputs → same key → same pages. */
export function pageModelKey(parts: unknown[]): string {
  return JSON.stringify(parts);
}

export function putPageModel(key: string, model: DocPageModel): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, model);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function peekPageModel(key: string): DocPageModel | null {
  return cache.get(key) ?? null;
}

/** Cached model, or one built now with the very same functions. */
export async function getPageModel(key: string, args: BuildPageModelArgs): Promise<DocPageModel> {
  const hit = cache.get(key);
  if (hit) return hit;
  const built = await buildPageModel(args);
  putPageModel(key, built);
  return built;
}
