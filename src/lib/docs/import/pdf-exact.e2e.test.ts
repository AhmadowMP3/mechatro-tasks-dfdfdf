// End-to-end: a real PDF, its own letterhead cut away, between the real
// Mechatro letterhead printed by the Word engine. Skipped unless an engine runs:
//
//   node scripts/dev-word-engine.mjs
//   WORD_ENGINE_URL=http://127.0.0.1:3999 SAMPLE_PDF=file.pdf SAMPLE_CROP=103,89 E2E_OUT=out bunx vitest run pdf-exact.e2e

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";

import { BASE_FOOTER, defaultHeader } from "../defaults";
import { overlayLetterhead } from "../word-exact/compose";
import { ENGINE, engineHtmlToPdf, installBrowserShims, measureInChrome } from "../word-exact/e2e-harness";
import { letterheadHtml, type LetterheadInput } from "../word-exact/letterhead";
import { composeIntoBands } from "./pdf-exact";

const SAMPLE = process.env.SAMPLE_PDF ?? "";
const OUT = process.env.E2E_OUT ?? "";
const [top, bottom] = (process.env.SAMPLE_CROP ?? "0,0").split(",").map(Number);

describe.skipIf(!ENGINE || !SAMPLE || !existsSync(SAMPLE))("exact PDF import (engine)", () => {
  test("fits the PDF pages between the letterhead bands", { timeout: 240_000 }, async () => {
    installBrowserShims();
    const input: LetterheadInput = {
      header: defaultHeader("quotation"),
      footer: BASE_FOOTER,
      lang: "ar",
      meta: { number: "QT-2026-015", date: "17/10/2026", client: "شركة البنيان للمقاولات" },
    };
    const bands = await measureInChrome(input);
    const composed = await composeIntoBands(new Uint8Array(readFileSync(SAMPLE)), { topPt: top ?? 0, bottomPt: bottom ?? 0 }, bands);
    const sheets = await engineHtmlToPdf(await letterheadHtml(input, composed.pages, bands.lock));
    const pdf = await overlayLetterhead(composed.pdf, sheets, { title: "QT-2026-015" });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(composed.pages);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, "exact-from-pdf.pdf"), pdf);
    }
  });
});
