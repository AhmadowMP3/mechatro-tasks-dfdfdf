// Ready-made content snippets inserted from the editor ribbon.
// Each snippet returns plain document HTML in the document language, so the
// result is identical in the editor, the A4 preview, the PDF and Word.

import type { DocLang } from "./types";
import { esc, termsBlockHtml } from "./rich";

export type SnippetId =
  | "terms"
  | "scope"
  | "payment"
  | "deliverables"
  | "timeline"
  | "notes"
  | "signatures";

export type SnippetDef = { id: SnippetId; labelAr: string; labelEn: string };

export const DOC_SNIPPETS: SnippetDef[] = [
  { id: "terms", labelAr: "الشروط والأحكام", labelEn: "Terms & conditions" },
  { id: "scope", labelAr: "نطاق العمل", labelEn: "Scope of work" },
  { id: "payment", labelAr: "خطة الدفع", labelEn: "Payment plan" },
  { id: "deliverables", labelAr: "التسليمات", labelEn: "Deliverables" },
  { id: "timeline", labelAr: "الجدول الزمني", labelEn: "Timeline" },
  { id: "notes", labelAr: "ملاحظات", labelEn: "Notes" },
  { id: "signatures", labelAr: "التواقيع", labelEn: "Signatures" },
];

const h = (t: string) => `<h3>${esc(t)}</h3>`;
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

function table(headers: string[], rows: string[][]): string {
  const head = `<tr>${headers.map((c) => `<th><p>${esc(c)}</p></th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td><p>${esc(c) || "<br/>"}</p></td>`).join("")}</tr>`).join("");
  return `<table><tbody>${head}${body}</tbody></table>`;
}

/** Build the HTML for a snippet. `terms` comes from the type template. */
export function snippetHtml(id: SnippetId, lang: DocLang, terms?: string): string {
  const ar = lang === "ar";

  switch (id) {
    case "terms": {
      const fromTemplate = termsBlockHtml(lang, terms ?? "");
      if (fromTemplate) return fromTemplate;
      return (
        h(ar ? "الشروط والأحكام" : "Terms & Conditions") +
        ul(
          ar
            ? ["الأسعار بالعملة المذكورة ولا تشمل أي رسوم حكومية.", "العرض صالح للمدة المذكورة أعلاه.", "أي تعديل على نطاق العمل يستوجب عرضاً جديداً."]
            : ["Prices are in the stated currency and exclude government fees.", "This offer is valid for the period stated above.", "Any change to the scope of work requires a new offer."],
        )
      );
    }
    case "scope":
      return (
        h(ar ? "نطاق العمل" : "Scope of Work") +
        ul(ar ? ["البند الأول", "البند الثاني", "البند الثالث"] : ["First item", "Second item", "Third item"])
      );
    case "payment":
      return (
        h(ar ? "خطة الدفع" : "Payment Plan") +
        table(
          ar ? ["المرحلة", "النسبة", "الاستحقاق"] : ["Milestone", "Percentage", "Due"],
          ar
            ? [["دفعة أولى", "50%", "عند التعاقد"], ["دفعة ثانية", "30%", "عند التسليم الأولي"], ["دفعة أخيرة", "20%", "عند التسليم النهائي"]]
            : [["Advance", "50%", "On signing"], ["Second", "30%", "On first delivery"], ["Final", "20%", "On final delivery"]],
        )
      );
    case "deliverables":
      return (
        h(ar ? "التسليمات" : "Deliverables") +
        table(
          ar ? ["التسليم", "الوصف", "الصيغة"] : ["Deliverable", "Description", "Format"],
          [["", "", ""], ["", "", ""]],
        )
      );
    case "timeline":
      return (
        h(ar ? "الجدول الزمني" : "Timeline") +
        table(
          ar ? ["المرحلة", "المدة", "الملاحظات"] : ["Phase", "Duration", "Notes"],
          [["", "", ""], ["", "", ""]],
        )
      );
    case "notes":
      return h(ar ? "ملاحظات" : "Notes") + `<p style="font-size:11px"><br/></p>`;
    case "signatures":
      return table(
        ar ? ["الطرف الأول", "الطرف الثاني"] : ["First party", "Second party"],
        [
          ar ? ["الاسم:", "الاسم:"] : ["Name:", "Name:"],
          ar ? ["التوقيع:", "التوقيع:"] : ["Signature:", "Signature:"],
          ar ? ["التاريخ:", "التاريخ:"] : ["Date:", "Date:"],
        ],
      );
    default:
      return "";
  }
}
