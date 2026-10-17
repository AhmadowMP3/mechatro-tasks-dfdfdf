// Layout of a real PDF's text layer. Skipped unless SAMPLE_PDF_TEXT points at
// a JSON dump of pdf.js text items ([{ viewport, items }] per page), so client
// documents never need to be committed:
//
//   SAMPLE_PDF_TEXT=dump.json LAYOUT_OUT=layout.json bunx vitest run layout.sample

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { hasSwappedLamAlef, repairLamAlef } from "./arabic-repair";
import { mapLayoutText, pagesToLayout, type PageText } from "./layout";
import { pageTextFromItems, type PdfViewport } from "./pdf-text";

const DUMP = process.env.SAMPLE_PDF_TEXT ?? "";

describe.skipIf(!DUMP || !existsSync(DUMP))("layout of a real PDF", () => {
  test("rebuilds lines, paragraphs and tables", () => {
    const raw = JSON.parse(readFileSync(DUMP, "utf8")) as { viewport: PdfViewport; items: unknown[] }[];
    const pages: PageText[] = raw.map((p) => pageTextFromItems(p.items, p.viewport));
    const rawLayout = pagesToLayout(pages);
    const swapped = hasSwappedLamAlef(rawLayout.lines.join("\n"));
    const layout = mapLayoutText(rawLayout, (s) => repairLamAlef(s, swapped));
    expect(layout.blocks.length).toBeGreaterThan(0);
    if (process.env.LAYOUT_OUT) writeFileSync(process.env.LAYOUT_OUT, JSON.stringify({ swapped, ...layout }, null, 1));
  });
});
