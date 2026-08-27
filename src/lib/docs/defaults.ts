// Default header / footer / defaults per document type. Used to seed a
// template row the first time a type is opened, and as a fallback whenever a
// stored template is missing fields (forward-compatible merge).
//
// The header/footer below is the OFFICIAL Mechatro letterhead chrome and is
// identical for every document type — only the title changes.

import { DOC_TYPES, type DocDefaults, type DocFooter, type DocFooterRow, type DocHeader, type DocType } from "./types";

const BLUE = "#42C2EE";

/** Official bilingual contact block (EN left / AR right) on every template. */
export const OFFICIAL_CONTACT_ROWS: DocFooterRow[] = [
  { en: "Mobile KSA:  +966 56 56 99 437", ar: "جوال سعودي: 00966565699437" },
  { en: "Mobile SY:  +963 933 945 346", ar: "جوال سوري: 00963933945346" },
  { en: "E-Mail:  info@mechatro-sy.com", ar: "البريد الإلكتروني: info@mechatro-sy.com" },
  { en: "Address:  Al-Mashhad, Aleppo, Syria", ar: "العنوان: المشهد، حلب، سوريا" },
];

export const BASE_HEADER: DocHeader = {
  showLogo: true,
  logoHeight: 110,
  logoAlign: "start",
  logoMode: "inline",
  logoX: 0,
  logoY: 0,
  titleAr: "",
  titleEn: "",
  companyAr: "ميكاترو للحلول الهندسية",
  companyEn: "Mechatro Engineering Solutions",
  addressAr: "المشهد، حلب — سوريا",
  addressEn: "Al-Mashhad, Aleppo — Syria",
  phone: "+963 933 945 346",
  email: "info@mechatro-sy.com",
  website: "mechatro-sy.com",
  taxNumber: "",
  accent: BLUE,
  showRule: true,
  showMetaBox: true,
  extraAr: "",
  extraEn: "",
};

export const BASE_FOOTER: DocFooter = {
  showRule: true,
  accent: BLUE,
  noteAr: "",
  noteEn: "",
  bankAr: "",
  bankEn: "",
  signatureAr: "التوقيع المعتمد",
  signatureEn: "Authorized Signature",
  showPageNumbers: true,
  showGeneratedAt: true,
  contactLine: "mechatro-sy.com",
  contactRows: OFFICIAL_CONTACT_ROWS,
};

export const BASE_DEFAULTS: DocDefaults = {
  lang: "ar",
  theme: "light",
  currency: "USD",
  validityDays: 15,
  termsAr: "الأسعار سارية خلال مدة الصلاحية المذكورة أعلاه.",
  termsEn: "Prices are valid within the validity period stated above.",
};

export function defaultHeader(type: DocType): DocHeader {
  const meta = DOC_TYPES.find((d) => d.type === type);
  return { ...BASE_HEADER, titleAr: meta?.ar ?? "", titleEn: meta?.en ?? "" };
}

export function defaultFooter(_type: DocType): DocFooter {
  return { ...BASE_FOOTER, contactRows: OFFICIAL_CONTACT_ROWS.map((r) => ({ ...r })) };
}


export function defaultDefaults(type: DocType): DocDefaults {
  // Purchase orders and invoices carry no "validity" concept by default.
  const validityDays = type === "invoice" || type === "purchase_order" ? 0 : 15;
  return { ...BASE_DEFAULTS, validityDays };
}

/** Merge a partial stored JSON blob over the defaults so new fields appear. */
export function mergeHeader(type: DocType, raw: unknown): DocHeader {
  const stored = raw && typeof raw === "object" ? (raw as Partial<DocHeader>) : null;
  const merged: DocHeader = { ...defaultHeader(type), ...(stored ?? {}) };
  // Templates saved before the placement feature keep the old full-width band
  // until the admin explicitly picks the new layout.
  if (stored && !stored.logoMode) merged.logoMode = "band";
  merged.logoX = clampPct(merged.logoX);
  merged.logoY = clampPct(merged.logoY);
  return merged;
}

function clampPct(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
}
export function mergeFooter(type: DocType, raw: unknown): DocFooter {
  const merged = { ...defaultFooter(type), ...(raw && typeof raw === "object" ? raw as Partial<DocFooter> : {}) };
  // Older stored templates have no contactRows — fall back to the official block.
  const rows = Array.isArray(merged.contactRows) ? merged.contactRows.filter((r) => r && (r.en || r.ar)) : [];
  merged.contactRows = rows.length ? rows.map((r) => ({ en: r.en ?? "", ar: r.ar ?? "" })) : OFFICIAL_CONTACT_ROWS.map((r) => ({ ...r }));
  return merged;
}

export function defaultBody(): DocBody {
  return { html: "" };
}

/** Merge a stored body blob over the empty default. */
export function mergeBody(raw: unknown): DocBody {
  const stored = raw && typeof raw === "object" ? (raw as Partial<DocBody>) : null;
  return { html: typeof stored?.html === "string" ? stored.html : "" };
}

export function mergeDefaults(type: DocType, raw: unknown): DocDefaults {
  return { ...defaultDefaults(type), ...(raw && typeof raw === "object" ? raw as Partial<DocDefaults> : {}) };
}
