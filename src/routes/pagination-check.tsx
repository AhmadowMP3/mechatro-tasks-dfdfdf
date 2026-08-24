// TEMPORARY verification route — deleted after the visual check.
import { createFileRoute } from "@tanstack/react-router";
import { PaginatedDoc } from "@/components/documents/PaginatedDoc";
import { defaultHeader, defaultFooter } from "@/lib/docs/defaults";
import { defaultModel, emptyClient, uid, type DocBlock } from "@/lib/docs/model";

export const Route = createFileRoute("/pagination-check")({ component: Check });

function Check() {
  const model = defaultModel();
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: uid(),
    descAr: `بند رقم ${i + 1} — وصف طويل لاختبار تقسيم الصفحات في المستند`,
    descEn: `Item ${i + 1}`,
    unitAr: "قطعة", unitEn: "pc", qty: i + 1, price: 1500 + i, discount: 0,
  }));
  const blocks: DocBlock[] = [
    { id: uid(), kind: "heading", ar: "اختبار", en: "Test" },
    {
      id: uid(), kind: "items", titleAr: "البنود", titleEn: "Items", rows,
      showUnit: true, showQty: true, showPrice: true, showTotals: true,
      taxRate: 11, discount: 0, shipping: 0,
    },
    { id: uid(), kind: "text", ar: "ملاحظة ختامية. ".repeat(60), en: "Closing note. ".repeat(60) },
  ];
  return (
    <div style={{ padding: 20, background: "#111" }}>
      <PaginatedDoc
        labels
        input={{
          header: defaultHeader("quotation"),
          footer: defaultFooter("quotation"),
          model: { ...model, showClientBox: true, blocks },
          client: { ...emptyClient(), nameAr: "شركة تجريبية", nameEn: "Demo Co", phone: "0999", email: "a@b.c" },
          lang: "ar",
          theme: "dark",
          currency: "USD",
          meta: { number: "QT-0001", date: "2026-08-24" },
        }}
      />
    </div>
  );
}
