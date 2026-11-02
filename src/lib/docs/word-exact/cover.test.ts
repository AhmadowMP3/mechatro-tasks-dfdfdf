import { describe, expect, test } from "vitest";

import { coveredRects, hasInk } from "./cover";
import { A4_WIDTH_PX } from "./letterhead";

const COVER = { firstTopPx: 300, topPx: 200, bottomPx: 100, stripPx: 92 };

function image(width: number, height: number, ink: { x: number; y: number }[] = []): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const { x, y } of ink) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  return data;
}

describe("hasInk", () => {
  const rect = { x0: 0, x1: 50, y0: 0, y1: 50 };

  test("a white area holds nothing", () => {
    expect(hasInk(image(50, 50), 50, rect)).toBe(false);
  });

  test("a speck is not content", () => {
    expect(hasInk(image(50, 50, [{ x: 3, y: 3 }]), 50, rect)).toBe(false);
  });

  test("text is content, but only inside the area", () => {
    const line = Array.from({ length: 30 }, (_, x) => ({ x, y: 40 }));
    expect(hasInk(image(50, 50, line), 50, rect)).toBe(true);
    expect(hasInk(image(50, 50, line), 50, { ...rect, y1: 30 })).toBe(false);
  });
});

describe("coveredRects", () => {
  const size = { width: A4_WIDTH_PX, height: 1123 };

  test("the first page's top band includes the client box", () => {
    const [top] = coveredRects({ ...size, index: 1, total: 3 }, COVER);
    expect(top!.y1).toBeCloseTo(300);
  });

  test("a middle page has header and footer only", () => {
    const rects = coveredRects({ ...size, index: 2, total: 3 }, COVER);
    expect(rects).toHaveLength(2);
    expect(rects[0]!.y1).toBeCloseTo(200);
    expect(rects[1]!.y0).toBeCloseTo(1023);
  });

  test("the last page adds the QR and signature cards, not the middle of the strip", () => {
    const rects = coveredRects({ ...size, index: 3, total: 3 }, COVER);
    expect(rects).toHaveLength(4);
    expect(rects[2]!.x1).toBeLessThan(size.width / 2);
    expect(rects[3]!.x0).toBeGreaterThan(size.width / 2);
    expect(rects[2]!.y0).toBeCloseTo(1123 - 100 - 92);
  });

  test("scales with the size of the image", () => {
    const [top] = coveredRects({ width: size.width / 2, height: 561.5, index: 2, total: 3 }, COVER);
    expect(top!.y1).toBeCloseTo(100);
  });
});
