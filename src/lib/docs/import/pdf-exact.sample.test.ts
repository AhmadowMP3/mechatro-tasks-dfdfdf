// Writes composed PDFs to disk for a visual check. Skipped unless E2E_OUT is set:
//   E2E_OUT=out-dir bunx vitest run pdf-exact.sample

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "vitest";

import { bandedPdf } from "./__fixtures__/banded-pdf";
import { composeIntoBands } from "./pdf-exact";

const OUT = process.env.E2E_OUT ?? "";

describe.skipIf(!OUT)("composed PDFs for visual check", () => {
  test("rotations", async () => {
    mkdirSync(OUT, { recursive: true });
    const src = await bandedPdf([0, 90, 180, 270]);
    writeFileSync(join(OUT, "rot-source.pdf"), src);
    const res = await composeIntoBands(src, { topPt: 60, bottomPt: 40 }, { topPx: 264, bottomPx: 171 });
    writeFileSync(join(OUT, "rot-composed.pdf"), res.pdf);
  });
});
