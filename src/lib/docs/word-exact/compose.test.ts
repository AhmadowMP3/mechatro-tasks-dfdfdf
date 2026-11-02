import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";

import { displayedToPage, landscapePageCount, overlayLetterhead, pdfPageCount, trimTrailingBlankPages } from "./compose";

const A4: [number, number] = [595.28, 841.89];

async function pdf(sizes: [number, number][], ink = true): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  sizes.forEach((s) => {
    const page = doc.addPage(s);
    if (ink) page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  });
  return doc.save();
}

describe("overlayLetterhead", () => {
  test("keeps one page per Word page at the Word page size", async () => {
    const out = await overlayLetterhead(await pdf([A4, A4, A4]), await pdf([A4, A4, A4]), { title: "QT-1" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getSize()).toEqual({ width: A4[0], height: A4[1] });
    expect(doc.getTitle()).toBe("QT-1");
  });

  test("keeps landscape pages and still works with fewer letterhead sheets", async () => {
    const out = await overlayLetterhead(await pdf([A4, [A4[1], A4[0]]]), await pdf([A4]));
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(1).getSize().width).toBeCloseTo(A4[1]);
  });

  test("keeps a page of another size at that size", async () => {
    const letter: [number, number] = [612, 792];
    const out = await overlayLetterhead(await pdf([letter]), await pdf([A4]));
    expect((await PDFDocument.load(out)).getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  test("keeps a rotated page rotated", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([A4[1], A4[0]]);
    page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
    page.setRotation(degrees(90));
    const out = await PDFDocument.load(await overlayLetterhead(await doc.save(), await pdf([A4])));
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });

  test("survives blank pages on either side", async () => {
    const out = await overlayLetterhead(await pdf([A4, A4], false), await pdf([A4, A4], false));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  test("drops trailing blank pages only", async () => {
    const doc = await PDFDocument.create();
    doc.addPage(A4).drawText("one");
    doc.addPage(A4); // blank in the middle — kept
    doc.addPage(A4).drawRectangle({ x: 1, y: 1, width: 5, height: 5 });
    doc.addPage(A4); // trailing blank — dropped
    doc.addPage(A4); // trailing blank — dropped
    const out = await trimTrailingBlankPages(await doc.save());
    expect(await pdfPageCount(out)).toBe(3);
  });

  test("never drops the only page", async () => {
    expect(await pdfPageCount(await trimTrailingBlankPages(await pdf([A4], false)))).toBe(1);
  });

  test("counts pages", async () => {
    expect(await pdfPageCount(await pdf([A4, A4]))).toBe(2);
  });
});

describe("displayedToPage", () => {
  const page = async (rotation: number) => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([400, 600]);
    p.setCropBox(10, 20, 300, 500);
    p.setRotation(degrees(rotation));
    return p;
  };

  test("an upright page is offset by its crop box only", async () => {
    expect(displayedToPage(await page(0), 5, 7)).toEqual({ x: 15, y: 27, rotate: 0 });
  });

  // Corner shown at the lower left, for each /Rotate (clockwise on screen).
  test.each([
    [90, { x: 310, y: 20, rotate: 90 }],
    [180, { x: 310, y: 520, rotate: 180 }],
    [270, { x: 10, y: 520, rotate: 270 }],
  ])("the displayed origin of a page rotated %i", async (rotation, expected) => {
    expect(displayedToPage(await page(rotation), 0, 0)).toEqual(expected);
  });
});

describe("landscapePageCount", () => {
  test("counts pages as they are displayed", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4[1], A4[0]]);
    doc.addPage(A4);
    doc.addPage([A4[1], A4[0]]).setRotation(degrees(90));
    expect(await landscapePageCount(await doc.save())).toBe(1);
  });
});
