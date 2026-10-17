// Finds the original letterhead (header/footer bands) on the pages of an
// imported PDF, so the exact layout can cut it away and put the Mechatro
// letterhead in its place.
//
// Input per page: a row-by-row ink profile (fraction of non-white pixels in
// each horizontal strip, from a low-resolution render) plus, for PDFs with a
// text layer, the text boxes. A band is only proposed with evidence — it
// repeats on the pages, or it looks like a letterhead (a logo, contact
// details, a company name). Without evidence nothing is cut: removing a real
// title by mistake is worse than leaving an old header for the user to trim.

import type { TextBox } from "./layout";

export type CropPageInput = {
  /** Page height in points. */
  height: number;
  /** Height of one ink row in points. */
  rowPt: number;
  /** Ink fraction (0–1) per row, top to bottom. */
  ink: number[];
  /** Text boxes in points (empty for scans). */
  boxes?: TextBox[];
};

export type CropSuggestion = {
  topPt: number;
  bottomPt: number;
  /** Why each band was proposed ("repeats", "letterhead") — or null when not cut. */
  topReason: CropReason | null;
  bottomReason: CropReason | null;
};

export type CropReason = "repeats" | "letterhead";

type Cluster = { start: number; end: number };

const INK_THRESHOLD = 0.0025;
/** Ink rows closer than this belong to the same visual block. */
const JOIN_PT = 4;
/** A letterhead band ends at a clear white gap at least this tall. */
const MIN_GAP_PT = 9;
/** How far into the page a header/footer band may reach. */
const MAX_HEADER = 0.24;
const MAX_FOOTER = 0.18;
/** Breathing room added past the detected band. */
const PAD_PT = 3;

const CONTACT = /(@|www\.|https?:|\.com\b|\.net\b|\.sy\b|\.sa\b|\btel\b|\bfax\b|\bmob(?:ile)?\b|\bphone\b|p\.?o\.?\s*box|هاتف|جوال|فاكس|موبايل|ص\.?\s?ب|البريد|العنوان|\+?\d[\d\s\-()]{7,}\d)/i;
const COMPANY = /(\bco\.|\bltd\b|\bllc\b|\binc\b|\bcompany\b|\bgroup\b|\btrading\b|\best\.|شركة|مؤسسة|مجموعة|للتجارة|للمقاولات|المحدودة|ذ\.م\.م)/i;
const PAGE_NO = /^(?:page\s*)?\d{1,3}(?:\s*(?:\/|of|من)\s*\d{1,3})?$|^(?:الصفحة|صفحة)\s*\d/i;

function clusters(page: CropPageInput): Cluster[] {
  const join = Math.max(1, Math.round(JOIN_PT / page.rowPt));
  const out: Cluster[] = [];
  let cur: Cluster | null = null;
  let blank = 0;
  page.ink.forEach((v, i) => {
    if (v > INK_THRESHOLD) {
      if (cur && blank <= join) cur.end = i;
      else { if (cur) out.push(cur); cur = { start: i, end: i }; }
      blank = 0;
    } else {
      blank++;
    }
  });
  if (cur) out.push(cur);
  return out.map((c) => ({ start: c.start * page.rowPt, end: (c.end + 1) * page.rowPt }));
}

/** The block(s) at the top of the page that end before a clear gap, within the header zone. */
function headerBand(cs: Cluster[], height: number): Cluster | null {
  if (cs.length < 2) return null;
  let band: Cluster | null = null;
  for (let i = 0; i < cs.length - 1; i++) {
    const c = cs[i]!;
    if (c.end > height * MAX_HEADER) break;
    band = band ? { start: band.start, end: c.end } : { ...c };
    const gap = cs[i + 1]!.start - c.end;
    if (gap >= MIN_GAP_PT) return band;
  }
  return null;
}

function footerBand(cs: Cluster[], height: number): Cluster | null {
  if (cs.length < 2) return null;
  let band: Cluster | null = null;
  for (let i = cs.length - 1; i > 0; i--) {
    const c = cs[i]!;
    if (c.start < height * (1 - MAX_FOOTER)) break;
    band = band ? { start: c.start, end: band.end } : { ...c };
    const gap = c.start - cs[i - 1]!.end;
    if (gap >= MIN_GAP_PT) return band;
  }
  return null;
}

/** Text that falls inside a band. */
function textIn(page: CropPageInput, band: Cluster): string {
  return (page.boxes ?? [])
    .filter((b) => b.y + b.h / 2 >= band.start && b.y + b.h / 2 <= band.end)
    .map((b) => b.text)
    .join(" ");
}

/** Share of a band's height covered by text boxes — a logo is ink without text. */
function textCoverage(page: CropPageInput, band: Cluster): number {
  const rows = new Set<number>();
  for (const b of page.boxes ?? []) {
    const mid = b.y + b.h / 2;
    if (mid < band.start || mid > band.end) continue;
    for (let y = Math.floor(b.y); y < b.y + b.h; y++) rows.add(y);
  }
  return rows.size / Math.max(1, band.end - band.start);
}

function looksLikeLetterhead(page: CropPageInput, band: Cluster, edge: "top" | "bottom"): boolean {
  const text = textIn(page, band).trim();
  if (CONTACT.test(text) || COMPANY.test(text)) return true;
  if (edge === "bottom" && PAGE_NO.test(text)) return true;
  // A text layer exists but this band has (almost) none of it: an image — a logo.
  const hasTextLayer = (page.boxes ?? []).length > 0;
  return hasTextLayer && band.end - band.start >= 18 && textCoverage(page, band) < 0.25;
}

/** Bands found on most pages at about the same place. */
function repeated(bands: (Cluster | null)[], key: "start" | "end"): Cluster | null {
  const found = bands.filter((b): b is Cluster => b !== null);
  if (bands.length < 2 || found.length < Math.ceil(bands.length * 0.6)) return null;
  const ref = found.map((b) => b[key]).sort((a, b) => a - b)[Math.floor(found.length / 2)]!;
  const close = found.filter((b) => Math.abs(b[key] - ref) <= 14);
  if (close.length < Math.ceil(bands.length * 0.6)) return null;
  return { start: Math.min(...close.map((b) => b.start)), end: Math.max(...close.map((b) => b.end)) };
}

export function detectCropBands(pages: CropPageInput[]): CropSuggestion {
  const none: CropSuggestion = { topPt: 0, bottomPt: 0, topReason: null, bottomReason: null };
  if (pages.length === 0) return none;

  const per = pages.map((p) => {
    const cs = clusters(p);
    return { page: p, header: headerBand(cs, p.height), footer: footerBand(cs, p.height) };
  });

  const out = { ...none };

  const top = repeated(per.map((x) => x.header), "end");
  if (top) {
    out.topPt = Math.ceil(top.end + PAD_PT);
    out.topReason = "repeats";
  } else {
    const first = per[0]!;
    if (first.header && looksLikeLetterhead(first.page, first.header, "top")) {
      out.topPt = Math.ceil(first.header.end + PAD_PT);
      out.topReason = "letterhead";
    }
  }

  const bottom = repeated(per.map((x) => x.footer), "start");
  if (bottom) {
    out.bottomPt = Math.ceil(pages[0]!.height - bottom.start + PAD_PT);
    out.bottomReason = "repeats";
  } else {
    const first = per[0]!;
    if (first.footer && looksLikeLetterhead(first.page, first.footer, "bottom")) {
      out.bottomPt = Math.ceil(first.page.height - first.footer.start + PAD_PT);
      out.bottomReason = "letterhead";
    }
  }
  return out;
}

/** Row ink profile of an RGBA image (as from a canvas), one value per pixel row. */
export function inkProfile(data: Uint8ClampedArray, width: number, height: number): number[] {
  const rows: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let dark = 0;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = base + x * 4;
      // Anything clearly away from white counts as ink (coloured bands included).
      if (data[i]! < 235 || data[i + 1]! < 235 || data[i + 2]! < 235) dark++;
    }
    rows[y] = dark / width;
  }
  return rows;
}
