// Branded Mechatro XLSX exporter using ExcelJS.
// Produces a styled workbook with logo, colored header, autofilter,
// frozen top rows, zebra striping and status/priority color pills.

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/mechatro-logo.png";
import type { Lang } from "@/i18n/dict";

export const BRAND = {
  blue: "FF189FD1",
  blueDark: "FF0A2540",
  gold: "FFC8A24B",
  ink: "FF0F2031",
  paper: "FFFFFFFF",
  zebra: "FFF5F9FD",
  border: "FFD7DEE5",
  muted: "FF5A6B7D",
  green: "FF3F782A",
  orange: "FFE8732E",
  red: "FFD64545",
  purple: "FF7C5CD1",
  gray: "FF86A1B7",
};

export const STATUS_COLOR: Record<string, string> = {
  todo: BRAND.gray,
  in_progress: BRAND.blue,
  paused: BRAND.orange,
  in_review: BRAND.purple,
  done: BRAND.green,
  active: BRAND.blue,
  on_hold: BRAND.orange,
  archived: BRAND.gray,
};

export const PRIORITY_COLOR: Record<string, string> = {
  low: BRAND.gray,
  normal: BRAND.blue,
  high: BRAND.orange,
  urgent: BRAND.red,
};

export type XlsxCellKind =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "status"
  | "priority"
  | "percent";

export type XlsxColumn<Row> = {
  key: string;
  header: string;
  width?: number;
  kind?: XlsxCellKind;
  get: (row: Row) => string | number | Date | null | undefined;
};

export type XlsxExportOptions<Row> = {
  sheetName: string;
  title: string;                 // Big report title (page name)
  subtitle?: string;             // Optional sub-line under title
  filtersSummary?: string;       // "Project: X · Status: done"
  generatedBy?: string;
  lang: Lang;
  columns: XlsxColumn<Row>[];
  rows: Row[];
  fileName?: string;
};

let cachedLogo: ArrayBuffer | null = null;
async function getLogo(): Promise<ArrayBuffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    const buf = await res.arrayBuffer();
    cachedLogo = buf;
    return buf;
  } catch { return null; }
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function exportToBrandedXlsx<Row>(opts: XlsxExportOptions<Row>) {
  const { sheetName, title, subtitle, filtersSummary, generatedBy, lang, columns, rows } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mechatro Tasks";
  wb.created = new Date();

  const sheet = wb.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 5, rightToLeft: lang === "ar" }],
    properties: { defaultRowHeight: 20 },
  });

  // Set column widths
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));

  // Rows 1-4 reserved for branded header block
  sheet.spliceRows(1, 0, [], [], [], []);

  // ------- Branded header block -------
  // Row 1: title bar
  const totalCols = columns.length;
  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Mechatro Tasks  ·  مهام ميكاترو`;
  titleCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blueDark } };
  sheet.getRow(1).height = 42;

  // Row 2: report title + timestamp
  sheet.mergeCells(2, 1, 2, totalCols);
  const subCell = sheet.getCell(2, 1);
  subCell.value = title;
  subCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: BRAND.blueDark } };
  subCell.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9FD" } };
  subCell.border = { bottom: { style: "medium", color: { argb: BRAND.gold } } };
  sheet.getRow(2).height = 28;

  // Row 3: filters summary + generated info
  sheet.mergeCells(3, 1, 3, totalCols);
  const info = sheet.getCell(3, 1);
  const parts: string[] = [];
  if (subtitle) parts.push(subtitle);
  if (filtersSummary) parts.push(filtersSummary);
  parts.push(`${lang === "ar" ? "أُنشئ في" : "Generated"}: ${new Date().toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB")}`);
  if (generatedBy) parts.push(`${lang === "ar" ? "بواسطة" : "By"}: ${generatedBy}`);
  parts.push(`${lang === "ar" ? "الصفوف" : "Rows"}: ${rows.length}`);
  info.value = parts.join("   ·   ");
  info.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.muted } };
  info.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4, wrapText: true };
  sheet.getRow(3).height = 30;

  // Row 4: spacer
  sheet.getRow(4).height = 6;

  // Row 5: header row (was auto-added by sheet.columns as row 1, then spliced to row 5)
  const headerRow = sheet.getRow(5);
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.blueDark } },
      bottom: { style: "medium", color: { argb: BRAND.gold } },
      left: { style: "thin", color: { argb: BRAND.blueDark } },
      right: { style: "thin", color: { argb: BRAND.blueDark } },
    };
  });
  headerRow.height = 26;

  // Auto filter over header + data rows
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: totalCols },
  };

  // Data rows
  rows.forEach((row, idx) => {
    const values = columns.map((c) => {
      const v = c.get(row);
      if (v === null || v === undefined) return "";
      if (c.kind === "date" || c.kind === "datetime") {
        return v instanceof Date ? v : new Date(String(v));
      }
      return v;
    });
    const excelRow = sheet.addRow(values);
    const zebra = idx % 2 === 1;

    excelRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const col = columns[colIdx - 1];
      cell.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", wrapText: false, indent: 1 };
      cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.ink } };
      cell.border = { bottom: { style: "hair", color: { argb: BRAND.border } } };

      if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }

      if (!col) return;
      if (col.kind === "date") {
        cell.numFmt = "yyyy-mm-dd";
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      } else if (col.kind === "datetime") {
        cell.numFmt = "yyyy-mm-dd hh:mm";
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      } else if (col.kind === "number") {
        cell.numFmt = "#,##0";
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      } else if (col.kind === "percent") {
        const n = typeof cell.value === "number" ? cell.value : Number(cell.value);
        cell.value = Number.isFinite(n) ? n / 100 : 0;
        cell.numFmt = "0%";
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      } else if (col.kind === "status" || col.kind === "priority") {
        const key = String(cell.value ?? "").toLowerCase();
        const argb = (col.kind === "status" ? STATUS_COLOR : PRIORITY_COLOR)[key];
        if (argb) {
          cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
          cell.alignment = { ...cell.alignment, horizontal: "center" };
        }
      }
    });
    excelRow.height = 22;
  });

  // Logo (top-right / top-left depending on language)
  const logo = await getLogo();
  if (logo) {
    const imageId = wb.addImage({ buffer: logo, extension: "png" });
    // 120px wide, anchored inside row 1
    const anchorCol = lang === "ar" ? 0 : totalCols - 1;
    sheet.addImage(imageId, {
      tl: { col: anchorCol + 0.15, row: 0.15 },
      ext: { width: 120, height: 34 },
      editAs: "oneCell",
    });
  }

  // Save
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = opts.fileName ?? `${sheetName.replace(/\s+/g, "-")}-${stamp()}.xlsx`;
  saveAs(blob, fileName);
}
