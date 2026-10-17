import { describe, expect, test } from "vitest";

import { groupLines, isRtlText, linesToLayout, mapLayoutText, pagesToLayout, visibleBoxes, type TextBox } from "./layout";

/** A word box: x is its left edge, y its top, 11pt text. */
const w = (text: string, x: number, y: number, width = text.length * 5): TextBox => ({ text, x, y, w: width, h: 11 });

describe("lines", () => {
  test("Arabic lines read right to left, words joined with spaces", () => {
    const [line] = groupLines([w("سعر", 300, 100, 20), w("عرض", 323, 100, 22)]);
    expect(line!.rtl).toBe(true);
    expect(line!.text).toBe("عرض سعر");
  });

  test("a wide gap splits a line into cells", () => {
    const [line] = groupLines([w("C1", 500, 100, 12), w("مكاتب", 300, 100, 30), w("تحت البناء", 100, 100, 50)]);
    expect(line!.segments.map((s) => s.text)).toEqual(["C1", "مكاتب", "تحت البناء"]);
  });

  test("mixed Arabic/Latin lines with real Arabic content are right to left", () => {
    expect(isRtlText("AutoCAD + PDF ملفات")).toBe(true);
    expect(isRtlText("Design Calculations")).toBe(false);
  });

  test("a hanging bullet stays with its text", () => {
    const [line] = groupLines([w("●", 520, 100, 6), w("نوع المشروع: تجاري سكني", 380, 100, 110)]);
    expect(line!.segments).toHaveLength(1);
  });
});

describe("tables", () => {
  // Header row, then two rows whose long cells wrap onto a second line while
  // the short cells sit vertically centred between them.
  const row = (y: number, key: string, status: string) => [
    w("مواقف سيارات", 330, y, 60), w("محلات تجارية", 200, y, 60),
    w(key, 470, y + 6.5, 12), w(status, 60, y + 6.5, 50),
    w("وخدمات", 345, y + 13, 30), w("+ مطاعم", 215, y + 13, 35),
  ];
  const boxes = [
    w("الكتلة", 465, 60, 25), w("B1", 355, 60, 12), w("GF", 225, 60, 12), w("الحالة", 70, 60, 30),
    ...row(80, "C1", "تحت البناء"),
    ...row(108, "C2", "أرض فضاء"),
  ];

  test("multi-line rows become one table row each, read right to left", () => {
    const layout = linesToLayout(groupLines(boxes));
    expect(layout.tables).toHaveLength(1);
    expect(layout.tables[0]).toEqual([
      ["الكتلة", "B1", "GF", "الحالة"],
      ["C1", "مواقف سيارات وخدمات", "محلات تجارية + مطاعم", "تحت البناء"],
      ["C2", "مواقف سيارات وخدمات", "محلات تجارية + مطاعم", "أرض فضاء"],
    ]);
    const table = layout.blocks.find((b) => b.type === "table");
    expect(table && table.type === "table" && table.rtl).toBe(true);
  });

  test("the paragraph after a table is not swallowed into it", () => {
    const layout = linesToLayout(groupLines([...boxes, w("التكلفة الإجمالية ألف ريال سعودي", 250, 160, 260)]));
    expect(layout.tables[0]).toHaveLength(3);
    expect(layout.blocks[layout.blocks.length - 1]).toMatchObject({ type: "paragraph", align: "right" });
  });
});

describe("paragraphs and lists", () => {
  test("bullet lines become one list; a following line after a gap is a paragraph", () => {
    const layout = linesToLayout(groupLines([
      w("● نمذجة BIM.", 450, 100, 70),
      w("● أي تعديلات جوهرية بعد اعتماد التصميم النهائي.", 280, 115, 240),
      w("محمد غياث شنن", 400, 170, 80),
    ]));
    expect(layout.blocks[0]).toEqual({
      type: "list",
      ordered: false,
      items: [[{ text: "نمذجة BIM." }], [{ text: "أي تعديلات جوهرية بعد اعتماد التصميم النهائي." }]],
    });
    expect(layout.blocks[1]).toMatchObject({ type: "paragraph" });
  });

  test("wrapped lines of one paragraph merge; a bigger line becomes a heading", () => {
    const layout = linesToLayout(groupLines([
      { text: "عرض سعر", x: 250, y: 40, w: 90, h: 16 },
      w("نتقدم إليكم بعرض سعر لتصميم أنظمة الكهربائية والميكانيكية", 100, 80, 420),
      w("لمجمع حطين وفق المخططات المعمارية المقدمة.", 220, 93, 300),
    ]));
    expect(layout.blocks[0]).toMatchObject({ type: "heading", align: "center" });
    expect(layout.blocks[1]).toMatchObject({ type: "paragraph", align: "right" });
    expect(layout.blocks).toHaveLength(2);
  });
});

describe("pages", () => {
  test("text inside the cropped header/footer bands is dropped", () => {
    const page = { width: 595, height: 842, boxes: [w("MECHATRO", 50, 20), w("نص المستند", 300, 300), w("Mobile KSA", 50, 820)] };
    expect(visibleBoxes(page, { topPt: 80, bottomPt: 60 }).map((b) => b.text)).toEqual(["نص المستند"]);
  });

  test("pages are joined with page breaks", () => {
    const page = (t: string) => ({ width: 595, height: 842, boxes: [w(t, 300, 300)] });
    const layout = pagesToLayout([page("أولى"), page("ثانية")]);
    expect(layout.blocks.map((b) => b.type)).toEqual(["paragraph", "pageBreak", "paragraph"]);
  });

  test("text fixes reach every string", () => {
    const layout = mapLayoutText(linesToLayout(groupLines([w("a", 10, 10), w("b", 200, 10), w("c", 10, 25), w("d", 200, 25)])), (s) => s.toUpperCase());
    expect(layout.lines.join()).toBe(layout.lines.join().toUpperCase());
    expect(JSON.stringify(layout.blocks)).not.toMatch(/"text":"[a-d]"/);
  });
});
