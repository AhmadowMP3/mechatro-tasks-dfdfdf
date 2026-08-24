// Default header / footer / defaults per document type. Used to seed a
// template row the first time a type is opened, and as a fallback whenever a
// stored template is missing fields (forward-compatible merge).

import { DOC_TYPES, type DocDefaults, type DocFooter, type DocHeader, type DocType } from "./types";

const BLUE = "#42C2EE";

export const BASE_HEADER: DocHeader = {
  showLogo: true,
  logoHeight: 46,
  logoAlign: "start",
  titleAr: "",
  titleEn: "",
  companyAr: "ميكاترو للحلول الهندسية",
  companyEn: "Mechatro Engineering Solutions",
  addressAr: "دمشق — سوريا",
  addressEn: "Damascus — Syria",
  phone: "",
  email: "",
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
  noteAr: "هذا المستند صادر إلكترونياً من نظام ميكاترو.",
  noteEn: "This document was issued electronically by the Mechatro system.",
  bankAr: "",
  bankEn: "",
  signatureAr: "التوقيع المعتمد",
  signatureEn: "Authorized Signature",
  showPageNumbers: true,
  showGeneratedAt: true,
  contactLine: "mechatro-sy.com",
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
  return { ...BASE_FOOTER };
}

export function defaultDefaults(type: DocType): DocDefaults {
  // Purchase orders and invoices carry no "validity" concept by default.
  const validityDays = type === "invoice" || type === "purchase_order" ? 0 : 15;
  return { ...BASE_DEFAULTS, validityDays };
}

/** Merge a partial stored JSON blob over the defaults so new fields appear. */
export function mergeHeader(type: DocType, raw: unknown): DocHeader {
  return { ...defaultHeader(type), ...(raw && typeof raw === "object" ? raw as Partial<DocHeader> : {}) };
}
export function mergeFooter(type: DocType, raw: unknown): DocFooter {
  return { ...defaultFooter(type), ...(raw && typeof raw === "object" ? raw as Partial<DocFooter> : {}) };
}
export function mergeDefaults(type: DocType, raw: unknown): DocDefaults {
  return { ...defaultDefaults(type), ...(raw && typeof raw === "object" ? raw as Partial<DocDefaults> : {}) };
}
