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
 */
export function bodyBox(chrome: PageChrome, page: PageGeometry = PAGE): BodyBox {
  return {
    widthPx: page.widthPx - 2 * page.marginSidePx,
    heightPx:
      page.heightPx - chrome.headerPx - chrome.footerPx - chrome.qrPx - HEADER_GAP_PX - FOOTER_GAP_PX,
  };
}

/** Full A4 box used by the renderers. */
export const A4_SIZE = { width: PAGE.widthPx, height: 1123 } as const;

/** One rendered page of a document (resolved body HTML + client box flag). */
export type DocPage = {
  showClientBox: boolean;
  html: string;
  /** False only for the emergency fallback sheet, which must grow, not clip. */
  fitted?: boolean;
};

