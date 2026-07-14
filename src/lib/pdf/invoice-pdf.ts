// Text-based invoice PDF built directly on jsPDF (no html2canvas raster).
// Arabic strings are pre-shaped + BiDi-reordered so ligatures render correctly
// and the resulting PDF text is selectable and searchable.

import { jsPDF } from "jspdf";
import { formatMoney, type Currency, type Invoice, type InvoiceItem, type Customer } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { BRAND, PAGE, CONTENT_HEIGHT_MM } from "./brand";
import { stampChrome, type ChromeOptions } from "./chrome";
import { ensureArabicFont, drawText, wrapText, containsArabic, setTextFont, shapeForPdf } from "./arabic-text";
import type { CompanySettings } from "@/components/finance/BrandedDocuments";

type Lang = "ar" | "en";

const MARGIN_X = 14; // mm — matches the header/footer gold hairlines
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
  red: rgb("#C0392B"),
};

function statusText(status: string): { ar: string; en: string; tone: "green" | "red" | "blue" | "gray" } {
  const map: Record<string, { ar: string; en: string; tone: "green" | "red" | "blue" | "gray" }> = {
    draft: { ar: "مسودة", en: "DRAFT", tone: "gray" },
    issued: { ar: "صادرة", en: "ISSUED", tone: "blue" },
    partially_paid: { ar: "مدفوعة جزئياً", en: "PARTIALLY PAID", tone: "blue" },
    paid: { ar: "مدفوعة", en: "PAID", tone: "green" },
    overdue: { ar: "متأخرة", en: "OVERDUE", tone: "red" },
    void: { ar: "ملغاة", en: "VOID", tone: "gray" },
  };
  return map[status] ?? map.issued;
}

const toneColors: Record<"green" | "red" | "blue" | "gray", { bg: [number, number, number]; fg: [number, number, number] }> = {
  green: { bg: rgb("#DFF3D5"), fg: rgb("#2F5E1E") },
  red: { bg: rgb("#FBE0DE"), fg: rgb("#7E2822") },
  blue: { bg: rgb("#DDF0FA"), fg: C.navy },
  gray: { bg: rgb("#EEF1F4"), fg: rgb("#334155") },
};

type Ctx = {
  pdf: jsPDF;
  lang: Lang;
  hasArabicFont: boolean;
  y: number;
  isRtl: boolean;
  pageW: number;
};

function newPageIfNeeded(ctx: Ctx, needed: number) {
  if (ctx.y + needed > CONTENT_BOTTOM) {
    ctx.pdf.addPage("a4", "portrait");
    ctx.y = CONTENT_TOP;
  }
}

function fillRect(pdf: jsPDF, x: number, y: number, w: number, h: number, color: [number, number, number], radius = 0) {
  pdf.setFillColor(color[0], color[1], color[2]);
  if (radius > 0) pdf.roundedRect(x, y, w, h, radius, radius, "F");
  else pdf.rect(x, y, w, h, "F");
}

function strokeRect(pdf: jsPDF, x: number, y: number, w: number, h: number, color: [number, number, number], radius = 0, lineWidth = 0.2) {
  pdf.setDrawColor(color[0], color[1], color[2]);
  pdf.setLineWidth(lineWidth);
  if (radius > 0) pdf.roundedRect(x, y, w, h, radius, radius, "S");
  else pdf.rect(x, y, w, h, "S");
}

/* -------- Sections -------- */

function drawTitle(ctx: Ctx, subtitle: string, title: string) {
  const { pdf, isRtl, pageW } = ctx;
  const rightX = pageW - MARGIN_X;
  const leftX = MARGIN_X;
  const anchor = isRtl ? rightX : leftX;
  const align: "left" | "right" = isRtl ? "right" : "left";
  ctx.y += 2;
  drawText(pdf, subtitle, anchor, ctx.y + 3, {
    align, size: 9, weight: "bold", color: C.muted, hasArabicFont: ctx.hasArabicFont,
  });
  ctx.y += 6;
  drawText(pdf, title, anchor, ctx.y + 6, {
    align, size: 20, weight: "bold", color: C.navy, hasArabicFont: ctx.hasArabicFont,
  });
  ctx.y += 10;
  // Accent bar on the anchor side
  const barW = 22;
  const barX = isRtl ? rightX - barW : leftX;
  fillRect(pdf, barX, ctx.y, barW, 1.6, C.blue, 0.8);
  ctx.y += 4;
  // Subtle hairline
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.15);
  pdf.line(leftX, ctx.y, pageW - MARGIN_X, ctx.y);
  ctx.y += 6;
}

function drawStatusPill(ctx: Ctx, text: string, tone: "green" | "red" | "blue" | "gray", rightX: number, y: number): number {
  const { pdf } = ctx;
  const { bg, fg } = toneColors[tone];
  pdf.setFontSize(8.5);
  setTextFont(pdf, text, ctx.hasArabicFont, "bold");
  const w = pdf.getTextWidth(shapeForPdf(text)) + 8;
  const h = 5.5;
  const x = rightX - w;
  fillRect(pdf, x, y, w, h, bg, 2.5);
  drawText(pdf, text, x + w / 2, y + 3.8, {
    align: "center", size: 8.5, weight: "bold", color: fg, hasArabicFont: ctx.hasArabicFont,
  });
  return h;
}

function drawHeaderBlock(
  ctx: Ctx,
  invoice: Invoice,
  settings: CompanySettings | null,
) {
  const { pdf, lang, isRtl, pageW } = ctx;
  const leftX = MARGIN_X;
  const rightX = pageW - MARGIN_X;
  const startY = ctx.y;

  // Company (opposite side of the meta column)
  const companyX = isRtl ? leftX : leftX;
  const companyAlign: "left" | "right" = "left";
  const metaAnchor = isRtl ? leftX : rightX;
  const metaAlign: "left" | "right" = isRtl ? "left" : "right";

  // COMPANY block on primary side
  if (settings) {
    const name = lang === "ar" ? settings.company_name_ar || settings.company_name_en : settings.company_name_en || settings.company_name_ar;
    let cy = startY + 3;
    if (name) {
      drawText(pdf, name, isRtl ? rightX : leftX, cy, {
        align: isRtl ? "right" : "left", size: 12, weight: "bold", color: C.ink, hasArabicFont: ctx.hasArabicFont,
      });
      cy += 4.5;
    }
    const lines: string[] = [];
    if (settings.company_address) lines.push(settings.company_address);
    if (settings.company_phone) lines.push((lang === "ar" ? "هاتف: " : "Tel: ") + settings.company_phone);
    if (settings.company_email) lines.push(settings.company_email);
    if (settings.tax_number) lines.push((lang === "ar" ? "رقم ضريبي: " : "Tax ID: ") + settings.tax_number);
    for (const l of lines) {
      drawText(pdf, l, isRtl ? rightX : leftX, cy, {
        align: isRtl ? "right" : "left", size: 8.5, color: C.muted, hasArabicFont: ctx.hasArabicFont,
      });
      cy += 3.6;
    }
  }

  // META block (dates + status pill)
  let my = startY + 2;
  const st = statusText(invoice.status);
  const pillText = lang === "ar" ? st.ar : st.en;
  const pillH = drawStatusPill(ctx, pillText, st.tone, isRtl ? leftX + 40 : rightX, my);
  my += pillH + 3;

  drawText(pdf, lang === "ar" ? "تاريخ الإصدار" : "Issue date", metaAnchor, my, {
    align: metaAlign, size: 8.5, color: C.muted, hasArabicFont: ctx.hasArabicFont,
  });
  my += 3.6;
  drawText(pdf, formatDate(invoice.issue_date, lang), metaAnchor, my, {
    align: metaAlign, size: 10, weight: "bold", color: C.ink, hasArabicFont: ctx.hasArabicFont,
  });
  my += 4.5;
  if (invoice.due_date) {
    drawText(pdf, lang === "ar" ? "تاريخ الاستحقاق" : "Due date", metaAnchor, my, {
      align: metaAlign, size: 8.5, color: C.muted, hasArabicFont: ctx.hasArabicFont,
    });
    my += 3.6;
    drawText(pdf, formatDate(invoice.due_date, lang), metaAnchor, my, {
      align: metaAlign, size: 10, weight: "bold", color: C.ink, hasArabicFont: ctx.hasArabicFont,
    });
    my += 4.5;
  }
  // Silence unused warning
  void companyX; void companyAlign;

  ctx.y = Math.max(ctx.y + 26, my + 2);
}

function drawBillTo(ctx: Ctx, customer: Customer | null) {
  const { pdf, lang, isRtl, pageW } = ctx;
  const leftX = MARGIN_X;
  const rightX = pageW - MARGIN_X;
  const width = rightX - leftX;
  const boxH = 22;
  newPageIfNeeded(ctx, boxH + 4);

  fillRect(pdf, leftX, ctx.y, width, boxH, C.zebra, 2);
  strokeRect(pdf, leftX, ctx.y, width, boxH, C.border, 2);

  const innerAnchor = isRtl ? rightX - 5 : leftX + 5;
  const align: "left" | "right" = isRtl ? "right" : "left";
  drawText(pdf, lang === "ar" ? "الفاتورة إلى" : "BILL TO", innerAnchor, ctx.y + 5, {
    align, size: 8, weight: "bold", color: C.muted, hasArabicFont: ctx.hasArabicFont,
  });
  const name = customer
    ? (lang === "ar" ? customer.name_ar || customer.name_en : customer.name_en || customer.name_ar)
    : "—";
  drawText(pdf, name ?? "—", innerAnchor, ctx.y + 11, {
    align, size: 12, weight: "bold", color: C.ink, hasArabicFont: ctx.hasArabicFont,
  });
  const sub: string[] = [];
  if (customer?.company) sub.push(customer.company);
  const contact = [customer?.email, customer?.phone].filter(Boolean).join(" · ");
  if (contact) sub.push(contact);
  let sy = ctx.y + 15.5;
  for (const s of sub) {
    drawText(pdf, s, innerAnchor, sy, {
      align, size: 8.5, color: C.muted, hasArabicFont: ctx.hasArabicFont,
    });
    sy += 3.4;
  }
  ctx.y += boxH + 6;
}

/* -------- Items table -------- */

type Col = { key: "desc" | "qty" | "unit" | "disc" | "total"; label: { ar: string; en: string }; width: number; align: "left" | "right" | "center" };

function itemsColumns(isRtl: boolean, totalWidth: number): Col[] {
  // Fixed side columns; description gets whatever is left.
  const qty = 15;
  const unit = 26;
  const disc = 22;
  const total = 28;
  const desc = totalWidth - qty - unit - disc - total;
  const cols: Col[] = [
    { key: "desc", label: { ar: "الوصف", en: "Description" }, width: desc, align: "left" },
    { key: "qty", label: { ar: "الكمية", en: "Qty" }, width: qty, align: "center" },
    { key: "unit", label: { ar: "السعر", en: "Unit" }, width: unit, align: "right" },
    { key: "disc", label: { ar: "خصم", en: "Disc." }, width: disc, align: "right" },
    { key: "total", label: { ar: "الإجمالي", en: "Total" }, width: total, align: "right" },
  ];
  return isRtl ? cols.slice().reverse().map((c) => ({ ...c, align: c.align === "left" ? "right" : c.align === "right" ? "left" : c.align })) : cols;
}

function drawItemsTable(ctx: Ctx, invoice: Invoice, items: InvoiceItem[]) {
  const { pdf, lang, pageW } = ctx;
  const leftX = MARGIN_X;
  const rightX = pageW - MARGIN_X;
  const width = rightX - leftX;
  const cols = itemsColumns(ctx.isRtl, width);
  const headerH = 8;
  const rowPad = 3;
  const minRowH = 8;

  // Precompute x offsets left-to-right
  const xs: number[] = [];
  let cx = leftX;
  for (const c of cols) { xs.push(cx); cx += c.width; }

  const cellAnchor = (col: Col, i: number): { x: number; align: "left" | "right" | "center" } => {
    const x0 = xs[i];
    if (col.align === "center") return { x: x0 + col.width / 2, align: "center" };
    if (col.align === "right") return { x: x0 + col.width - 3, align: "right" };
    return { x: x0 + 3, align: "left" };
  };

  const drawHeader = () => {
    newPageIfNeeded(ctx, headerH + minRowH);
    fillRect(pdf, leftX, ctx.y, width, headerH, C.navy);
    fillRect(pdf, leftX, ctx.y + headerH - 0.8, width, 0.8, C.gold);
    cols.forEach((col, i) => {
      const { x, align } = cellAnchor(col, i);
      drawText(pdf, lang === "ar" ? col.label.ar : col.label.en, x, ctx.y + 5.5, {
        align, size: 9, weight: "bold", color: C.white, hasArabicFont: ctx.hasArabicFont,
      });
    });
    ctx.y += headerH;
  };

  drawHeader();

  const descColIndex = cols.findIndex((c) => c.key === "desc");
  const descCol = cols[descColIndex];
  const descInnerW = descCol.width - 6;

  items.forEach((it, idx) => {
    const descText = (lang === "ar" ? it.description_ar || it.description_en : it.description_en || it.description_ar) ?? "—";
    // Set the right font size before measuring
    pdf.setFontSize(9.5);
    setTextFont(pdf, descText, ctx.hasArabicFont, "normal");
    const descLines = wrapText(pdf, descText, descInnerW);
    const linesN = Math.max(1, descLines.length);
    const rowH = Math.max(minRowH, linesN * 4.5 + rowPad * 2 - 2);

    newPageIfNeeded(ctx, rowH);
    if (idx % 2 === 1) fillRect(pdf, leftX, ctx.y, width, rowH, C.zebra);
    pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
    pdf.setLineWidth(0.15);
    pdf.line(leftX, ctx.y + rowH, rightX, ctx.y + rowH);

    cols.forEach((col, i) => {
      const { x, align } = cellAnchor(col, i);
      const baseY = ctx.y + 5.5;
      switch (col.key) {
        case "desc": {
          let ty = baseY;
          for (const line of descLines) {
            drawText(pdf, line, x, ty, {
              align, size: 9.5, color: C.ink, hasArabicFont: ctx.hasArabicFont,
            });
            ty += 4.5;
          }
          break;
        }
        case "qty":
          drawText(pdf, String(Number(it.quantity)), x, baseY, {
            align, size: 9.5, color: C.ink, hasArabicFont: ctx.hasArabicFont,
          });
          break;
        case "unit":
          drawText(pdf, formatMoney(it.unit_price, invoice.currency, lang), x, baseY, {
            align, size: 9.5, color: C.ink, hasArabicFont: ctx.hasArabicFont,
          });
          break;
        case "disc":
          drawText(pdf, Number(it.discount_amount) > 0 ? formatMoney(it.discount_amount, invoice.currency, lang) : "—", x, baseY, {
            align, size: 9.5, color: C.muted, hasArabicFont: ctx.hasArabicFont,
          });
          break;
        case "total":
          drawText(pdf, formatMoney(it.line_total, invoice.currency, lang), x, baseY, {
            align, size: 9.5, weight: "bold", color: C.ink, hasArabicFont: ctx.hasArabicFont,
          });
          break;
      }
    });
    ctx.y += rowH;
  });
  ctx.y += 6;
}

/* -------- Totals block -------- */

function drawTotals(ctx: Ctx, invoice: Invoice) {
  const { pdf, lang, isRtl, pageW } = ctx;
  const boxW = 82;
  const boxX = isRtl ? MARGIN_X : pageW - MARGIN_X - boxW;
  const labelX = isRtl ? boxX + boxW - 3 : boxX + 3;
  const valueX = isRtl ? boxX + 3 : boxX + boxW - 3;
  const labelAlign: "left" | "right" = isRtl ? "right" : "left";
  const valueAlign: "left" | "right" = isRtl ? "left" : "right";
  const balance = Number(invoice.total) - Number(invoice.amount_paid);

  const line = (label: string, value: string, opts?: { color?: [number, number, number]; bold?: boolean; muted?: boolean }) => {
    newPageIfNeeded(ctx, 7);
    drawText(pdf, label, labelX, ctx.y + 4, {
      align: labelAlign, size: 9.5, color: opts?.muted ? C.muted : C.ink, hasArabicFont: ctx.hasArabicFont,
    });
    drawText(pdf, value, valueX, ctx.y + 4, {
      align: valueAlign, size: 10, weight: opts?.bold ? "bold" : "normal", color: opts?.color ?? C.ink, hasArabicFont: ctx.hasArabicFont,
    });
    pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
    pdf.setLineDashPattern([0.6, 0.6], 0);
    pdf.setLineWidth(0.15);
    pdf.line(boxX, ctx.y + 6.2, boxX + boxW, ctx.y + 6.2);
    pdf.setLineDashPattern([], 0);
    ctx.y += 7;
  };

  line(lang === "ar" ? "المجموع الفرعي" : "Subtotal", formatMoney(invoice.subtotal, invoice.currency, lang));
  if (Number(invoice.discount_amount) > 0) {
    line(lang === "ar" ? "خصم" : "Discount", "-" + formatMoney(invoice.discount_amount, invoice.currency, lang), { muted: true });
  }
  if (Number(invoice.tax_rate) > 0) {
    line(`${lang === "ar" ? "ضريبة" : "Tax"} (${Number(invoice.tax_rate)}%)`, formatMoney(invoice.tax_amount, invoice.currency, lang));
  }
  ctx.y += 2;

  // Total emphasis box
  const totalH = 12;
  newPageIfNeeded(ctx, totalH + 2);
  fillRect(pdf, boxX, ctx.y, boxW, totalH, C.navy, 2);
  fillRect(pdf, boxX, ctx.y, boxW, 1.4, C.gold);
  drawText(pdf, lang === "ar" ? "الإجمالي" : "TOTAL", labelX, ctx.y + 7.5, {
    align: labelAlign, size: 9, weight: "bold", color: C.white, hasArabicFont: ctx.hasArabicFont,
  });
  drawText(pdf, formatMoney(invoice.total, invoice.currency, lang), valueX, ctx.y + 8, {
    align: valueAlign, size: 13, weight: "bold", color: C.white, hasArabicFont: ctx.hasArabicFont,
  });
  ctx.y += totalH + 3;

  if (Number(invoice.amount_paid) > 0) {
    line(lang === "ar" ? "المدفوع" : "Paid", formatMoney(invoice.amount_paid, invoice.currency, lang), { color: C.green });
    line(
      lang === "ar" ? "الرصيد المستحق" : "Balance due",
      formatMoney(balance, invoice.currency, lang),
      { color: balance > 0 ? C.red : C.green, bold: true },
    );
  }
  ctx.y += 4;
}

/* -------- Notes / Bank -------- */

function drawNotesAndBank(ctx: Ctx, invoice: Invoice, settings: CompanySettings | null) {
  const { pdf, lang, isRtl, pageW } = ctx;
  const leftX = MARGIN_X;
  const rightX = pageW - MARGIN_X;
  const gap = 6;
  const width = rightX - leftX;
  const notes = lang === "ar" ? invoice.notes_ar || invoice.notes_en : invoice.notes_en || invoice.notes_ar;
  const showBank = !!settings?.bank_account_number;
  const cardW = notes && showBank ? (width - gap) / 2 : width;

  if (!notes && !showBank) return;

  const startY = ctx.y;
  let maxBottom = startY;

  const drawCard = (x: number, title: string, lines: { label?: string; value: string; strong?: boolean }[]) => {
    pdf.setFontSize(9);
    setTextFont(pdf, lines.map(l => (l.label ?? "") + l.value).join("\n"), ctx.hasArabicFont);
    // Compute wrapped lines
    const inner = cardW - 8;
    const wrapped: string[] = [];
    for (const l of lines) {
      const text = l.label ? `${l.label}: ${l.value}` : l.value;
      const parts = text.split(/\r?\n/);
      for (const p of parts) wrapped.push(...(wrapText(pdf, p, inner).length ? wrapText(pdf, p, inner) : [""]));
    }
    const h = 8 + wrapped.length * 4.2 + 4;
    fillRect(pdf, x, startY, cardW, h, C.zebra, 2);
    strokeRect(pdf, x, startY, cardW, h, C.border, 2);
    const anchor = isRtl ? x + cardW - 4 : x + 4;
    const align: "left" | "right" = isRtl ? "right" : "left";
    drawText(pdf, title, anchor, startY + 5, {
      align, size: 8, weight: "bold", color: C.muted, hasArabicFont: ctx.hasArabicFont,
    });
    let ty = startY + 10;
    for (const w of wrapped) {
      drawText(pdf, w, anchor, ty, {
        align, size: 9, color: C.ink, hasArabicFont: ctx.hasArabicFont,
      });
      ty += 4.2;
    }
    maxBottom = Math.max(maxBottom, startY + h);
  };

  newPageIfNeeded(ctx, 30);

  if (notes && showBank) {
    const leftCardX = leftX;
    const rightCardX = leftX + cardW + gap;
    // In RTL put notes on the right (primary side)
    const notesX = isRtl ? rightCardX : leftCardX;
    const bankX = isRtl ? leftCardX : rightCardX;
    drawCard(notesX, lang === "ar" ? "ملاحظات" : "NOTES", [{ value: notes }]);
    const bankLines: { label?: string; value: string }[] = [];
    if (settings?.bank_name) bankLines.push({ label: lang === "ar" ? "البنك" : "Bank", value: settings.bank_name });
    if (settings?.bank_account_holder) bankLines.push({ label: lang === "ar" ? "المستفيد" : "Holder", value: settings.bank_account_holder });
    if (settings?.bank_account_number) bankLines.push({ label: lang === "ar" ? "الحساب" : "Acct", value: settings.bank_account_number });
    if (settings?.bank_iban) bankLines.push({ label: "IBAN", value: settings.bank_iban });
    if (settings?.bank_swift) bankLines.push({ label: "SWIFT", value: settings.bank_swift });
    drawCard(bankX, lang === "ar" ? "تفاصيل الحساب" : "BANK DETAILS", bankLines);
  } else if (notes) {
    drawCard(leftX, lang === "ar" ? "ملاحظات" : "NOTES", [{ value: notes }]);
  } else if (showBank && settings) {
    const bankLines: { label?: string; value: string }[] = [];
    if (settings.bank_name) bankLines.push({ label: lang === "ar" ? "البنك" : "Bank", value: settings.bank_name });
    if (settings.bank_account_holder) bankLines.push({ label: lang === "ar" ? "المستفيد" : "Holder", value: settings.bank_account_holder });
    if (settings.bank_account_number) bankLines.push({ label: lang === "ar" ? "الحساب" : "Acct", value: settings.bank_account_number });
    if (settings.bank_iban) bankLines.push({ label: "IBAN", value: settings.bank_iban });
    if (settings.bank_swift) bankLines.push({ label: "SWIFT", value: settings.bank_swift });
    drawCard(leftX, lang === "ar" ? "تفاصيل الحساب" : "BANK DETAILS", bankLines);
  }

  ctx.y = maxBottom + 6;

  const footer = lang === "ar" ? settings?.invoice_footer_ar : settings?.invoice_footer_en;
  if (footer) {
    newPageIfNeeded(ctx, 8);
    drawText(pdf, footer, pageW / 2, ctx.y + 4, {
      align: "center", size: 9, color: C.muted, hasArabicFont: ctx.hasArabicFont,
    });
    ctx.y += 8;
  }
}

/* -------- Public builder -------- */

export async function buildInvoicePdf(args: {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: Customer | null;
  settings: CompanySettings | null;
  lang: Lang;
  chrome: ChromeOptions;
}): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const hasArabicFont = await ensureArabicFont(pdf);
  const ctx: Ctx = {
    pdf, lang: args.lang, hasArabicFont, isRtl: args.lang === "ar",
    y: CONTENT_TOP, pageW: pdf.internal.pageSize.getWidth(),
  };

  drawTitle(
    ctx,
    args.lang === "ar" ? "فاتورة" : "INVOICE",
    args.invoice.number ?? (args.lang === "ar" ? "بدون رقم" : "Untitled"),
  );
  drawHeaderBlock(ctx, args.invoice, args.settings);
  drawBillTo(ctx, args.customer);
  drawItemsTable(ctx, args.invoice, args.items);
  drawTotals(ctx, args.invoice);
  drawNotesAndBank(ctx, args.invoice, args.settings);

  await stampChrome(pdf, args.chrome);
  return pdf;
}

// Prevent unused import warning
void CONTENT_HEIGHT_MM;
