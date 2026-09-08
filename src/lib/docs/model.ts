// Document content model. The body is Word-style rich HTML stored on
// business_docs.model.html. Legacy block documents keep their raw `blocks`
// array as an untouched backup; it is converted to HTML once on open.

export type DocClient = {
  nameAr: string;
  nameEn: string;
  attn: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  refAr: string;
  refEn: string;
};

export type ItemRow = {
  id: string;
  descAr: string;
  descEn: string;
  unitAr: string;
  unitEn: string;
  qty: number;
  price: number;
  discount: number; // absolute amount on the line
};

/** Which rendering of the brand logo the letterhead uses. */
export type LogoVariant = "auto" | "light" | "dark";

export type DocModel = {
  /** Always 2 — Word-style rich HTML body. */
  version: 2;
  showClientBox: boolean;
  /** Rich body HTML. */
  html: string;
  /** Letterhead logo rendering: auto follows the paper theme. */
  logoVariant?: LogoVariant;
  /** Page setup imported from the original Word file (wins over template margins). */
  section?: DocSection;
  /** Legacy blocks of pre-Word documents, kept only as a backup. */
  blocks?: unknown[];
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyClient(): DocClient {
  return { nameAr: "", nameEn: "", attn: "", phone: "", email: "", address: "", taxNumber: "", refAr: "", refEn: "" };
}

export function emptyItemRow(): ItemRow {
  return { id: uid(), descAr: "", descEn: "", unitAr: "", unitEn: "", qty: 1, price: 0, discount: 0 };
}

export function defaultModel(): DocModel {
  return { version: 2, showClientBox: true, html: "", logoVariant: "auto" };
}

/** Merge a stored blob over the default so older documents keep working. */
export function mergeModel(raw: unknown): DocModel {
  if (!raw || typeof raw !== "object") return defaultModel();
  const r = raw as Partial<DocModel> & { blocks?: unknown };
  const html = typeof r.html === "string" ? r.html : "";
  const blocks = Array.isArray(r.blocks) ? (r.blocks.filter(Boolean) as unknown[]) : undefined;
  const variant: LogoVariant = r.logoVariant === "light" || r.logoVariant === "dark" ? r.logoVariant : "auto";
  return {
    version: 2,
    showClientBox: r.showClientBox !== false,
    html,
    logoVariant: variant,
    ...(blocks && blocks.length > 0 ? { blocks } : {}),
  };
}

export function mergeClient(raw: unknown): DocClient {
  return { ...emptyClient(), ...(raw && typeof raw === "object" ? (raw as Partial<DocClient>) : {}) };
}

/** Everything the totals calculator needs from an items table. */
export type ItemsCalcInput = {
  rows: ItemRow[];
  taxRate: number;   // %
  discount: number;  // absolute, on subtotal
  shipping: number;
};

export type ItemsTotals = {
  lines: { row: ItemRow; total: number }[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  shipping: number;
  grand: number;
};

export function computeItems(data: ItemsCalcInput): ItemsTotals {
  const lines = (data.rows ?? []).map((row) => ({
    row,
    total: Math.max(0, (Number(row.qty) || 0) * (Number(row.price) || 0) - (Number(row.discount) || 0)),
  }));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = Number(data.discount) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * ((Number(data.taxRate) || 0) / 100);
  const shipping = Number(data.shipping) || 0;
  return { lines, subtotal, discount, taxable, tax, shipping, grand: taxable + tax + shipping };
}

export function money(n: number, currency: string): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
