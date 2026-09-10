import { describe, expect, test } from "vitest";

import { paginate } from "./paginate";
import type { Measured } from "./measure";
import type { DocBlock } from "./doc-model";

const para = (lines: number[]): Measured => ({
  block: { type: "paragraph", align: "left", runs: [{ text: "x" }] } as DocBlock,
  heightPx: lines.reduce((a, b) => a + b, 0),
  splittable: lines.length > 1,
  lines,
});

const table = (rows: number[], headerRow = true): Measured => ({
  block: {
    type: "table",
    headerRow,
    columns: 1,
    rows: rows.map(() => [{ paragraphs: [[{ text: "c" }]], colSpan: 1, rowSpan: 1 }]),
  } as DocBlock,
  heightPx: rows.reduce((a, b) => a + b, 0),
  splittable: rows.length > 1,
  rows,
});

const image = (h: number): Measured => ({
  block: { type: "image", src: "data:,", widthPx: 100, align: "left" } as DocBlock,
  heightPx: h,
  splittable: false,
});

const pageBreak: Measured = { block: { type: "pageBreak" } as DocBlock, heightPx: 0, splittable: false };

const AVAIL = 100;

describe("paginate", () => {
  test("exact fit stays on one page", () => {
    const r = paginate([para([50]), para([50])], AVAIL);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]!.usedPx).toBe(100);
  });

  test("one pixel of overflow moves to a second page", () => {
    const r = paginate([para([50]), para([51])], AVAIL);
    expect(r.pages).toHaveLength(2);
    expect(r.pages[1]!.parts).toEqual([{ blockIndex: 1 }]);
  });

  test("a long table spans more than three pages and repeats its header", () => {
    const rows = [20, ...Array.from({ length: 20 }, () => 30)];
    const r = paginate([table(rows)], AVAIL);
    expect(r.pages.length).toBeGreaterThan(3);
    // Header (20) + two rows (60) = 80 on every page.
    for (const p of r.pages) expect(p.usedPx).toBeLessThanOrEqual(AVAIL);
    const covered = r.pages.flatMap((p) => p.parts).map((p) => p as { fromRow: number; toRow: number });
    expect(covered[0]!.fromRow).toBe(1);
    expect(covered.at(-1)!.toRow).toBe(rows.length - 1);
  });

  test("an image taller than the page is scaled down and gets its own page", () => {
    const r = paginate([para([20]), image(400)], AVAIL);
    expect(r.scaledImages).toEqual([{ blockIndex: 1, scale: 0.25 }]);
    expect(r.pages).toHaveLength(2);
    expect(r.pages[1]!.usedPx).toBe(AVAIL);
  });

  test("a page break as the first and as the last block", () => {
    const first = paginate([pageBreak, para([20])], AVAIL);
    expect(first.pages).toHaveLength(2);
    expect(first.pages[0]!.parts).toEqual([]);

    const last = paginate([para([20]), pageBreak], AVAIL);
    expect(last.pages).toHaveLength(1);
    expect(last.pages[0]!.usedPx).toBe(20);
  });

  test("never leaves a page over budget", () => {
    const r = paginate([para([30, 30, 30, 30]), table([10, 45, 45, 45]), image(60)], AVAIL);
    for (const p of r.pages) expect(p.usedPx).toBeLessThanOrEqual(AVAIL);
  });
});
