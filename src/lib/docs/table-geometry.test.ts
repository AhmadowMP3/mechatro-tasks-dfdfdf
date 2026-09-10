import { describe, expect, it } from "vitest";

import { docFromBlocks, fromTipTapJSON, makeCell, makeTable, toHtml, toTipTapJSON } from "./doc-model";

const BODY = 661;
const cell = (text: string, opts: Parameters<typeof makeCell>[1] = {}) => makeCell([[{ text }]], opts);

describe("table geometry round-trip", () => {
  it("keeps its own width, column split, alignment and direction", () => {
    const table = makeTable(
      { headerRow: false, columns: 3, rows: [[cell("a"), cell("b"), cell("c")]] },
      { colWidthsPct: [40, 30, 30], widthPct: 56, align: "center", rtl: true },
    );

    const json = toTipTapJSON(docFromBlocks([table]), BODY);
    const node = json.content![0] as { attrs?: Record<string, unknown> };
    expect(node.attrs).toMatchObject({ tableAlign: "center", tableRtl: true, tableWidthPct: 56 });

    const back = fromTipTapJSON(json, BODY).blocks[0];
    expect(back).toMatchObject({ type: "table", widthPct: 56, align: "center", rtl: true });
    expect((back as { colWidthsPct: number[] }).colWidthsPct).toEqual([40, 30, 30]);

    const html = toHtml(docFromBlocks([table]));
    expect(html).toContain('data-width-pct="56"');
    expect(html).toContain("width:56%");
    expect(html).toContain('<col style="width:40%"/>');
  });

  it("declared width wins over the pixel column sum", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { tableAlign: "left", tableRtl: false, tableWidthPct: 67 },
          content: [
            {
              type: "tableRow",
              content: [1, 2].map(() => ({
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
              })),
            },
          ],
        },
      ],
    };
    const back = fromTipTapJSON(json, BODY).blocks[0] as { widthPct: number };
    expect(back.widthPct).toBe(67);
  });

  it("keeps every fill on the row that follows a block of rowSpans", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        i % 2 === 0
          ? [cell(`a${i}`), cell(`b${i}`, { rowSpan: 2 }), cell(`c${i}`, { rowSpan: 2 })]
          : [cell(`a${i}`)],
      ),
      [cell("total", { fill: "#31869B" }), cell("x", { fill: "#E26B0A" }), cell("y", { fill: "#948A54" })],
    ];
    const table = makeTable({ headerRow: false, columns: 3, rows }, { colWidthsPct: [40, 30, 30], widthPct: 56 });

    const json = toTipTapJSON(docFromBlocks([table]), BODY);
    const back = fromTipTapJSON(json, BODY).blocks[0] as { rows: { fill?: string }[][] };
    expect(back.rows[6].map((c) => c.fill)).toEqual(["#31869B", "#E26B0A", "#948A54"]);

    const html = toHtml(docFromBlocks([table]));
    for (const fill of ["#31869B", "#E26B0A", "#948A54"]) {
      expect(html).toContain(`background-color:${fill}`);
    }
  });
});
