// The ONLY source of page dimensions in the app. Every other module asks this
// file how big a sheet is and how much room the body has — nothing computes a
// page dimension on its own.

import { resolveMargins, type DocHeader, type DocSection } from "./types";

/** A4 at 96dpi. 1122.5 — not 1123, which overflows the printed sheet. */
export const PAGE = {
  widthPx: 794,
  heightPx: 1122.5,
  /** Template defaults; `pageWithMargins()` resolves the real ones. */
  marginSidePx: 48,
  marginTopPx: 48,
  marginBottomPx: 48,
} as const;

/** Breathing room under the letterhead rule. */
export const HEADER_GAP_PX = 16;
/** Breathing room above the footer band. */
export const FOOTER_GAP_PX = 16;

export type PageGeometry = {
  widthPx: number;
  heightPx: number;
  marginSidePx: number;
  marginTopPx: number;
  marginBottomPx: number;
};

/** Page geometry for a concrete document (template margins, or Word's sectPr). */
export function pageWithMargins(
  header?: Partial<DocHeader> | null,
  section?: DocSection | null,
): PageGeometry {
  const mg = resolveMargins(header, section);
  return {
    widthPx: PAGE.widthPx,
    heightPx: PAGE.heightPx,
    marginSidePx: mg.side,
    marginTopPx: mg.top,
    marginBottomPx: mg.bottom,
  };
}

export type PageChrome = { headerPx: number; footerPx: number; qrPx: number };
export type BodyBox = { widthPx: number; heightPx: number };

/**
 * Usable body area once the letterhead, footer band and QR row are removed.
 * The two named gaps above ARE the safety margin — no mystery fudge constant.
 *
 * Page margins: the letterhead bands are rendered INSIDE the sheet and their
 * own padding already contains the top and bottom margins (DocPaper pads the
 * header band by `margin.top` and the footer band by `margin.bottom`), so the
 * measured `chrome` heights include them and they must not be subtracted a
 * second time. Only the side margins are applied here, to the width.
 */
export function bodyBox(chrome: PageChrome, page: PageGeometry): BodyBox {
  return {
    widthPx: page.widthPx - 2 * page.marginSidePx,
    heightPx:
      page.heightPx - chrome.headerPx - chrome.footerPx - chrome.qrPx - HEADER_GAP_PX - FOOTER_GAP_PX,
  };
}

/** Full A4 box used by the renderers — the one and only page size in the app. */
export const A4_SIZE: { width: number; height: number } = { width: PAGE.widthPx, height: PAGE.heightPx };

/**
 * Vertical gap between two sibling blocks in the body. This MUST match
 * `.doc-rich > * + * { margin-top: … }`, which reads `--doc-block-gap`.
 */
export const BLOCK_GAP_PX = 8;

if (typeof document !== "undefined") {
  document.documentElement.style.setProperty("--doc-block-gap", `${BLOCK_GAP_PX}px`);
}


/** One rendered page of a document (resolved body HTML + client box flag). */
export type DocPage = {
  showClientBox: boolean;
  html: string;
  /** False only for the emergency fallback sheet, which must grow, not clip. */
  fitted?: boolean;
};

