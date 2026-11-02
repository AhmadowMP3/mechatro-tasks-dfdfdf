// Does the letterhead sit on top of a page's own content? Pages are kept as they
// are, so an opaque part of the letterhead may hide something: these look at an
// image of the page so the admin can be warned. They never change anything.

import { A4_WIDTH_PX, STRIP_CARD_PX, type LetterheadCover } from "./letterhead";

type Rect = { x0: number; x1: number; y0: number; y1: number };

/** A pixel at or below this brightness (0–255) counts as ink. */
const INK_LEVEL = 200;
/** Fewer ink pixels than this in an area is a speck, not content. */
const MIN_INK_PIXELS = 12;

/** Does this rectangle of an RGBA image hold content? */
export function hasInk(rgba: Uint8ClampedArray, width: number, rect: Rect): boolean {
  let found = 0;
  for (let y = Math.max(0, Math.floor(rect.y0)); y < Math.floor(rect.y1); y++) {
    for (let x = Math.max(0, Math.floor(rect.x0)); x < Math.min(width, Math.floor(rect.x1)); x++) {
      const i = (y * width + x) * 4;
      if (Math.min(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) <= INK_LEVEL && ++found >= MIN_INK_PIXELS) return true;
    }
  }
  return false;
}

/** The areas of one page, in the units of an image of it, the letterhead covers. */
export function coveredRects(page: { index: number; total: number; width: number; height: number }, cover: LetterheadCover): Rect[] {
  const k = page.width / A4_WIDTH_PX;
  const { width: w, height: h } = page;
  const top = (page.index === 1 ? cover.firstTopPx : cover.topPx) * k;
  const bottom = cover.bottomPx * k;
  const rects = [{ x0: 0, x1: w, y0: 0, y1: top }, { x0: 0, x1: w, y0: h - bottom, y1: h }];
  if (page.index === page.total) {
    const y0 = h - bottom - cover.stripPx * k;
    const card = STRIP_CARD_PX * k;
    rects.push({ x0: 0, x1: card, y0, y1: h - bottom }, { x0: w - card, x1: w, y0, y1: h - bottom });
  }
  return rects;
}
