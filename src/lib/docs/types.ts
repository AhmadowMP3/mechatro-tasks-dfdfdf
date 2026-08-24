// Shared types for the business documents system (Quotation / RFQ / Offer /
// Invoice / Proforma / Purchase Order).

import type { Database } from "@/integrations/supabase/types";

export type DocType = Database["public"]["Enums"]["business_doc_type"];
export type DocStatus = Database["public"]["Enums"]["business_doc_status"];
export type DocLang = "ar" | "en";
export type DocTheme = "light" | "dark";

/** Fully editable header model, stored as JSON on doc_templates.header. */
export type DocHeader = {
  showLogo: boolean;
  logoHeight: number;          // px inside the A4 page
  logoAlign: "start" | "center" | "end";
  titleAr: string;
  titleEn: string;
  companyAr: string;
  companyEn: string;
  addressAr: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  accent: string;              // hex accent for rules / title
  showRule: boolean;
  showMetaBox: boolean;        // number / date / validity box
  extraAr: string;
  extraEn: string;
};

/** One bilingual footer line: English on the left, Arabic on the right. */
export type DocFooterRow = { en: string; ar: string };

/** Fully editable footer model, stored as JSON on doc_templates.footer. */
export type DocFooter = {
  showRule: boolean;
  accent: string;
  noteAr: string;
  noteEn: string;
  bankAr: string;
  bankEn: string;
  signatureAr: string;
  signatureEn: string;
  showPageNumbers: boolean;
  showGeneratedAt: boolean;
  contactLine: string;         // legacy single line (kept for compatibility)
  /** Official letterhead contact block — same on every template. */
  contactRows: DocFooterRow[];
};


/** Per-type defaults applied to every new document. */
export type DocDefaults = {
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  validityDays: number;
  termsAr: string;
  termsEn: string;
};

export type DocTemplate = {
  id: string;
  doc_type: DocType;
  name: string;
  is_default: boolean;
  header: DocHeader;
  footer: DocFooter;
  defaults: DocDefaults;
  created_at?: string;
  updated_at?: string;
};

export const DOC_TYPES: { type: DocType; prefix: string; ar: string; en: string }[] = [
  { type: "quotation",        prefix: "QT",  ar: "عرض سعر",          en: "Quotation" },
  { type: "rfq",              prefix: "RFQ", ar: "طلب عرض سعر",       en: "Request for Quotation" },
  { type: "offer",            prefix: "OF",  ar: "عرض فني",           en: "Offer" },
  { type: "invoice",          prefix: "INV", ar: "فاتورة",            en: "Invoice" },
  { type: "proforma_invoice", prefix: "PI",  ar: "فاتورة مبدئية",      en: "Proforma Invoice" },
  { type: "purchase_order",   prefix: "PO",  ar: "أمر شراء",          en: "Purchase Order" },
];

export function docTypeLabel(type: DocType, lang: DocLang): string {
  const m = DOC_TYPES.find((d) => d.type === type);
  return m ? (lang === "ar" ? m.ar : m.en) : type;
}

/** Paper palette for the two document themes — mirrors the app brand. */
export const PAPER = {
  light: {
    bg: "#FFFFFF",
    surface: "#F5F8FB",
    ink: "#0B1A2A",
    muted: "#5A6B7D",
    border: "#DCE5EE",
    zebra: "#F1F5F9",
  },
  dark: {
    bg: "#081320",
    surface: "#0F2031",
    ink: "#E6EEF7",
    muted: "#94A3B8",
    border: "#1E3A57",
    zebra: "#0B1A2A",
  },
} as const;
