// Prepares an uploaded .docx for the exact-layout path: the file is rendered
// by a real Word engine (LibreOffice) and the Mechatro letterhead is laid on
// top afterwards. Only page setup is touched here — every run, paragraph,
// table, colour and image inside the body is left exactly as Word wrote it.
//
//  - The file's own headers/footers are unlinked (the letterhead replaces them).
//  - Every section is set to A4 (orientation kept).
//  - Top/bottom page margins are widened to the letterhead's header/footer
//    bands, so the engine re-flows the content around them like Word would.

import JSZip from "jszip";

/** CSS pixel (96 dpi) → twentieths of a point (1440 per inch). */
const TWIPS_PER_PX = 15;

const A4_TWIPS = { short: 11906, long: 16838 } as const;

/** Side margin used only when a section has no <w:pgMar> at all (2 cm). */
const DEFAULT_SIDE_TWIPS = 1134;

export type LetterheadBands = {
  /** Distance from the sheet top to where the Word body may start, in CSS px. */
  topPx: number;
  /** Distance from the sheet bottom to where the Word body must end, in CSS px. */
  bottomPx: number;
};

export type PreparedDocx = {
  docx: Uint8Array;
  sections: number;
  landscapeSections: number;
  /** Floating shapes positioned against the page — they may sit under the letterhead. */
  pageAnchoredShapes: number;
};

/** Elements that must come after pgSz/pgMar inside a <w:sectPr>. */
const AFTER_PAGE_SETUP =
  /<w:(paperSrc|pgBorders|lnNumType|pgNumType|cols|formProt|vAlign|noEndnote|titlePg|textDirection|bidi|rtlGutter|docGrid|printerSettings)\b/;

function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1]! : null;
}

function twips(px: number): number {
  return Math.max(0, Math.round(px * TWIPS_PER_PX));
}

function pageSizeTag(landscape: boolean): string {
  return landscape
    ? `<w:pgSz w:w="${A4_TWIPS.long}" w:h="${A4_TWIPS.short}" w:orient="landscape"/>`
    : `<w:pgSz w:w="${A4_TWIPS.short}" w:h="${A4_TWIPS.long}"/>`;
}

function pageMarginTag(existing: string | null, bands: LetterheadBands): string {
  const side = (name: string) => attrOf(existing ?? "", name) ?? String(DEFAULT_SIDE_TWIPS);
  const keep = (name: string, fallback: string) => attrOf(existing ?? "", name) ?? fallback;
  return (
    `<w:pgMar w:top="${twips(bands.topPx)}" w:right="${side("w:right")}" ` +
    `w:bottom="${twips(bands.bottomPx)}" w:left="${side("w:left")}" ` +
    `w:header="${keep("w:header", "0")}" w:footer="${keep("w:footer", "0")}" w:gutter="${keep("w:gutter", "0")}"/>`
  );
}

/** Rewrite one <w:sectPr> (inner XML only) for the letterhead. */
function rewriteSection(inner: string, bands: LetterheadBands): { xml: string; landscape: boolean } {
  const size = /<w:pgSz\b[^>]*\/>/.exec(inner)?.[0] ?? null;
  const margin = /<w:pgMar\b[^>]*\/>/.exec(inner)?.[0] ?? null;
  const landscape = attrOf(size ?? "", "w:orient") === "landscape";

  let body = inner
    .replace(/<w:(headerReference|footerReference)\b[^>]*\/>/g, "")
    .replace(/<w:titlePg\b[^>]*\/>/g, "")
    .replace(/<w:pgSz\b[^>]*\/>/g, "")
    .replace(/<w:pgMar\b[^>]*\/>/g, "");

  const setup = pageSizeTag(landscape) + pageMarginTag(margin, bands);
  const at = body.search(AFTER_PAGE_SETUP);
  body = at >= 0 ? body.slice(0, at) + setup + body.slice(at) : body + setup;
  return { xml: body, landscape };
}

/** Apply the letterhead page setup to every section of document.xml. */
export function rewriteDocumentXml(xml: string, bands: LetterheadBands): Omit<PreparedDocx, "docx"> & { xml: string } {
  let sections = 0;
  let landscapeSections = 0;

  // Tracked section-property changes hold a nested <w:sectPr>; they are
  // revision history only, and would confuse the section matcher below.
  const flat = xml.replace(/<w:sectPrChange\b[\s\S]*?<\/w:sectPrChange>/g, "");

  const out = flat.replace(
    /<w:sectPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:sectPr>)/g,
    (_m, attrs: string, inner: string | undefined) => {
      const res = rewriteSection(inner ?? "", bands);
      sections += 1;
      if (res.landscape) landscapeSections += 1;
      return `<w:sectPr${attrs}>${res.xml}</w:sectPr>`;
    },
  );

  const pageAnchoredShapes = (out.match(/<wp:positionV\b[^>]*relativeFrom="page"/g) ?? []).length;
  return { xml: out, sections, landscapeSections, pageAnchoredShapes };
}

/** Parts that only macro-enabled or code-carrying Word files have. */
const ACTIVE_CONTENT = /^(word\/vbaProject\.bin|word\/vbaData\.xml|customUI\/|word\/activeX\/)/i;

/**
 * Refuse Word files that carry macros or ribbon callbacks. Quotations never
 * need them, and a .docx renamed from an infected .docm would otherwise be
 * stored and shared from the server.
 */
export async function assertNoActiveContent(input: ArrayBuffer | Uint8Array | Blob): Promise<void> {
  const zip = await JSZip.loadAsync(input);
  if (Object.keys(zip.files).some((name) => ACTIVE_CONTENT.test(name))) {
    throw new Error("word_has_macros");
  }
}

/** Unzip, rewrite the page setup, and zip the .docx back up. */
export async function prepareDocxForLetterhead(
  input: ArrayBuffer | Uint8Array,
  bands: LetterheadBands,
): Promise<PreparedDocx> {
  const zip = await JSZip.loadAsync(input);
  if (Object.keys(zip.files).some((name) => ACTIVE_CONTENT.test(name))) throw new Error("word_has_macros");
  const part = zip.file("word/document.xml");
  if (!part) throw new Error("not_a_word_document");

  const res = rewriteDocumentXml(await part.async("string"), bands);
  if (res.sections === 0) {
    // A body without any section properties: give it one at the very end.
    const setup = `<w:sectPr>${pageSizeTag(false)}${pageMarginTag(null, bands)}</w:sectPr>`;
    res.xml = res.xml.replace(/<\/w:body>/, `${setup}</w:body>`);
    res.sections = 1;
  }
  zip.file("word/document.xml", res.xml);

  const docx = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    docx,
    sections: res.sections,
    landscapeSections: res.landscapeSections,
    pageAnchoredShapes: res.pageAnchoredShapes,
  };
}
