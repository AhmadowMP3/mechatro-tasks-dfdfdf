// Fails the check when a negative margin-top sneaks back into the document
// engine. Negative margins were the old page system's way of hiding a
// pagination bug; page spacing now comes only from positive spacers.
//
// Run: bun run check:margins

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src/components/documents", "src/lib/docs"];
const EXT = new Set([".ts", ".tsx", ".css", ".js", ".jsx"]);

// marginTop: -12, margin-top: -1px, marginTop: `${-x}px`, mt-[-8px], -mt-4
const PATTERNS = [
  /margin-?[Tt]op\s*[:=]\s*[`'"(]?\s*-\s*\d/,
  /margin-?[Tt]op\s*[:=]\s*[`'"]?\$\{\s*-/,
  /\bmt-\[-/,
  /(^|[\s"'`])-mt-/,
  /\bmargin\s*:\s*-\s*\d/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXT.has(extname(path))) out.push(path);
  }
  return out;
}

const offences = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("check-negative-margins")) return;
      if (PATTERNS.some((p) => p.test(line))) offences.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (offences.length > 0) {
  console.error("Negative margins are not allowed in the document engine:\n");
  for (const o of offences) console.error("  " + o);
  console.error("\nUse a positive spacer instead (see page-spacers.ts).");
  process.exit(1);
}

console.log("No negative margins in the document engine.");
