#!/usr/bin/env node
// Copies the OCR engine (tesseract.js worker + LSTM core builds) from
// node_modules into public/ocr, so scanned-PDF import never depends on a
// public CDN being reachable from the user's network. Run after upgrading
// tesseract.js:
//
//   node scripts/sync-ocr-assets.mjs
//
// The language models (public/ocr/lang/*.traineddata) come from the official
// @tesseract.js-data packages (4.0.0_best_int) and change rarely; pass a folder
// containing their .traineddata.gz files as the first argument to refresh them.
// They are stored uncompressed: servers send ".gz" with Content-Encoding: gzip,
// which the browser unpacks before the OCR engine tries to unpack it again.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");
const core = join(root, "node_modules", "tesseract.js-core");
const worker = join(root, "node_modules", "tesseract.js", "dist", "worker.min.js");

mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

copyFileSync(worker, join(out, "worker.min.js"));
// Recognition runs LSTM-only, so only the three *-lstm builds are ever loaded
// (tesseract.js picks relaxed-SIMD, SIMD or plain at runtime).
for (const name of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  copyFileSync(join(core, name), join(out, "core", name));
}

const dataDir = process.argv[2];
if (dataDir) {
  for (const file of readdirSync(dataDir, { recursive: true })) {
    const name = String(file);
    const m = /(ara|eng)\.traineddata\.gz$/.exec(name);
    if (m && name.includes("best_int")) {
      writeFileSync(join(out, "lang", `${m[1]}.traineddata`), gunzipSync(readFileSync(join(dataDir, name))));
    }
  }
}

for (const lang of ["ara", "eng"]) {
  if (!existsSync(join(out, "lang", `${lang}.traineddata`))) console.warn(`missing public/ocr/lang/${lang}.traineddata`);
}
console.log("OCR assets synced to public/ocr");
