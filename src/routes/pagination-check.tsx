// TEMPORARY stress-test route for the document pagination / overlap pass.
// Deleted once verification is done.

import { createFileRoute } from "@tanstack/react-router";
import { PaginatedDoc } from "@/components/documents/PaginatedDoc";
import { defaultFooter, defaultHeader } from "@/lib/docs/defaults";
import type { DocBlock, DocModel } from "@/lib/docs/model";

export const Route = createFileRoute("/pagination-check")({
  component: Page,
  head: () => ({
    meta: [{ title: "Pagination check" }, { name: "robots", content: "noindex" }],
  }),
});

const LONG =
  "هذه فقرة طويلة جداً تهدف إلى اختبار قدرة النظام على تقسيم النصوص الطويلة عبر الصفحات دون قطع أو تداخل مع الترويسة أو التذييل. ".repeat(
    22,
  );

function Page() {
  const header = {
    ...defaultHeader("quotation"),
    companyAr: "شركة ميكاترو للتجارة والصناعة والمقاولات والخدمات الهندسية المتكاملة",
    titleAr: "عرض سعر تجاري مفصّل جداً",
    email: "very.long.email.address.for.testing@mechatro-sy.example.com",
    website: "https://dashboard.mechatro-sy.com/very/long/path/for/testing",
  };
  const footer = {
    ...defaultFooter("quotation"),
    bankAr: "بنك سورية الدولي الإسلامي — فرع دمشق المزة — رقم الحساب 1234567890123456 — IBAN SY00 0000 0000 0000 0000",
    signatureAr: "التوقيع والختم المعتمد",
  };

  const blocks: DocBlock[] = [
    { id: "t1", kind: "text", ar: LONG, en: LONG },
    {
      id: "i1",
      kind: "items",
      titleAr: "البنود",
      titleEn: "Items",
      rows: Array.from({ length: 60 }, (_, i) => ({
        id: `r${i}`,
        descAr: `بند رقم ${i + 1} — وصف طويل نسبياً لاختبار الالتفاف داخل الخلية بدون تداخل`,
        descEn: `Item ${i + 1}`,
        unitAr: "قطعة",
        unitEn: "pc",
        qty: i + 1,
        price: 1234.5,
        discount: 0,
      })),
      showUnit: true,
      showQty: true,
      showPrice: true,
      showTotals: true,
      taxRate: 11,
      discount: 100,
      shipping: 250,
    },
    { id: "tm", kind: "terms", titleAr: "الشروط والأحكام", titleEn: "Terms", ar: LONG, en: LONG },
  ];

  const model: DocModel = { showClientBox: true, blocks };

  return (
    <div style={{ padding: 20, background: "#0b0f14" }}>
      <PaginatedDoc
        input={{
          header,
          footer,
          model,
          client: {
            nameAr: "مؤسسة العميل التجارية المحدودة للاستيراد والتصدير",
            nameEn: "Client Co.",
            attn: "م. محمد غياث شنان",
            phone: "+963 999 999 999",
            email: "a.very.long.client.email.address@example-company-domain.com",
            address: "دمشق — المزة — شارع الجلاء — بناء رقم 12 — طابق 4 — مكتب 7 — سوريا",
            taxNumber: "1234567890",
            refAr: "مرجع طويل جداً لاختبار الالتفاف",
            refEn: "REF",
          },
          lang: "ar",
          theme: "dark",
          currency: "USD",
          meta: { number: "QT-2026-0001", date: "2026-08-24", validUntil: "2026-09-24", client: "مؤسسة العميل" },
        }}
        labels
      />
    </div>
  );
}
