// Shared types for the business documents system (Quotation / RFQ / Offer /
// Invoice / Proforma / Purchase Order).

import type { Database } from "@/integrations/supabase/types";

export type DocType = Database["public"]["Enums"]["business_doc_type"];
export type DocStatus = Database["public"]["Enums"]["business_doc_status"];
export type DocLang = "ar" | "en";
export type DocTheme = "light" | "dark";

export type DocLogoMode = "inline" | "band" | "free";

/** Fully editable header model, stored as JSON on doc_templates.header. */
export type DocHeader = {
  showLogo: boolean;
  logoHeight: number;          // px inside the A4 page
  logoAlign: "start" | "center" | "end";
  /** inline = beside the title, band = full-width row above, free = dragged. */
  logoMode: DocLogoMode;
  logoX: number;               // 0–100 % of the header box (free mode)
  logoY: number;               // 0–100 % of the header box (free mode)
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
  /** Page margins in millimetres (optional — legacy templates fall back). */
  marginTop?: number;
  marginBottom?: number;
  marginSide?: number;
};

/** Millimetre → CSS pixel (96 dpi). */
export const MM_TO_PX = 96 / 25.4;

/** Default page margins in millimetres — Word "Narrow" (0.5 in = 12.7 mm). */
export const DEFAULT_MARGINS = { top: 12.7, bottom: 12.7, side: 12.7 } as const;


/** Page setup imported from a Word file's final <w:sectPr>, in CSS pixels. */
export type DocSection = {
  pageWidthPx: number;
  pageHeightPx: number;
  marginTopPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  headerOffsetPx: number;
  footerOffsetPx: number;
};

/** Resolved page margins in CSS pixels for an A4 sheet. */
export function pageMarginsPx(header?: Partial<DocHeader> | null): { top: number; bottom: number; side: number } {
  const mm = (v: number | undefined, fallback: number) =>
    Number.isFinite(v) && (v as number) >= 0 && (v as number) <= 60 ? (v as number) : fallback;
  return {
    top: Math.round(mm(header?.marginTop, DEFAULT_MARGINS.top) * MM_TO_PX),
    bottom: Math.round(mm(header?.marginBottom, DEFAULT_MARGINS.bottom) * MM_TO_PX),
    side: Math.round(mm(header?.marginSide, DEFAULT_MARGINS.side) * MM_TO_PX),
  };
}

/**
 * Single source of truth for the page margins: an imported Word section wins,
 * otherwise the template margins are used exactly as before. Every consumer
 * (paper, preview paginator, live editor) must go through this function, or
 * the same document breaks on different lines in different views.
 */
export function resolveMargins(
  header?: Partial<DocHeader> | null,
  section?: DocSection | null,
): { top: number; bottom: number; side: number } {
  if (section) {
    const ok = (v: unknown) => Number.isFinite(v) && (v as number) >= 0 && (v as number) <= 400;
    const side = ok(section.marginLeftPx) && ok(section.marginRightPx)
      ? Math.round((section.marginLeftPx + section.marginRightPx) / 2)
      : null;
    if (ok(section.marginTopPx) && ok(section.marginBottomPx) && side !== null) {
      return {
        top: Math.round(section.marginTopPx),
        bottom: Math.round(section.marginBottomPx),
        side,
      };
    }
  }
  return pageMarginsPx(header);
}



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

/** Ready-made body content preloaded into every new document of a type. */
export type DocBody = { html: string };

export type DocTemplate = {
  id: string;
  doc_type: DocType;
  name: string;
  is_default: boolean;
  header: DocHeader;
  footer: DocFooter;
  defaults: DocDefaults;
  body: DocBody;
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
