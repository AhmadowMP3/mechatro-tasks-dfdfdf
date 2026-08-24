// Document content model: an ordered list of blocks stored on
// business_docs.model. Every block is bilingual so the same document can be
// rendered AR or EN without re-authoring.

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

export type ItemsBlock = {
  id: string;
  kind: "items";
  titleAr: string;
  titleEn: string;
  rows: ItemRow[];
  showUnit: boolean;
  showQty: boolean;
  showPrice: boolean;
  showTotals: boolean;
  /** Set by the paginator on sliced continuations so row numbers keep counting. */
  startIndex?: number;
  taxRate: number;      // %
  discount: number;     // absolute, on subtotal
  shipping: number;
};

export type DocBlock =
  | { id: string; kind: "heading"; ar: string; en: string }
  | { id: string; kind: "text"; ar: string; en: string }
  | {
      id: string;
      kind: "keyvalue";
      titleAr: string;
      titleEn: string;
      rows: { id: string; kAr: string; kEn: string; vAr: string; vEn: string }[];
    }
  | {
      id: string;
      kind: "table";
      titleAr: string;
      titleEn: string;
      headAr: string[];
      headEn: string[];
      rows: { id: string; cellsAr: string[]; cellsEn: string[] }[];
    }
  | ItemsBlock
  | { id: string; kind: "terms"; titleAr: string; titleEn: string; ar: string; en: string }
  | { id: string; kind: "spacer"; size: number }
  | { id: string; kind: "pagebreak" };

export type DocModel = {
  version: 1;
  showClientBox: boolean;
  blocks: DocBlock[];
};

export type BlockKind = DocBlock["kind"];

export const BLOCK_LABELS: { kind: BlockKind; ar: string; en: string }[] = [
  { kind: "heading", ar: "عنوان فرعي", en: "Heading" },
  { kind: "text", ar: "نص", en: "Text" },
  { kind: "items", ar: "جدول بنود (حساب تلقائي)", en: "Items table (auto totals)" },
  { kind: "table", ar: "جدول حر", en: "Free table" },
  { kind: "keyvalue", ar: "بيانات (مفتاح/قيمة)", en: "Key / value list" },
  { kind: "terms", ar: "الشروط والأحكام", en: "Terms & conditions" },
  { kind: "spacer", ar: "مسافة", en: "Spacer" },
  { kind: "pagebreak", ar: "فاصل صفحة", en: "Page break" },
];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyClient(): DocClient {
  return { nameAr: "", nameEn: "", attn: "", phone: "", email: "", address: "", taxNumber: "", refAr: "", refEn: "" };
}

export function emptyItemRow(): ItemRow {
  return { id: uid(), descAr: "", descEn: "", unitAr: "", unitEn: "", qty: 1, price: 0, discount: 0 };
}

export function newBlock(kind: BlockKind): DocBlock {
  switch (kind) {
    case "heading":
      return { id: uid(), kind, ar: "عنوان", en: "Heading" };
    case "text":
      return { id: uid(), kind, ar: "", en: "" };
    case "keyvalue":
      return {
        id: uid(),
        kind,
        titleAr: "بيانات",
        titleEn: "Details",
        rows: [{ id: uid(), kAr: "", kEn: "", vAr: "", vEn: "" }],
      };
    case "table":
      return {
        id: uid(),
        kind,
        titleAr: "",
        titleEn: "",
        headAr: ["العمود ١", "العمود ٢"],
        headEn: ["Column 1", "Column 2"],
        rows: [{ id: uid(), cellsAr: ["", ""], cellsEn: ["", ""] }],
      };
    case "items":
      return {
        id: uid(),
        kind,
        titleAr: "البنود",
        titleEn: "Items",
        rows: [emptyItemRow()],
        showUnit: true,
        showQty: true,
        showPrice: true,
        showTotals: true,
        taxRate: 0,
        discount: 0,
        shipping: 0,
      };
    case "terms":
      return { id: uid(), kind, titleAr: "الشروط والأحكام", titleEn: "Terms & Conditions", ar: "", en: "" };
    case "spacer":
      return { id: uid(), kind, size: 16 };
    case "pagebreak":
      return { id: uid(), kind };
  }
}

export function defaultModel(): DocModel {
  return {
    version: 1,
    showClientBox: true,
    blocks: [newBlock("items"), newBlock("terms")],
  };
}

/** Merge a stored blob over the default so older documents keep working. */
export function mergeModel(raw: unknown): DocModel {
  const base = { version: 1 as const, showClientBox: true, blocks: [] as DocBlock[] };
  if (!raw || typeof raw !== "object") return defaultModel();
  const r = raw as Partial<DocModel>;
  const blocks = Array.isArray(r.blocks) ? (r.blocks.filter(Boolean) as DocBlock[]) : [];
  return { ...base, ...r, version: 1, blocks };
}

export function mergeClient(raw: unknown): DocClient {
  return { ...emptyClient(), ...(raw && typeof raw === "object" ? (raw as Partial<DocClient>) : {}) };
}

export type ItemsTotals = {
  lines: { row: ItemRow; total: number }[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  shipping: number;
  grand: number;
};

export function computeItems(block: ItemsBlock): ItemsTotals {
  const lines = block.rows.map((row) => ({
    row,
    total: Math.max(0, (Number(row.qty) || 0) * (Number(row.price) || 0) - (Number(row.discount) || 0)),
  }));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = Number(block.discount) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * ((Number(block.taxRate) || 0) / 100);
  const shipping = Number(block.shipping) || 0;
  return { lines, subtotal, discount, taxable, tax, shipping, grand: taxable + tax + shipping };
}

export function money(n: number, currency: string): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
