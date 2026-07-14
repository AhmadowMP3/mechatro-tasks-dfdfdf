// Arabic text pipeline for jsPDF: reshape (logical → presentation forms) +
// apply the Unicode Bidi Algorithm so mixed AR/EN/number lines render in the
// correct visual order. jsPDF has no complex-script shaping of its own, so we
// pre-shape here and hand it a visual-order string to draw.

import type { jsPDF } from "jspdf";
import bidiFactory from "bidi-js";
// @ts-expect-error - no bundled types for this pure-JS CJS module
import reshaper from "arabic-persian-reshaper";
import { loadArabicFontB64 } from "./assets";

const bidi = bidiFactory();
const ArabicShaper = (reshaper as { ArabicShaper: { convertArabic: (s: string) => string } }).ArabicShaper;

export const AR_FONT_ID = "MontserratArabic";
const AR_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Attach the embedded Arabic TTF to a jsPDF instance (idempotent per instance). */
const fontAttached = new WeakSet<object>();
export async function ensureArabicFont(pdf: jsPDF): Promise<boolean> {
  if (fontAttached.has(pdf)) return true;
  const b64 = await loadArabicFontB64();
  if (!b64) return false;
  try {
    pdf.addFileToVFS("MontserratArabic-Regular.ttf", b64);
    pdf.addFont("MontserratArabic-Regular.ttf", AR_FONT_ID, "normal");
    pdf.addFont("MontserratArabic-Regular.ttf", AR_FONT_ID, "bold");
    fontAttached.add(pdf);
    return true;
  } catch {
    return false;
  }
}

export function containsArabic(s: string | null | undefined): boolean {
  return !!s && AR_RE.test(s);
}

/** Reshape + reorder a logical-order string into a visual-order string that
 *  can be drawn left-to-right by jsPDF's `text()`. Non-Arabic input passes
 *  through untouched. */
export function shapeForPdf(input: string): string {
  if (!input) return "";
  if (!containsArabic(input)) return input;
  const shaped = ArabicShaper.convertArabic(input);
  const levels = bidi.getEmbeddingLevels(shaped, "rtl");
  const segments = bidi.getReorderSegments(shaped, levels);
  // Convert to a mutable array of characters so we can flip ranges in place.
  const chars = Array.from(shaped);
  for (const [start, end] of segments) {
    // bidi-js uses inclusive [start,end], code-unit-based indices. Since we
    // work with the BMP + basic supplementary here, code-unit == char.
    const s = start;
    const e = end;
    if (e <= s) continue;
    const slice = chars.slice(s, e + 1).reverse();
    for (let i = 0; i < slice.length; i++) chars[s + i] = slice[i];
  }
  return chars.join("");
}

/** Pick the embedded Arabic font when the string contains Arabic and the
 *  font is available; otherwise stay on Helvetica. Returns the effective
 *  font id so the caller can reset later if needed. */
export function setTextFont(
  pdf: jsPDF,
  text: string,
  hasArabicFont: boolean,
  weight: "normal" | "bold" = "normal",
) {
  if (hasArabicFont && containsArabic(text)) {
    pdf.setFont(AR_FONT_ID, weight === "bold" ? "bold" : "normal");
  } else {
    pdf.setFont("helvetica", weight);
  }
}

export type DrawOpts = {
  align?: "left" | "center" | "right";
  size?: number;
  weight?: "normal" | "bold";
  color?: [number, number, number];
  hasArabicFont: boolean;
  maxWidth?: number;
};

/** Draw a single line of text. Automatically shapes Arabic and picks font.
 *  `align` matches jsPDF semantics: "right" means x is the right edge. */
export function drawText(
  pdf: jsPDF,
  raw: string,
  x: number,
  y: number,
  opts: DrawOpts,
): void {
  if (!raw) return;
  const visual = shapeForPdf(raw);
  setTextFont(pdf, raw, opts.hasArabicFont, opts.weight ?? "normal");
  if (opts.size) pdf.setFontSize(opts.size);
  if (opts.color) pdf.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
  const align = opts.align ?? "left";
  const jsAlign: "left" | "center" | "right" = align;
  pdf.text(visual, x, y, { align: jsAlign, maxWidth: opts.maxWidth });
}

/** Wrap a string to fit within `maxWidth` (in mm) at the current font size.
 *  Splits on spaces, falls back to hard-break for very long tokens. */
export function wrapText(pdf: jsPDF, raw: string, maxWidth: number): string[] {
  if (!raw) return [];
  const words = raw.split(/(\s+)/); // keep spaces
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line + w;
    // Measure the *shaped* candidate so RTL widths are accurate.
    const width = pdf.getTextWidth(shapeForPdf(candidate));
    if (width <= maxWidth || !line.trim()) {
      line = candidate;
    } else {
      lines.push(line.trimEnd());
      line = w.trimStart();
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}
