import { describe, expect, test } from "vitest";

import { extractFields, parseDate, parseFileName, parseNum } from "./fields";

// The opening of the Hattin quotation, as both the Word and the PDF importers read it.
const HATTIN = [
  "عرض سعر لتصميم أعمال الإلكتروميكانيك (MEP)",
  "السادة شركة البنيان للمقاولات المحترمون،",
  "السيد محمد عيسى الخطيب المحترم،",
  "نتقدم إليكم بعرض سعر لتصميم أنظمة الكهربائية والميكانيكية لمجمع حطين وفق المخططات المعمارية المقدمة، حسب البيانات التالية:",
  "1 بيانات المشروع",
  "موقع المشروع: الرياض – المملكة العربية السعودية",
  "التكلفة الإجمالية ----ألف ريال سعودي",
];

describe("the Hattin quotation", () => {
  const f = extractFields({ lines: HATTIN, tables: [], fileName: "Mktro_QT_014_06_09_26_مجمع_حطين_شركة_البنيان.docx" });

  test("type, title, number and date", () => {
    expect(f.docType).toBe("quotation");
    expect(f.title).toBe("عرض سعر لتصميم أعمال الإلكتروميكانيك (MEP)");
    expect(f.number).toBe("QT-014");
    expect(f.issueDate).toBe("2026-09-06");
  });

  test("client and attention without the honorifics", () => {
    expect(f.client.nameAr).toBe("شركة البنيان للمقاولات");
    expect(f.client.attn).toBe("السيد محمد عيسى الخطيب");
  });

  test("currency and language", () => {
    expect(f.currency).toBe("SAR");
    expect(f.lang).toBe("ar");
  });
});

describe("labelled fields (English invoice)", () => {
  const f = extractFields({
    lines: [
      "TAX INVOICE",
      "Invoice No.: INV-2026-0042",
      "Date: 12 Oct 2026",
      "Bill To: Al Bunyan Contracting Co.",
      "Attn: Eng. Omar Haddad",
      "Tel: +966 55 123 4567",
      "Email: omar@bunyan.sa",
      "VAT No: 300123456700003",
      "Payment within 30 days. Valid for 15 days.",
    ],
    tables: [[
      ["No.", "Description", "Unit", "Qty", "Unit Price", "Total"],
      ["1", "Distribution board 400A", "pcs", "2", "1,250.00", "2,500.00"],
      ["2", "Cable 4x16mm²", "m", "120", "18.5", "2,220.00"],
      ["", "Sub Total", "", "", "", "4,720.00"],
      ["", "VAT 15%", "", "", "", "708.00"],
    ]],
  });

  test("header fields", () => {
    expect(f.docType).toBe("invoice");
    expect(f.number).toBe("INV-2026-0042");
    expect(f.issueDate).toBe("2026-10-12");
    expect(f.validUntil).toBe("2026-10-27");
    expect(f.client.nameEn).toBe("Al Bunyan Contracting Co.");
    expect(f.client.attn).toBe("Eng. Omar Haddad");
    expect(f.client.phone).toBe("+966 55 123 4567");
    expect(f.client.email).toBe("omar@bunyan.sa");
    expect(f.client.taxNumber).toBe("300123456700003");
  });

  test("item rows, without the totals", () => {
    expect(f.items).toEqual([
      { no: "1", descAr: null, descEn: "Distribution board 400A", unit: "pcs", qty: 2, price: 1250, total: 2500 },
      { no: "2", descAr: null, descEn: "Cable 4x16mm²", unit: "m", qty: 120, price: 18.5, total: 2220 },
    ]);
  });
});

describe("OCR punctuation", () => {
  test("misread commas after the honorifics are stripped", () => {
    const f = extractFields({ lines: ["السادة شركة البنيان للمقاولات المحترمون+", "السيد محمد عيسى الخطيب المحترم؛"], tables: [] });
    expect(f.client.nameAr).toBe("شركة البنيان للمقاولات");
    expect(f.client.attn).toBe("السيد محمد عيسى الخطيب");
  });
});

describe("supplier documents", () => {
  test("an item starting with 'Net…' is not a totals row", () => {
    const f = extractFields({
      lines: ["Invoice"],
      tables: [[["No.", "Description", "Qty", "Unit Price"], ["11", "Network switch 24-port PoE", "2", "1,450.00"], ["", "Net Total", "", "2,900.00"]]],
    });
    expect(f.items.map((i) => i.descEn)).toEqual(["Network switch 24-port PoE"]);
  });

  test("the sender's letterhead contacts are not the client's", () => {
    const f = extractFields({
      lines: [
        "Al Noor Electrical Supplies Co. Tel +966 11 234 5678 · sales@alnoor-elec.com",
        "TAX INVOICE",
        "Bill To: Mechatro Engineering Solutions",
        "Tel: +963 933 945 346  Payment: 30 days",
        "VAT No. 300987654300003 · P.O. Box 12345 Riyadh 11564",
      ],
      bodyLines: ["TAX INVOICE", "Bill To: Mechatro Engineering Solutions", "Tel: +963 933 945 346  Payment: 30 days"],
      tables: [],
    });
    expect(f.client.nameEn).toBe("Mechatro Engineering Solutions");
    expect(f.client.phone).toBe("+963 933 945 346");
    expect(f.client.email).toBeNull();
    expect(f.client.taxNumber).toBeNull();
  });

  test("a VAT number is one digit run, not every digit on the line", () => {
    const f = extractFields({ lines: ["VAT No. 300987654300003 · P.O. Box 12345 Riyadh 11564"], tables: [] });
    expect(f.client.taxNumber).toBe("300987654300003");
  });
});

describe("Arabic items table and dates", () => {
  test("Arabic headers, Arabic digits", () => {
    const f = extractFields({
      lines: ["فاتورة", "التاريخ: ١٥/٠٩/٢٠٢٦"],
      tables: [[["م", "البيان", "الكمية", "سعر الوحدة", "الإجمالي"], ["١", "لوحة توزيع", "٢", "١٬٢٥٠", "٢٬٥٠٠"], ["", "المجموع", "", "", "٢٬٥٠٠"]]],
    });
    expect(f.issueDate).toBe("2026-09-15");
    expect(f.items).toEqual([{ no: "١", descAr: "لوحة توزيع", descEn: null, unit: null, qty: 2, price: 1250, total: 2500 }]);
  });
});

describe("parsers", () => {
  test("numbers in every common shape", () => {
    expect(parseNum("1,250.50")).toBe(1250.5);
    expect(parseNum("1.250,50")).toBe(1250.5);
    expect(parseNum("216,000")).toBe(216000);
    expect(parseNum("١٬٢٥٠٫٧٥")).toBe(1250.75);
    expect(parseNum("—")).toBeNull();
  });

  test("dates", () => {
    expect(parseDate("06/09/2026")).toBe("2026-09-06");
    expect(parseDate("2026-09-06")).toBe("2026-09-06");
    expect(parseDate("Sep 6, 2026")).toBe("2026-09-06");
    expect(parseDate("6 أيلول 2026")).toBe("2026-09-06");
    expect(parseDate("not a date")).toBeNull();
  });

  test("file names", () => {
    expect(parseFileName("Mktro_QT_014_06_09_26_مجمع_حطين.docx")).toEqual({ code: "QT", number: "QT-014", date: "2026-09-06" });
    expect(parseFileName("INV-0042.pdf")).toEqual({ code: "INV", number: "INV-0042", date: null });
    expect(parseFileName("scan 1.pdf").number).toBeNull();
  });
});
