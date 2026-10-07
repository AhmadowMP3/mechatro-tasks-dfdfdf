import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";

import { overlayLetterhead, pdfPageCount, trimTrailingBlankPages } from "./compose";

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
