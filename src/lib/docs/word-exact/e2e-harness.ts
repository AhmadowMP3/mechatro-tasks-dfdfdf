// Node-side harness for the end-to-end import tests. It recreates, outside the
// browser, exactly what the app does: the letterhead is measured in a real
// Chrome (as in the user's browser) and printed by the Word engine (as on the
// server). Used only by *.e2e.test.ts, which run when WORD_ENGINE_URL is set.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { bandsFrom, letterheadHtml, type LetterheadInput, type MeasuredLetterhead } from "./letterhead";

const run = promisify(execFile);
const ROOT = resolve(__dirname, "../../../..");

export const ENGINE = process.env.WORD_ENGINE_URL ?? "";

const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find((p) => p && existsSync(p));

/** Serve the app's own static assets to code that fetches them. */
export function installBrowserShims(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/")) {
      const path = url.split("?")[0]!;
      const file = [join(ROOT, "public", path), join(ROOT, path)].find((f) => existsSync(f));
      if (!file) return new Response("not found", { status: 404 });
      const type = path.endsWith(".png") ? "image/png" : path.endsWith(".ttf") ? "font/ttf" : "application/octet-stream";
      return new Response(readFileSync(file), { status: 200, headers: { "content-type": type } });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  if (typeof (globalThis as { FileReader?: unknown }).FileReader === "undefined") {
    class NodeFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then(
          (buf) => {
            this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
            this.onload?.();
          },
          () => this.onerror?.(),
        );
      }
    }
    (globalThis as { FileReader?: unknown }).FileReader = NodeFileReader;
  }
}

/** Measure the letterhead in a real Chrome, like `measureLetterhead` does in the app. */
export async function measureInChrome(input: LetterheadInput): Promise<MeasuredLetterhead> {
  if (!CHROME) throw new Error("Chrome/Edge not found (set CHROME_PATH)");
  const html = (await letterheadHtml(input, 1)).replace(
    "</body>",
    `<script>
      document.fonts.ready.then(() => {
        const sheet = document.querySelector('.lh-page');
        const q = (s) => sheet.querySelector(s).getBoundingClientRect();
        const top = sheet.getBoundingClientRect().top;
        document.body.setAttribute('data-m', JSON.stringify({
          headerPx: q('[data-doc-header]').height,
          footerPx: q('[data-doc-footer]').height,
          bodyTop: q('[data-doc-body-content]').top - top,
          footerTop: q('[data-qr-slot]').top - top,
        }));
      });
    </script></body>`,
  );
  const dir = await mkdtemp(join(tmpdir(), "lh-measure-"));
  try {
    const file = join(dir, "m.html");
    await writeFile(file, html);
    const { stdout } = await run(
      CHROME,
      ["--headless=new", "--disable-gpu", `--user-data-dir=${join(dir, "p")}`, "--virtual-time-budget=8000", "--window-size=900,1200", "--dump-dom", pathToFileURL(file).href],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const m = /data-m="([^"]+)"/.exec(stdout);
    if (!m) throw new Error("measurement missing from Chrome output");
    return bandsFrom(JSON.parse(m[1]!.replace(/&quot;/g, '"')));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function post(route: string, form: FormData): Promise<Uint8Array> {
  const res = await fetch(`${ENGINE}${route}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`${route} ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function engineDocxToPdf(docx: Uint8Array): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docx)]), "document.docx");
  return post("/forms/libreoffice/convert", form);
}

export function engineHtmlToPdf(html: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  return post("/forms/chromium/convert/html", form);
}
