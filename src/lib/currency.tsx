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

/** Geometry of the new Saudi Riyal symbol, shared by the component and the
 *  inline-SVG string used inside exported HTML. */
const RIYAL_PATHS = [
  "M6 3.6v7.1c0 3.1 2.1 5.1 5.2 5.1H19.2",
  "M13.6 3.6v6.2",
  "M4 18.4 14.6 16.5",
  "M4 21.4 14.6 19.5",
];

/** The new Saudi Riyal symbol as an inline React element. */
export function RiyalSymbol({ size = "1em", color = "currentColor", style }: { size?: number | string; color?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      aria-label="SAR"
      role="img"
      style={{ display: "inline-block", verticalAlign: "-0.12em", ...style }}
    >
      {RIYAL_PATHS.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** The same symbol as an SVG string — for exported HTML / PDF / Word markup. */
export function riyalSymbolSvg(size = "0.95em", color = "currentColor"): string {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" ` +
    `stroke-width="2" stroke-linecap="round" style="display:inline-block;vertical-align:-0.12em">` +
    RIYAL_PATHS.map((d) => `<path d="${d}"/>`).join("") +
    `</svg>`
  );
}
