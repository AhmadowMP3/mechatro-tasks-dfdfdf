// Single source of truth for the A4 body geometry.
//
// The preview (PaginatedDoc) and the editor's live pagination must agree on
// the usable body box, otherwise the same document breaks differently in the
// two views and the margins under the header look wrong in one of them.

import { A4_SIZE } from "./paginate";
import { pageMarginsPx, type DocHeader } from "./types";

/** Safety reserve: fonts settling a fraction later or Arabic line-height
 *  rounding must never push the last line past the sheet edge. */
export const BODY_SAFETY = 16;

/** Usable body width for a template's side margins. */
export function bodyWidthPx(header?: Partial<DocHeader> | null): number {
  return Math.max(240, A4_SIZE.width - 2 * pageMarginsPx(header).side);
}

/** Usable body height given the measured header/footer chrome height. */
export function bodyHeightPx(chromeHeight: number): number {
  return Math.max(200, A4_SIZE.height - chromeHeight - BODY_SAFETY);
}
