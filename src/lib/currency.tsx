// Single source of truth for the currencies the system supports.
//
// The Saudi Riyal uses its new official symbol. Because that glyph is missing
// from every font we ship (screen, PDF, Word, Excel), it is rendered as the
// official artwork: a transparent PNG, inlined as a data URL so it renders
// identically in the app, the document sheet, the PDF, the Word export and the
// sandboxed /v/:token viewer. Plain-text surfaces (Excel cells, file names,
// logs) still fall back to "SAR" / "ر.س".

import type { Currency } from "./finance";
import { RIYAL_ASPECT, riyalGlyphFor } from "./currency/riyal-glyph";


export const CURRENCIES: Currency[] = ["SYP", "USD", "SAR"];

/** Short plain-text label used in selects and text-only exports. */
export function currencyLabel(currency: Currency, lang: "ar" | "en" = "en"): string {
  switch (currency) {
    case "USD": return lang === "ar" ? "دولار · $" : "USD · $";
    case "SAR": return lang === "ar" ? "ريال سعودي · ر.س" : "SAR · ر.س";
    default: return lang === "ar" ? "ليرة سورية · ل.س" : "SYP · ل.س";
  }
}

/** Plain-text currency symbol (safe in any font / Excel cell). */
export function currencySymbolText(currency: Currency, lang: "ar" | "en" = "en"): string {
  switch (currency) {
    case "USD": return "$";
    case "SAR": return lang === "ar" ? "ر.س" : "SAR";
    default: return lang === "ar" ? "ل.س" : "SYP";
  }
}

/** Height-to-width helper so the artwork never distorts at any font size. */
function glyphWidth(size: number | string): string {
  return typeof size === "number"
    ? `${Math.round(size * RIYAL_ASPECT * 100) / 100}px`
    : `calc(${size} * ${RIYAL_ASPECT})`;
}

/** The official Saudi Riyal symbol as a React element.
 *  In the app it is tinted with the surrounding text color through a CSS mask,
 *  so it inherits hover states, muted text and both themes automatically. */
export function RiyalSymbol({ size = "1em", color = "currentColor", style }: { size?: number | string; color?: string; style?: React.CSSProperties }) {
  const height = typeof size === "number" ? `${size}px` : size;
  const mask = `url("${riyalGlyphFor("#000")}") no-repeat center / contain`;
  return (
    <span
      role="img"
      aria-label="SAR"
      style={{
        display: "inline-block",
        height,
        width: glyphWidth(size),
        verticalAlign: "-0.12em",
        background: color === "currentColor" ? "currentColor" : color,
        WebkitMask: mask,
        mask,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/** The same symbol as an HTML string — for exported document HTML, the PDF
 *  sheet, the Word export and the QR viewer. CSS masks are not portable to
 *  Word, so this variant embeds the pre-tinted PNG directly. */
export function riyalSymbolSvg(size = "0.95em", color = "currentColor"): string {
  const height = typeof size === "number" ? `${size}px` : size;
  return (
    `<img src="${riyalGlyphFor(color)}" alt="SAR" ` +
    `style="display:inline-block;height:${height};width:${glyphWidth(size)};` +
    `vertical-align:-0.12em;object-fit:contain" />`
  );
}


/** Amount + currency as HTML for the printed sheet / PDF / Word export.
 *  SAR prints the official glyph; other currencies stay plain text. */
export function moneyHtml(amount: number, currency: string, theme: "light" | "dark" = "light"): string {
  const v = Number.isFinite(amount) ? amount : 0;
  const num = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency !== "SAR") return `${num}${currency ? ` ${currency}` : ""}`;
  return (
    `<span style="display:inline-flex;align-items:center;gap:3px;direction:ltr;white-space:nowrap">` +
    `<span>${num}</span>${riyalSymbolSvg("0.95em", theme === "dark" ? "#FFFFFF" : "#0D1B2A")}</span>`
  );
}
