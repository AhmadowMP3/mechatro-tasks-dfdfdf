// End-to-end: a real Word file through the real Word engine with the real
// letterhead. Skipped unless a Word engine is running:
//
//   node scripts/dev-word-engine.mjs
//   WORD_ENGINE_URL=http://127.0.0.1:3999 SAMPLE_DOCX=path/to/file.docx E2E_OUT=out-dir bunx vitest run exact.e2e
//
// Client files are passed by path and never committed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";

import { BASE_FOOTER, defaultHeader } from "../defaults";
import { overlayLetterhead, pdfPageCount, trimTrailingBlankPages } from "./compose";
import { ENGINE, engineDocxToPdf, engineHtmlToPdf, installBrowserShims, measureInChrome } from "./e2e-harness";
import { A4_HEIGHT_PX, letterheadHtml, type LetterheadInput } from "./letterhead";
import { prepareDocxForLetterhead } from "./prepare-docx";

const SAMPLE = process.env.SAMPLE_DOCX ?? "";
const OUT = process.env.E2E_OUT ?? "";

describe.skipIf(!ENGINE || !SAMPLE || !existsSync(SAMPLE))("exact Word import (engine)", () => {
  test("lays the Word pages between the letterhead bands", { timeout: 240_000 }, async () => {
    installBrowserShims();
    const input: LetterheadInput = {
      header: defaultHeader("quotation"),
      footer: BASE_FOOTER,
      lang: "ar",
      meta: { number: "QT-2026-014", date: "06/09/2026", client: "شركة البنيان للمقاولات" },
    };

    const bands = await measureInChrome(input);
    expect(bands.topPx).toBeGreaterThan(80);
    expect(bands.bottomPx).toBeGreaterThan(60);
    expect(bands.topPx + bands.bottomPx).toBeLessThan(A4_HEIGHT_PX * 0.6);

    const prepared = await prepareDocxForLetterhead(readFileSync(SAMPLE), bands);
    const content = await trimTrailingBlankPages(await engineDocxToPdf(prepared.docx));
    const pages = await pdfPageCount(content);
    const sheets = await engineHtmlToPdf(await letterheadHtml(input, pages, bands.lock));
    const pdf = await overlayLetterhead(content, sheets, { title: "QT-2026-014" });

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(pages);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, "exact.pdf"), pdf);
      writeFileSync(join(OUT, "content.pdf"), content);
      writeFileSync(join(OUT, "bands.json"), JSON.stringify(bands, null, 2));
    }
  });
});
