// A stored document model: the Hattin (مجمع حطين / شركة البنيان) quotation as
// imported from Word. It is the regression fixture for page breaks.
//
// Heights are NOT measured at test time (there is no browser in the test
// runner). They come from one deterministic text-metrics model, declared here
// once, that mirrors the editor's body typography:
//   body width 698px, ~2.05 characters per 10px, line box 24px,
//   table row 34px, table cell padding 8px per row.
// The test therefore locks the BREAK DECISION and the GEOMETRY (page height,
// margins, header/footer gaps, chrome) — change any of those and the snapshot
// moves. It does not pretend to lock the browser's own font rendering.

import { makeCell, type DocBlock, type DocRun } from "../doc-model";
import type { Measured } from "../measure";

export const HATTIN_BODY_WIDTH_PX = 698;
export const LINE_HEIGHT_PX = 24;
export const CHARS_PER_LINE = 62;
export const TABLE_ROW_PX = 34;

type FixtureBlock =
  | { type: "paragraph" | "list"; chars: number; text: string }
  | { type: "table"; columns: number; rowChars: number[] };

/** The imported document, in order, empty paragraphs already dropped. */
export const HATTIN_BLOCKS: FixtureBlock[] = [
  { type: "paragraph", chars: 42, text: "عرض سعر لتصميم أعمال الإلكتروميكانيك (MEP)" },
  { type: "paragraph", chars: 40, text: "السادة شركة البنيان للمقاولات المحترمون،" },
  { type: "paragraph", chars: 31, text: "السيد محمد عيسى الخطيب المحترم،" },
  { type: "paragraph", chars: 122, text: "نتقدم إليكم بعرض سعر لتصميم أنظمة الكهربائية والميكانيكية" },
  { type: "table", columns: 2, rowChars: [14] },
  { type: "list", chars: 23, text: "نوع المشروع: تجاري سكني" },
  { type: "list", chars: 14, text: "عدد المباني: 6" },
  { type: "list", chars: 65, text: "عدد الأدوار: 7 دور" },
  { type: "list", chars: 47, text: "موقع المشروع: الرياض" },
  { type: "table", columns: 8, rowChars: [7, 20, 20, 20, 20, 20, 20] },
  { type: "table", columns: 2, rowChars: [17] },
  { type: "table", columns: 2, rowChars: [12, 47, 23] },
  { type: "table", columns: 2, rowChars: [38] },
  { type: "paragraph", chars: 38, text: "أولاً: الأعمال الكهربائية (Electrical)" },
  { type: "list", chars: 95, text: "تصميم أنظمة القوى الكهربائية لكل مبنى" },
  { type: "list", chars: 79, text: "لوحات التوزيع الرئيسية والفرعية" },
  { type: "list", chars: 59, text: "أنظمة الإنارة والتحكم بها" },
  { type: "list", chars: 23, text: "أنظمة والإنارة الطوارئ." },
  { type: "list", chars: 22, text: "نظام التأريض والصواعق." },
  { type: "list", chars: 19, text: "أنظمة التيار الخفيف" },
  { type: "list", chars: 26, text: "أنظمة الاتصالات والبيانات." },
  { type: "list", chars: 11, text: "أنظمة CCTV." },
  { type: "list", chars: 23, text: "حساب الأحمال الكهربائية" },
  { type: "list", chars: 26, text: "مخططات تنفيذية كاملة (IFC)" },
  { type: "paragraph", chars: 28, text: "ثانياً: أعمال التكييف (HVAC)" },
  { type: "list", chars: 68, text: "تصميم أنظمة التكييف والتهوية" },
  { type: "list", chars: 37, text: "حساب الأحمال الحرارية للمبنى C5 & C6." },
  { type: "list", chars: 51, text: "أنظمة التهوية العامة ومواقف السيارات" },
  { type: "list", chars: 17, text: "أنظمة سحب الدخان." },
  { type: "list", chars: 56, text: "مخططات تنفيذية كاملة (IFC) لتوزيع مجاري الهواء" },
  { type: "paragraph", chars: 33, text: "ثالثاً: الأعمال الصحية (Plumbing)" },
  { type: "list", chars: 42, text: "تصميم أنظمة التغذية بالمياه" },
  { type: "list", chars: 45, text: "تصميم أنظمة الصرف الصحي والمطر" },
  { type: "list", chars: 23, text: "حسابات السعات والخزانات" },
  { type: "list", chars: 26, text: "مخططات تنفيذية كاملة (IFC)" },
  { type: "table", columns: 2, rowChars: [29] },
  { type: "list", chars: 42, text: "مخططات تنفيذية كاملة (IFC) لجميع التخصصات." },
  { type: "list", chars: 39, text: "حسابات فنية كاملة (Design Calculations)" },
  { type: "list", chars: 19, text: "ملفات AutoCAD + PDF" },
  { type: "table", columns: 2, rowChars: [13] },
  { type: "table", columns: 4, rowChars: [10, 18, 10, 21, 8, 21, 8] },
  { type: "list", chars: 129, text: "مدة التصميم: 3 أشهر ونصف" },
  { type: "table", columns: 2, rowChars: [27] },
  { type: "table", columns: 3, rowChars: [10, 2, 2, 2, 2, 2, 2, 22, 0, 25] },
  { type: "paragraph", chars: 36, text: "التكلفة الإجمالية ----ألف ريال سعودي" },
  { type: "list", chars: 25, text: "الدفعات تناقش عن الاعتماد" },
  { type: "table", columns: 2, rowChars: [24] },
  { type: "list", chars: 10, text: "نمذجة BIM." },
  { type: "list", chars: 45, text: "أي تعديلات جوهرية بعد اعتماد التصميم النهائي." },
  { type: "list", chars: 57, text: "تحديث التصميم بسبب تغيير المعماري أو المالك" },
  { type: "paragraph", chars: 24, text: "محمد غياث شننمالك ومؤسسة" },
];

const run = (text: string): DocRun[] => [{ text }];

function paragraphHeight(chars: number): number {
  return Math.max(1, Math.ceil(chars / CHARS_PER_LINE)) * LINE_HEIGHT_PX;
}

function rowHeight(chars: number, columns: number): number {
  const perCell = Math.max(1, Math.ceil(chars / Math.max(6, Math.floor(CHARS_PER_LINE / columns))));
  return perCell * LINE_HEIGHT_PX + 10;
}

/** The fixture as canonical blocks with their deterministic heights. */
export function hattinMeasured(): Measured[] {
  return HATTIN_BLOCKS.map((b) => {
    if (b.type === "table") {
      const rows = b.rowChars.map((c) => rowHeight(c, b.columns));
      const block: DocBlock = {
        type: "table",
        headerRow: true,
        columns: b.columns,
        rows: b.rowChars.map(() => Array.from({ length: b.columns }, () => makeCell(run("c")))),
      };
      return { block, heightPx: rows.reduce((a, c) => a + c, 0), splittable: false, rows };
    }
    const height = paragraphHeight(b.chars);
    const block: DocBlock =
      b.type === "list"
        ? { type: "list", ordered: false, items: [run(b.text)] }
        : { type: "paragraph", align: "right", runs: run(b.text) };
    void TABLE_ROW_PX;
    return { block, heightPx: height, splittable: false };
  });
}
