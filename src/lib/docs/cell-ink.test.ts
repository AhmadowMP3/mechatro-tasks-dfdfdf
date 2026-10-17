import { describe, expect, test } from "vitest";

import {
  cellFillStyle,
  cellInk,
  contrastRatio,
  fromTipTapJSON,
  INK_ON_DARK,
  INK_ON_LIGHT,
  inkForFill,
  makeCell,
  makeTable,
  toHtml,
  toTipTapJSON,
} from "./doc-model";

// Every fill used by the Hattin quotation (مجمع حطين).
const HATTIN_FILLS = {
  dark: ["#2E74B5", "#806528", "#31869B"],
  light: ["#E2EFDA", "#FDEBD0", "#D9D9D9", "#FFFFFF"],
};

describe("inkForFill", () => {
  test("white text on Word's dark section and header fills", () => {
    for (const fill of HATTIN_FILLS.dark) expect(inkForFill(fill)).toBe(INK_ON_DARK);
  });

  test("dark text on pale fills", () => {
    for (const fill of HATTIN_FILLS.light) expect(inkForFill(fill)).toBe(INK_ON_LIGHT);
  });

  test("every derived ink is readable (WCAG AA large text, 3:1)", () => {
    for (const fill of [...HATTIN_FILLS.dark, ...HATTIN_FILLS.light, "#E26B0A", "#76933C", "#F0676A"]) {
      expect(contrastRatio(inkForFill(fill)!, fill)).toBeGreaterThanOrEqual(3);
    }
  });

  test("no fill means no ink", () => {
    expect(inkForFill(null)).toBeUndefined();
    expect(inkForFill("transparent")).toBeUndefined();
  });
});

describe("cellInk", () => {
  test("keeps the source's own white text on orange", () => {
    expect(cellInk("#E26B0A", "#FFFFFF")).toBe("#FFFFFF");
  });

  test("replaces source text that would be unreadable on its fill", () => {
    expect(cellInk("#2E74B5", "#1F3864")).toBe(INK_ON_DARK);
    expect(cellInk("#FDEBD0", "#FFFFFF")).toBe(INK_ON_LIGHT);
  });

  test("accepts rgb() colours from the browser", () => {
    expect(cellInk("#806528", "rgb(255, 255, 255)")).toBe("#FFFFFF");
  });
});

describe("shaded cells round-trip", () => {
  const table = makeTable({
    headerRow: true,
    columns: 2,
    rows: [
      [makeCell([{ text: "بيانات المشروع" }], { fill: "#2E74B5", ink: "#FFFFFF" }), makeCell([{ text: "1" }], { fill: "#E26B0A", ink: "#FFFFFF" })],
      [makeCell([{ text: "C1" }], { fill: "#FDEBD0" }), makeCell([{ text: "x" }])],
    ],
  });

  test("ink is only kept on shaded cells", () => {
    expect(makeCell([{ text: "a" }], { ink: "#FF0000" }).ink).toBeUndefined();
  });

  test("HTML carries the fill and a readable ink on every shaded cell", () => {
    const html = toHtml({ version: 1, blocks: [table] });
    expect(html).toContain(`style="${cellFillStyle("#2E74B5", "#FFFFFF")}"`);
    expect(html).toContain("background-color:#E26B0A;color:#FFFFFF");
    expect(html).toContain(`background-color:#FDEBD0;color:${INK_ON_LIGHT}`);
    expect(html).toContain(`data-ink="#FFFFFF"`);
  });

  test("survives the editor round-trip", () => {
    const back = fromTipTapJSON(toTipTapJSON({ version: 1, blocks: [table] }, 698), 698);
    const t = back.blocks[0];
    if (t.type !== "table") throw new Error("table lost");
    expect(t.rows[0].map((c) => [c.fill, c.ink])).toEqual([["#2E74B5", "#FFFFFF"], ["#E26B0A", "#FFFFFF"]]);
    expect(t.rows[1][0].ink).toBeUndefined();
  });
});
