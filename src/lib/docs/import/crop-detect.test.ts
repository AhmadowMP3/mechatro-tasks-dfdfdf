import { describe, expect, test } from "vitest";

import { detectCropBands, inkProfile, type CropPageInput } from "./crop-detect";
import type { TextBox } from "./layout";

const H = 842;

/** A page profile with ink between the given [start, end] point ranges (1pt rows). */
function page(blocks: [number, number][], boxes: TextBox[] = []): CropPageInput {
  const ink = new Array(H).fill(0);
  for (const [s, e] of blocks) for (let y = s; y < e; y++) ink[y] = 0.2;
  return { height: H, rowPt: 1, ink, boxes };
}

const box = (text: string, y: number, h = 10): TextBox => ({ text, x: 60, y, w: 200, h });

const BODY: [number, number][] = [[200, 260], [280, 520], [540, 700]];

describe("detectCropBands", () => {
  test("a header and footer repeated on every page are cut", () => {
    const p = () => page([[20, 95], ...BODY, [780, 820]]);
    const s = detectCropBands([p(), p(), p()]);
    expect(s.topReason).toBe("repeats");
    expect(s.topPt).toBeGreaterThanOrEqual(95);
    expect(s.topPt).toBeLessThan(110);
    expect(s.bottomReason).toBe("repeats");
    expect(s.bottomPt).toBeGreaterThanOrEqual(H - 780);
  });

  test("a single page: a logo band (ink, no text) and a contacts footer are cut", () => {
    const s = detectCropBands([
      page([[20, 95], ...BODY, [780, 820]], [
        box("Quotation", 210), box("السادة شركة البنيان", 300),
        box("Mobile KSA: +966 56 56 99 437", 785), box("info@mechatro-sy.com", 800),
      ]),
    ]);
    expect(s.topReason).toBe("letterhead");
    expect(s.bottomReason).toBe("letterhead");
  });

  test("a single page whose first block is the document title keeps it", () => {
    const s = detectCropBands([
      page([[70, 90], ...BODY], [box("عرض سعر لتصميم أعمال الإلكتروميكانيك", 72, 16), box("السادة", 210)]),
    ]);
    expect(s.topPt).toBe(0);
    expect(s.topReason).toBeNull();
  });

  test("a scanned single page (no text layer) is never cut blindly", () => {
    const s = detectCropBands([page([[20, 95], ...BODY, [780, 820]])]);
    expect(s).toEqual({ topPt: 0, bottomPt: 0, topReason: null, bottomReason: null });
  });

  test("a header that only appears on the first page is not 'repeated'", () => {
    const s = detectCropBands([page([[20, 95], ...BODY]), page(BODY), page(BODY)]);
    expect(s.topReason).not.toBe("repeats");
  });

  test("bands never reach into the middle of the page", () => {
    const s = detectCropBands([page([[20, 400], [420, 700]]), page([[20, 400], [420, 700]])]);
    expect(s.topPt).toBe(0);
  });
});

describe("inkProfile", () => {
  test("counts non-white pixels per row", () => {
    const w = 4, h = 2;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    data.set([0, 0, 0, 255], 0); // one dark pixel in row 0
    data.set([24, 159, 209, 255], (w + 1) * 4); // brand blue in row 1
    expect(inkProfile(data, w, h)).toEqual([0.25, 0.25]);
  });
});
