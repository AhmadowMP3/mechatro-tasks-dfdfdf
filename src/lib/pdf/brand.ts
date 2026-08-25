// Central branding tokens for every PDF the app produces.
// Change values here and every generated PDF picks them up.

export const BRAND = {
  // DARK theme tokens — matches src/styles.css.
  navy: "#081320",   // page background
  blue: "#42C2EE",   // primary accent (rules, callouts)
  gold: "#D4A017",   // secondary accent (footer/header hairline)
  ink: "#E6EEF7",    // primary text on dark
  muted: "#94A3B8",  // secondary text on dark
  border: "#1E3A57", // hairlines on dark
  zebra: "#0B1A2A",  // alternating row surface
  paper: "#0F2031",  // card surface
  name: "Mechatro",
  nameAr: "ميكاترو",
  tagline: "Innovative Energy Solutions",
} as const;

// A4 portrait, mm units.
export const PAGE = {
  width: 210,
  height: 297,
  marginTop: 34,      // reserved for header band (larger logo)
  marginBottom: 16,   // reserved for footer band (page counter + meta)
  marginX: 0,         // horizontal margin already baked into the HTML content
} as const;

export const CONTENT_HEIGHT_MM = PAGE.height - PAGE.marginTop - PAGE.marginBottom;

function pad(n: number): string { return String(n).padStart(2, "0"); }

export function stampFilename(kind: string, ref?: string | null): string {
  const d = new Date();
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const safeRef = (ref ?? "").toString().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const parts = ["mechatro", kind, safeRef, date].filter(Boolean);
  return `${parts.join("-")}.pdf`;
}

export function formatGeneratedAt(lang: "ar" | "en"): string {
  const d = new Date();
  const locale = lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  return d.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
