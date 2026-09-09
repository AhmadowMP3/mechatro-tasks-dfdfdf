// @vitest-environment jsdom
import { test, expect } from "vitest";
import { docxHtmlToDocModel } from "@/lib/docs/docx-to-model";
const html = `<h1 style="font-size:24pt">T</h1><p><br></p><p><br></p><p style="text-align:center;font-size:22pt"><strong>Big</strong></p><ol><li>a</li></ol><table><tbody><tr><td style="background:#dddddd"><strong>H</strong></td></tr><tr><td>x</td></tr></tbody></table><p><img src="data:image/png;base64,AA" width="1200" height="600"></p><div data-page-break="true"></div><p>end</p>`;
test("deterministic + coerced", () => {
  const a = docxHtmlToDocModel(html);
  const b = docxHtmlToDocModel(html);
  expect(JSON.stringify(a.doc)).toBe(JSON.stringify(b.doc));
  expect(a.summary.counts).toMatchObject({ heading: 2, list: 1, table: 1, image: 1, pageBreak: 1 });
  expect(a.doc.blocks.find((x) => x.type === "image")).toMatchObject({ widthPx: 698 });
  expect(a.doc.blocks.find((x) => x.type === "table")).toMatchObject({ headerRow: true });
});
