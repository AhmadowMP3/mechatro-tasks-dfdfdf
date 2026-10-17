import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";

import { bandedPdf } from "./__fixtures__/banded-pdf";
import { A4_PT, composeIntoBands, displayedSize, keptBox, placement } from "./pdf-exact";

const BANDS = { topPx: 264, bottomPx: 171 }; // measured Mechatro letterhead
const CROP = { topPt: 60, bottomPt: 40 };

describe("displayed geometry", () => {
  test("a quarter-turned page is shown portrait", async () => {
    const doc = await PDFDocument.load(await bandedPdf([90]));
    expect(displayedSize(doc.getPage(0))).toMatchObject({ width: A4_PT.width, height: A4_PT.height, rotation: 90 });
  });

  test("the kept box drops the displayed top and bottom on every rotation", async () => {
    const doc = await PDFDocument.load(await bandedPdf([0, 90, 180, 270]));
    const [p0, p90, p180, p270] = doc.getPages();
    expect(keptBox(p0!, CROP)).toEqual({ left: 0, right: A4_PT.width, bottom: 40, top: A4_PT.height - 60 });
    expect(keptBox(p180!, CROP)).toEqual({ left: 0, right: A4_PT.width, bottom: 60, top: A4_PT.height - 40 });
    expect(keptBox(p90!, CROP)).toEqual({ left: 60, right: A4_PT.height - 40, bottom: 0, top: A4_PT.width });
    expect(keptBox(p270!, CROP)).toEqual({ left: 40, right: A4_PT.height - 60, bottom: 0, top: A4_PT.width });
  });

  test("cuts are capped so a wrong value can never erase the page", async () => {
    const doc = await PDFDocument.load(await bandedPdf([0]));
    const box = keptBox(doc.getPage(0), { topPt: 5000, bottomPt: -20 });
    expect(box.top - box.bottom).toBeGreaterThan(A4_PT.height * 0.5);
  });
});

describe("placement", () => {
  test("the kept part fits between the bands, centred, hanging from the header", () => {
    const p = placement({ width: A4_PT.width, height: A4_PT.height }, CROP, BANDS);
    const topBand = BANDS.topPx * 0.75;
    const bottomBand = BANDS.bottomPx * 0.75;
    expect(p.y + p.height).toBeCloseTo(A4_PT.height - topBand, 5);
    expect(p.y).toBeGreaterThanOrEqual(bottomBand - 1e-6);
    expect(p.x + p.width / 2).toBeCloseTo(A4_PT.width / 2, 5);
    expect(p.scale).toBeLessThan(1);
  });

  test("a small page is never enlarged", () => {
    expect(placement({ width: 300, height: 300 }, { topPt: 0, bottomPt: 0 }, BANDS).scale).toBe(1);
  });
});

describe("composeIntoBands", () => {
  test("one A4 portrait page per original page; landscape pages stay landscape", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4_PT.width, A4_PT.height]);
    doc.addPage([A4_PT.height, A4_PT.width]);
    const res = await composeIntoBands(await doc.save(), CROP, BANDS);
    expect(res.pages).toBe(2);
    expect(res.landscapePages).toBe(1);
    const out = await PDFDocument.load(res.pdf);
    expect(out.getPage(0).getSize()).toEqual({ width: A4_PT.width, height: A4_PT.height });
    expect(out.getPage(1).getSize().width).toBeCloseTo(A4_PT.height);
  });

  test("handles every rotation", async () => {
    const res = await composeIntoBands(await bandedPdf([0, 90, 180, 270]), CROP, BANDS);
    expect(res.pages).toBe(4);
    expect(res.landscapePages).toBe(0);
  });
});
