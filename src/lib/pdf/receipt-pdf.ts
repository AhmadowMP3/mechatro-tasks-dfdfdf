// Text-based payment receipt PDF built directly on jsPDF.

import { jsPDF } from "jspdf";
import { formatMoney, type Invoice, type InvoicePayment, type Customer } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { BRAND, PAGE } from "./brand";
import { stampChrome, type ChromeOptions } from "./chrome";
import { ensureArabicFont, drawText, wrapText, shapeForPdf, setTextFont } from "./arabic-text";
import type { CompanySettings } from "@/components/finance/BrandedDocuments";

type Lang = "ar" | "en";

const MARGIN_X = 14;
const CONTENT_TOP = PAGE.marginTop + 6;
const CONTENT_BOTTOM = PAGE.height - PAGE.marginBottom - 4;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const C = {
  navy: rgb(BRAND.navy),
  blue: rgb(BRAND.blue),
  gold: rgb(BRAND.gold),
  ink: rgb(BRAND.ink),
  muted: rgb(BRAND.muted),
  border: rgb(BRAND.border),
  zebra: rgb(BRAND.zebra),
  white: [255, 255, 255] as [number, number, number],
  green: rgb("#3F782A"),
};

function fillRect(pdf: jsPDF, x: number, y: number, w: number, h: number, color: [number, number, number], radius = 0) {
  pdf.setFillColor(color[0], color[1], color[2]);
  if (radius > 0) pdf.roundedRect(x, y, w, h, radius, radius, "F");
  else pdf.rect(x, y, w, h, "F");
}
function strokeRect(pdf: jsPDF, x: number, y: number, w: number, h: number, color: [number, number, number], radius = 0) {
  pdf.setDrawColor(color[0], color[1], color[2]);
  pdf.setLineWidth(0.2);
  if (radius > 0) pdf.roundedRect(x, y, w, h, radius, radius, "S");
  else pdf.rect(x, y, w, h, "S");
}

export async function buildReceiptPdf(args: {
  payment: InvoicePayment;
  invoice: Invoice;
  customer: Customer | null;
  settings: CompanySettings | null;
  lang: Lang;
  methodLabel: string;
  chrome: ChromeOptions;
}): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const hasArabicFont = await ensureArabicFont(pdf);
  const pageW = pdf.internal.pageSize.getWidth();
  const isRtl = args.lang === "ar";
  const leftX = MARGIN_X;
  const rightX = pageW - MARGIN_X;
  const width = rightX - leftX;
  let y = CONTENT_TOP;

  const anchorPrimary = isRtl ? rightX : leftX;
  const anchorSecondary = isRtl ? leftX : rightX;
  const alignPrimary: "left" | "right" = isRtl ? "right" : "left";
  const alignSecondary: "left" | "right" = isRtl ? "left" : "right";

  // Title
  const receiptNo = `RCP-${(args.payment.id ?? "").slice(0, 8).toUpperCase()}`;
  drawText(pdf, args.lang === "ar" ? "إيصال دفع" : "PAYMENT RECEIPT", anchorPrimary, y + 3, {
    align: alignPrimary, size: 9, weight: "bold", color: C.muted, hasArabicFont,
  });
  y += 8;
  drawText(pdf, receiptNo, anchorPrimary, y + 6, {
    align: alignPrimary, size: 20, weight: "bold", color: C.navy, hasArabicFont,
  });
  y += 12;
  const barW = 22;
  fillRect(pdf, isRtl ? rightX - barW : leftX, y, barW, 1.6, C.gold, 0.8);
  y += 4;
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.15);
  pdf.line(leftX, y, rightX, y);
  y += 6;

  // Company + dates
  const startY = y;
  if (args.settings) {
    const name = args.lang === "ar"
      ? args.settings.company_name_ar || args.settings.company_name_en
      : args.settings.company_name_en || args.settings.company_name_ar;
    let cy = startY + 3;
    if (name) {
      drawText(pdf, name, isRtl ? rightX : leftX, cy, { align: isRtl ? "right" : "left", size: 12, weight: "bold", color: C.ink, hasArabicFont });
      cy += 4.5;
    }
    if (args.settings.company_email) {
      drawText(pdf, args.settings.company_email, isRtl ? rightX : leftX, cy, { align: isRtl ? "right" : "left", size: 8.5, color: C.muted, hasArabicFont });
      cy += 3.4;
    }
    if (args.settings.company_phone) {
      drawText(pdf, (args.lang === "ar" ? "هاتف: " : "Tel: ") + args.settings.company_phone, isRtl ? rightX : leftX, cy, { align: isRtl ? "right" : "left", size: 8.5, color: C.muted, hasArabicFont });
    }
  }
  let my = startY + 2;
  drawText(pdf, args.lang === "ar" ? "تاريخ الدفع" : "Payment date", anchorSecondary, my, {
    align: alignSecondary, size: 8.5, color: C.muted, hasArabicFont,
  });
  my += 3.6;
  drawText(pdf, formatDate(args.payment.paid_at, args.lang), anchorSecondary, my, {
    align: alignSecondary, size: 10, weight: "bold", color: C.ink, hasArabicFont,
  });
  my += 5;
  drawText(pdf, args.lang === "ar" ? "رقم الفاتورة" : "Invoice #", anchorSecondary, my, {
    align: alignSecondary, size: 8.5, color: C.muted, hasArabicFont,
  });
  my += 3.6;
  drawText(pdf, args.invoice.number ?? "—", anchorSecondary, my, {
    align: alignSecondary, size: 10, weight: "bold", color: C.ink, hasArabicFont,
  });
  y = Math.max(y + 26, my + 4);

  // Received from
  const rfH = 20;
  fillRect(pdf, leftX, y, width, rfH, C.zebra, 2);
  strokeRect(pdf, leftX, y, width, rfH, C.border, 2);
  const innerAnchor = isRtl ? rightX - 5 : leftX + 5;
  drawText(pdf, args.lang === "ar" ? "استلمنا من" : "RECEIVED FROM", innerAnchor, y + 5, {
    align: alignPrimary, size: 8, weight: "bold", color: C.muted, hasArabicFont,
  });
  const custName = args.customer
    ? (args.lang === "ar" ? args.customer.name_ar || args.customer.name_en : args.customer.name_en || args.customer.name_ar)
    : "—";
  drawText(pdf, custName ?? "—", innerAnchor, y + 11, {
    align: alignPrimary, size: 13, weight: "bold", color: C.ink, hasArabicFont,
  });
  if (args.customer?.company) {
    drawText(pdf, args.customer.company, innerAnchor, y + 16, {
      align: alignPrimary, size: 9, color: C.muted, hasArabicFont,
    });
  }
  y += rfH + 6;

  // Amount hero band
  const heroH = 30;
  fillRect(pdf, leftX, y, width, heroH, C.navy, 3);
  fillRect(pdf, leftX, y, width, 2, C.gold);
  drawText(pdf, args.lang === "ar" ? "المبلغ المستلم" : "AMOUNT RECEIVED", pageW / 2, y + 10, {
    align: "center", size: 9, weight: "bold", color: [200, 220, 235], hasArabicFont,
  });
  drawText(pdf, formatMoney(args.payment.amount, args.payment.currency, args.lang), pageW / 2, y + 23, {
    align: "center", size: 22, weight: "bold", color: C.white, hasArabicFont,
  });
  y += heroH + 8;

  // Detail rows
  const balanceAfter = Number(args.invoice.total) - Number(args.invoice.amount_paid);
  const row = (label: string, value: string, highlight?: [number, number, number]) => {
    if (y + 8 > CONTENT_BOTTOM) { pdf.addPage("a4", "portrait"); y = CONTENT_TOP; }
    drawText(pdf, label, isRtl ? rightX : leftX, y + 4, {
      align: isRtl ? "right" : "left", size: 9.5, color: C.muted, hasArabicFont,
    });
    drawText(pdf, value, isRtl ? leftX : rightX, y + 4, {
      align: isRtl ? "left" : "right", size: 10, weight: "bold", color: highlight ?? C.ink, hasArabicFont,
    });
    pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
    pdf.setLineWidth(0.15);
    pdf.line(leftX, y + 6.5, rightX, y + 6.5);
    y += 8;
  };

  row(args.lang === "ar" ? "طريقة الدفع" : "Payment method", args.methodLabel);
  if (args.payment.reference) row(args.lang === "ar" ? "مرجع" : "Reference", args.payment.reference);
  row(args.lang === "ar" ? "إجمالي الفاتورة" : "Invoice total", formatMoney(args.invoice.total, args.invoice.currency, args.lang));
  row(args.lang === "ar" ? "الرصيد المتبقي بعد الدفع" : "Balance after payment",
      formatMoney(balanceAfter, args.invoice.currency, args.lang),
      balanceAfter <= 0 ? C.green : undefined);

  if (args.payment.notes) {
    y += 4;
    const noteInner = width - 8;
    pdf.setFontSize(9);
    setTextFont(pdf, args.payment.notes, hasArabicFont);
    const lines = wrapText(pdf, args.payment.notes, noteInner);
    const boxH = 8 + lines.length * 4.2;
    if (y + boxH > CONTENT_BOTTOM) { pdf.addPage("a4", "portrait"); y = CONTENT_TOP; }
    fillRect(pdf, leftX, y, width, boxH, C.zebra, 2);
    strokeRect(pdf, leftX, y, width, boxH, C.border, 2);
    drawText(pdf, args.lang === "ar" ? "ملاحظات" : "NOTES", innerAnchor, y + 5, {
      align: alignPrimary, size: 8, weight: "bold", color: C.muted, hasArabicFont,
    });
    let ty = y + 10;
    for (const l of lines) {
      drawText(pdf, l, innerAnchor, ty, { align: alignPrimary, size: 9, color: C.ink, hasArabicFont });
      ty += 4.2;
    }
    y += boxH + 4;
  }

  // Signatures
  const sigTop = Math.max(y + 20, CONTENT_BOTTOM - 30);
  if (sigTop + 20 > CONTENT_BOTTOM) { pdf.addPage("a4", "portrait"); y = CONTENT_TOP; }
  const colW = (width - 20) / 2;
  const sigY = Math.min(sigTop, CONTENT_BOTTOM - 20);
  pdf.setDrawColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.setLineWidth(0.25);
  pdf.line(leftX, sigY, leftX + colW, sigY);
  pdf.line(rightX - colW, sigY, rightX, sigY);
  drawText(pdf, args.lang === "ar" ? "توقيع العميل" : "Customer signature", leftX + colW / 2, sigY + 5, {
    align: "center", size: 9, color: C.muted, hasArabicFont,
  });
  drawText(pdf, args.lang === "ar" ? "التوقيع والختم" : "Authorized signature", rightX - colW / 2, sigY + 5, {
    align: "center", size: 9, color: C.muted, hasArabicFont,
  });

  await stampChrome(pdf, args.chrome);
  // Suppress unused warning
  void shapeForPdf;
  return pdf;
}
