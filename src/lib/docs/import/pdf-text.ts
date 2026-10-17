// pdf.js text content → positioned boxes (see layout.ts). Pure: it only needs
// the items pdf.js returns and the page viewport, so the same code runs in the
// browser and in the Node tests.

import type { PageText, TextBox } from "./layout";

/** The subset of pdf.js's TextItem this module reads. */
export type PdfTextItem = { str: string; transform: number[]; width: number; height: number };

/** The subset of pdf.js's PageViewport this module reads (scale 1 → points). */
export type PdfViewport = { width: number; height: number; transform: number[] };

const multiply = (m: number[], n: number[]): number[] => [
  m[0]! * n[0]! + m[2]! * n[1]!,
  m[1]! * n[0]! + m[3]! * n[1]!,
  m[0]! * n[2]! + m[2]! * n[3]!,
  m[1]! * n[2]! + m[3]! * n[3]!,
  m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
  m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
];

/** Convert one page of pdf.js text items to top-down boxes in points. */
export function pageTextFromItems(items: unknown[], viewport: PdfViewport): PageText {
  const boxes: TextBox[] = [];
  const vpScale = Math.hypot(viewport.transform[0]!, viewport.transform[1]!) || 1;
  for (const raw of items) {
    const item = raw as Partial<PdfTextItem>;
    if (typeof item.str !== "string" || !Array.isArray(item.transform)) continue;
    if (!item.str.trim()) continue;
    const m = multiply(viewport.transform, item.transform);
    const fontH = Math.hypot(m[2]!, m[3]!) || (item.height ?? 0) * vpScale || 10;
    const w = Math.abs((item.width ?? 0) * vpScale);
    // m[4], m[5] is the baseline start in viewport space (y grows downwards).
    // A rotated run (|m[1]| large) is laid on its side: keep it, unrotated.
    const x = m[4]!;
    const baseline = m[5]!;
    boxes.push({ text: item.str, x, y: baseline - fontH * 0.85, w: Math.max(w, 0.5), h: fontH });
  }
  return { width: viewport.width / vpScale, height: viewport.height / vpScale, boxes: boxes.map((b) => scaleBox(b, 1 / vpScale)) };
}

function scaleBox(b: TextBox, k: number): TextBox {
  return k === 1 ? b : { text: b.text, x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k };
}

/** Characters of real text on a page — a scanned page has (almost) none. */
export function textCharCount(page: PageText): number {
  return page.boxes.reduce((n, b) => n + b.text.replace(/\s/g, "").length, 0);
}
