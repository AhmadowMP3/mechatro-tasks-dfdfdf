#!/usr/bin/env node
// Local stand-in for the Gotenberg "Word engine", for development on a machine
// without Docker. It answers the two routes the app calls, with the same
// engines Gotenberg runs: LibreOffice (Word → PDF) and Chromium (HTML → PDF).
//
//   node scripts/dev-word-engine.mjs            # listens on http://127.0.0.1:3999
//   GOTENBERG_URL=http://127.0.0.1:3999 bun run dev
//
// Needs LibreOffice and Chrome or Edge installed. Override the paths with
// SOFFICE_PATH / CHROME_PATH. Development only — never expose it publicly.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT ?? 3999);
const TIMEOUT_MS = 120_000;

const firstExisting = (paths) => paths.find((p) => p && existsSync(p));

const SOFFICE = firstExisting([
  process.env.SOFFICE_PATH,
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
]);
const CHROME = firstExisting([
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
]);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 400)}`));
    });
  });
}

async function readForm(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request("http://local/", { method: "POST", headers: req.headers, body: Buffer.concat(chunks) });
  return request.formData();
}

/** POST /forms/libreoffice/convert — files=document.docx → PDF. */
async function libreoffice(form) {
  if (!SOFFICE) throw Object.assign(new Error("LibreOffice not found (set SOFFICE_PATH)"), { status: 503 });
  const file = form.get("files");
  if (!(file instanceof Blob)) throw Object.assign(new Error("missing files"), { status: 400 });
  const dir = await mkdtemp(join(tmpdir(), "mechatro-lo-"));
  try {
    await writeFile(join(dir, "document.docx"), Buffer.from(await file.arrayBuffer()));
    await run(SOFFICE, [
      `-env:UserInstallation=${pathToFileURL(join(dir, "profile")).href}`,
      "--headless", "--norestore", "--nolockcheck",
      "--convert-to", "pdf", "--outdir", dir, join(dir, "document.docx"),
    ]);
    return await readFile(join(dir, "document.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** POST /forms/chromium/convert/html — files=index.html → PDF (CSS page size, no JS). */
async function chromium(form) {
  if (!CHROME) throw Object.assign(new Error("Chrome/Edge not found (set CHROME_PATH)"), { status: 503 });
  const file = form.get("files");
  if (!(file instanceof Blob)) throw Object.assign(new Error("missing files"), { status: 400 });
  const dir = await mkdtemp(join(tmpdir(), "mechatro-cr-"));
  try {
    const html = join(dir, "index.html");
    // The server runs Chromium with JavaScript off. Chrome's own switch for
    // that breaks headless printing, so scripts are stripped from the page.
    const source = Buffer.from(await file.arrayBuffer()).toString("utf8")
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<script\b[^>]*>/gi, "");
    await writeFile(html, source);
    await run(CHROME, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${join(dir, "profile")}`,
      "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw", "--virtual-time-budget=8000",
      `--print-to-pdf=${join(dir, "out.pdf")}`,
      pathToFileURL(html).href,
    ]);
    return await readFile(join(dir, "out.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const ROUTES = {
  "/forms/libreoffice/convert": libreoffice,
  "/forms/chromium/convert/html": chromium,
};

createServer(async (req, res) => {
  const route = ROUTES[(req.url ?? "").split("?")[0]];
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ soffice: !!SOFFICE, chrome: !!CHROME }));
    return;
  }
  if (req.method !== "POST" || !route) { res.writeHead(404).end("not found"); return; }
  const started = Date.now();
  try {
    const pdf = await route(await readForm(req));
    res.writeHead(200, { "content-type": "application/pdf" }).end(pdf);
    console.log(`${req.url} 200 ${pdf.length}B ${Date.now() - started}ms`);
  } catch (e) {
    console.error(`${req.url} failed:`, e.message);
    res.writeHead(e.status ?? 500).end(String(e.message));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Word engine (dev) on http://127.0.0.1:${PORT}  soffice=${SOFFICE ?? "MISSING"}  chrome=${CHROME ?? "MISSING"}`);
});
