import { describe, expect, test } from "vitest";

import { hasSwappedLamAlef, repairLamAlef } from "./arabic-repair";

// Exactly as pdf.js extracts them from the Hattin quotation PDF.
const EXTRACTED = [
  "عرض سعر لتصميم أعمال اإللكتروميكانيك",
  "السادة شركة البنيان للمقاوالت المحترمون،",
  "عدد األدوار: 7 دور",
  "الاستثناءات".replace("الا", "اال"),
  "أي تعديالت جوهرية بعد اعتماد التصميم النهائي.",
  "حسابات فنية كاملة",
  "نظام التأريض والصواعق",
].join("\n");

describe("hasSwappedLamAlef", () => {
  test("recognises the fingerprint of a swapped document", () => {
    expect(hasSwappedLamAlef(EXTRACTED)).toBe(true);
  });

  test("a correctly extracted document is left alone", () => {
    expect(hasSwappedLamAlef("السادة شركة البنيان للمقاولات المحترمون، لا توجد تعديلات على الأعمال الكهربائية")).toBe(false);
  });

  test("short text only counts the impossible double alef", () => {
    expect(hasSwappedLamAlef("اإللكتروميكانيك")).toBe(true);
    expect(hasSwappedLamAlef("قالت")).toBe(false);
  });
});

describe("repairLamAlef", () => {
  const fix = (s: string) => repairLamAlef(s, true);

  test("restores the words of the Hattin quotation", () => {
    expect(fix("اإللكتروميكانيك")).toBe("الإلكتروميكانيك");
    expect(fix("للمقاوالت")).toBe("للمقاولات");
    expect(fix("األدوار")).toBe("الأدوار");
    expect(fix("االستثناءات")).toBe("الاستثناءات");
    expect(fix("تعديالت")).toBe("تعديلات");
  });

  test("common business words", () => {
    expect(fix("اتصاالت")).toBe("اتصالات");
    expect(fix("مجاالت")).toBe("مجالات");
    expect(fix("إعالن")).toBe("إعلان");
    expect(fix("إال")).toBe("إلا");
    expect(fix("ال يوجد")).toBe("لا يوجد");
    expect(fix("ألن")).toBe("لأن");
  });

  test("tanween on the ligature and the reversed currency word", () => {
    expect(fix("أو ًال: الأعمال الكهربائية")).toBe("أولاً: الأعمال الكهربائية");
    expect(fix("ألف لاير سعودي")).toBe("ألف ريال سعودي");
    expect(hasSwappedLamAlef("أو ًال")).toBe(true);
  });

  test("frequent words with lam-alef inside", () => {
    expect(fix("مالحظات")).toBe("ملاحظات");
    expect(fix("تاريخ استالم الدفعة")).toBe("تاريخ استلام الدفعة");
    expect(fix("مدة الصالحية")).toBe("مدة الصلاحية");
    expect(fix("خالل 15 يوم")).toBe("خلال 15 يوم");
  });

  test("never touches genuine article, prefixes or Latin text", () => {
    for (const w of ["السادة", "بالمشروع", "والمعدات", "للمقاول", "الكتلة", "رسالة", "مثال", "المبالغ", "مالك ومؤسسة", "الإجمالي", "MEP (Electrical)"]) {
      expect(fix(w)).toBe(w);
    }
  });

  test("without the document-level flag only the always-safe rule runs", () => {
    expect(repairLamAlef("اإللكتروميكانيك قالت", false)).toBe("الإلكتروميكانيك قالت");
    expect(repairLamAlef("قالت", false)).toBe("قالت");
  });
});
