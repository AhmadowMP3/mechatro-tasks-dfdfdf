// Multi-sheet branded finance workbook.
// Reuses the Mechatro palette from src/lib/export/xlsx.ts to produce a single
// .xlsx with one styled sheet per report.

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/mechatro-logo.png";
import type { Lang } from "@/i18n/dict";
import { sanitizeCell } from "@/lib/security/sanitize";

const BRAND = {
  blue: "FF189FD1",
  blueDark: "FF0A2540",
  gold: "FFC8A24B",
  ink: "FF0F2031",
  zebra: "FFF5F9FD",
  border: "FFD7DEE5",
  muted: "FF5A6B7D",
};

export type FinanceSheetColumn = {
  header: string;
  key: string;
  width?: number;
  kind?: "text" | "number" | "money" | "date" | "percent";
};

export type FinanceSheetSpec = {
  name: string;
  title: string;
  subtitle?: string;
  columns: FinanceSheetColumn[];
  rows: Record<string, string | number | Date | null | undefined>[];
  totalsRow?: Record<string, string | number | null | undefined>;
};

let cachedLogo: ArrayBuffer | null = null;
async function getLogo(): Promise<ArrayBuffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    const buf = await res.arrayBuffer();
    cachedLogo = buf;
    return buf;
  } catch {
    return null;
  }
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function moneyFmt(currency: string): string {
  return currency === "USD" ? '"$"#,##0.00;[Red]"-$"#,##0.00' : '#,##0.00" SYP"';
}

export async function exportFinanceWorkbook(
  sheets: FinanceSheetSpec[],
  lang: Lang,
  currency: string,
  filename?: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mechatro Finance";
  wb.created = new Date();

  const logo = await getLogo();
  const logoId = logo ? wb.addImage({ buffer: logo, extension: "png" }) : null;

  for (const spec of sheets) {
    const sheet = wb.addWorksheet(spec.name.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 5, rightToLeft: lang === "ar" }],
      properties: { defaultRowHeight: 20 },
    });

    sheet.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
    // Reserve rows 1-4 for header block
    sheet.spliceRows(1, 0, [], [], [], []);

    const totalCols = spec.columns.length;

    // Row 1: brand bar
    sheet.mergeCells(1, 1, 1, totalCols);
    const brand = sheet.getCell(1, 1);
    brand.value = "Mechatro  ·  ميكاترو";
    brand.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
    brand.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
    brand.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blueDark } };
    sheet.getRow(1).height = 42;

    // Row 2: sheet title
    sheet.mergeCells(2, 1, 2, totalCols);
    const title = sheet.getCell(2, 1);
    title.value = spec.title;
    title.font = { name: "Calibri", size: 14, bold: true, color: { argb: BRAND.blueDark } };
    title.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9FD" } };
    title.border = { bottom: { style: "medium", color: { argb: BRAND.gold } } };
    sheet.getRow(2).height = 28;

    // Row 3: subtitle / meta
    sheet.mergeCells(3, 1, 3, totalCols);
    const meta = sheet.getCell(3, 1);
    const parts: string[] = [];
    if (spec.subtitle) parts.push(spec.subtitle);
    parts.push(`${lang === "ar" ? "أُنشئ في" : "Generated"}: ${new Date().toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB")}`);
    parts.push(`${lang === "ar" ? "الصفوف" : "Rows"}: ${spec.rows.length}`);
    meta.value = parts.join("   ·   ");
    meta.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.muted } };
    meta.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
    sheet.getRow(3).height = 24;

    sheet.getRow(4).height = 6;

    // Row 5: header row (auto-placed by sheet.columns, was row 1, spliced to row 5)
    const headerRow = sheet.getRow(5);
    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: BRAND.gold } } };
    });
    headerRow.height = 26;

    sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: totalCols } };

    // Data rows
    spec.rows.forEach((row, idx) => {
      const values = spec.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return "";
        if (c.kind === "date" && !(v instanceof Date)) return new Date(String(v));
        return sanitizeCell(v) as typeof v;
      });
      const excelRow = sheet.addRow(values);
      const zebra = idx % 2 === 1;
      excelRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const col = spec.columns[colIdx - 1];
        cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.ink } };
        cell.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 1 };
        cell.border = { bottom: { style: "hair", color: { argb: BRAND.border } } };
        if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
        if (!col) return;
        if (col.kind === "date") {
          cell.numFmt = "yyyy-mm-dd";
          cell.alignment = { ...cell.alignment, horizontal: "center" };
        } else if (col.kind === "number") {
          cell.numFmt = "#,##0";
          cell.alignment = { ...cell.alignment, horizontal: "center" };
        } else if (col.kind === "percent") {
          cell.numFmt = "0.0%";
          cell.alignment = { ...cell.alignment, horizontal: "center" };
        } else if (col.kind === "money") {
          cell.numFmt = moneyFmt(currency);
          cell.alignment = { ...cell.alignment, horizontal: "right" };
        }
      });
      excelRow.height = 22;
    });

    // Optional totals row
    if (spec.totalsRow) {
      const values = spec.columns.map((c) => {
        const v = spec.totalsRow?.[c.key];
        return v === null || v === undefined ? "" : (sanitizeCell(v) as typeof v);
      });
      const totalRow = sheet.addRow(values);
      totalRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const col = spec.columns[colIdx - 1];
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.blueDark } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FA" } };
        cell.border = {
          top: { style: "medium", color: { argb: BRAND.blueDark } },
          bottom: { style: "medium", color: { argb: BRAND.blueDark } },
        };
        cell.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 1 };
        if (col?.kind === "money") {
          cell.numFmt = moneyFmt(currency);
          cell.alignment = { ...cell.alignment, horizontal: "right" };
        } else if (col?.kind === "number") {
          cell.numFmt = "#,##0";
          cell.alignment = { ...cell.alignment, horizontal: "center" };
        }
      });
      totalRow.height = 24;
    }

    // Logo top-outer-edge
    if (logoId !== null) {
      const anchorCol = totalCols - 1;
      sheet.addImage(logoId, {
        tl: { col: anchorCol + 0.15, row: 0.15 },
        ext: { width: 120, height: 34 },
        editAs: "oneCell",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, filename ?? `finance-reports-${stamp()}.xlsx`);
}
