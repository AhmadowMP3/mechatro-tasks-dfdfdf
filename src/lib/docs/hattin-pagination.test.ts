// Page-break regression lock.
//
// The imported Hattin quotation is paginated with the real geometry
// (page height, resolved margins, header/footer chrome and the two named
// gaps). The test asserts the exact page count and the block index that opens
// each page. Any change to geometry or to the break rules moves these numbers
// and fails here, loudly, instead of silently shipping a broken document.
//
// Deliberate check: setting HEADER_GAP_PX to 400 must fail this test.

import { describe, expect, test } from "vitest";

import { hattinMeasured } from "./__fixtures__/hattin-quotation";
import { bodyBox, pageWithMargins, type PageChrome } from "./geometry";
import { paginate } from "./paginate";

/** The measured letterhead of the standard Mechatro sheet. */
const CHROME: PageChrome = { headerPx: 168, footerPx: 148, qrPx: 0 };
/** The client card on page one. */
const CLIENT_CARD_PX = 132;

function paginateHattin() {
  const box = bodyBox(CHROME, pageWithMargins(null, null));
  const spacer: Measured = { block: { type: "paragraph", align: "left", runs: [] }, heightPx: CLIENT_CARD_PX, splittable: false };
  const model = paginate([spacer, ...hattinMeasured()], box.heightPx);
  // Block indexes reported to the document, i.e. without the client-card spacer.
  const startBlocks = model.pages.map((p) => (p.parts[0] ? p.parts[0].blockIndex - 1 : -1));
  return { model, startBlocks, availPx: box.heightPx };
}

describe("Hattin quotation pagination", () => {
  test("body height is the one the geometry module defines", () => {
    expect(paginateHattin().availPx).toBe(1122.5 - 168 - 148 - 16 - 16);
  });

  test("page count and opening block of every page are locked", () => {
    const { model, startBlocks } = paginateHattin();
    expect(model.pages.length).toMatchInlineSnapshot(`5`);
    expect(startBlocks).toMatchInlineSnapshot(`
      [
        -1,
        9,
        14,
        40,
        43,
      ]
    `);
  });

  test("no page overflows its body box", () => {
    const { model, availPx } = paginateHattin();
    for (const page of model.pages) expect(page.usedPx).toBeLessThanOrEqual(availPx + 0.5);
  });

  test("every page opens on a whole block, in document order", () => {
    const { startBlocks } = paginateHattin();
    for (let i = 1; i < startBlocks.length; i += 1) {
      expect(startBlocks[i]!).toBeGreaterThan(startBlocks[i - 1]!);
    }
  });
});
