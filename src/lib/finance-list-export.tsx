// High-level finance list export: one call runs branded PDF or Excel.
// PDF uses printReactDocument (browser-native → perfect Arabic shaping).
// Excel uses the existing exportFinanceWorkbook helper.

import { printReactDocument } from "@/lib/pdf/print-document";
import { exportFinanceWorkbook, type FinanceSheetSpec } from "@/lib/finance-xlsx";
import { ListReportDocument, type ListColumn, type ListKpi } from "@/components/finance/ListReportDocument";
import type { CompanySettings } from "@/components/finance/BrandedDocuments";
import type { Lang } from "@/i18n/dict";

export type FinanceListExportInput<T extends Record<string, unknown>> = {
  /** Tab slug for filename e.g. "income", "expenses". */
  slug: string;
  /** Display title in header. */
  title: string;
  subtitle?: string;
  rangeLabel?: string;
  kpis?: ListKpi[];
  columns: ListColumn<T>[];
  rows: T[];
  /** Totals shown at bottom of PDF and totals row in Excel. */
  totalsPdf?: { label: string; value: string; tone?: "green" | "red" | "gold" }[];
  totalsXlsx?: Record<string, string | number | null | undefined>;
  /** Excel-only column config (kind for money/date/etc). Falls back to columns.header/key. */
  xlsxColumns?: FinanceSheetSpec["columns"];
  /** Excel raw rows (may differ from PDF rows). Falls back to `rows`. */
  xlsxRows?: FinanceSheetSpec["rows"];
  settings: CompanySettings | null;
  lang: Lang;
  currency: string;
};

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function exportFinanceListPdf<T extends Record<string, unknown>>(
  input: FinanceListExportInput<T>,
): Promise<void> {
  const filename = `${input.slug}_${stamp()}`;
  await printReactDocument(
    <ListReportDocument
      title={input.title}
      subtitle={input.subtitle}
      rangeLabel={input.rangeLabel}
      kpis={input.kpis}
      columns={input.columns}
      rows={input.rows}
      totals={input.totalsPdf}
      settings={input.settings}
      lang={input.lang}
    />,
    { title: filename, lang: input.lang },
  );
}

export async function exportFinanceListXlsx<T extends Record<string, unknown>>(
  input: FinanceListExportInput<T>,
): Promise<void> {
  const filename = `${input.slug}_${stamp()}.xlsx`;
  const xlsxCols: FinanceSheetSpec["columns"] =
    input.xlsxColumns ??
    input.columns.map((c) => ({ header: c.header, key: c.key, width: typeof c.width === "number" ? Math.max(14, Math.min(40, c.width / 6)) : 22 }));
  const xlsxRows: FinanceSheetSpec["rows"] =
    input.xlsxRows ??
    (input.rows as unknown as FinanceSheetSpec["rows"]);
  const sheet: FinanceSheetSpec = {
    name: input.title.slice(0, 28),
    title: input.title,
    subtitle: input.rangeLabel ?? input.subtitle,
    columns: xlsxCols,
    rows: xlsxRows,
    totalsRow: input.totalsXlsx,
  };
  await exportFinanceWorkbook([sheet], input.lang, input.currency, filename);
}
