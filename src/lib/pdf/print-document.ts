// Browser-native print-to-PDF for React documents.
//
// Rationale: jsPDF and html2canvas both lack Arabic complex-script shaping,
// so exports look broken. The browser's own print engine shapes Arabic
// perfectly (it's the same engine that renders the on-screen preview).
// We render the React node into a hidden iframe, wait for fonts + images,
// then trigger the print dialog. The user picks "Save as PDF".

import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { arabicFontUrl } from "./assets";

export type PrintOptions = {
  /** Suggested filename shown in the browser's print dialog. */
  title: string;
  /** Document language — sets html[lang] and html[dir]. */
  lang: "ar" | "en";
};

const A4_WIDTH_PX = 794;

function buildIframeHtml(lang: "ar" | "en", title: string): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  // Escape title for safe embedding in HTML.
  const safeTitle = title.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  @font-face {
    font-family: 'Montserrat Arabic';
    font-style: normal;
    font-weight: 400 700;
    font-display: block;
    src: url("${arabicFontUrl}") format('truetype');
  }
  @page {
    size: A4;
    margin: 12mm;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #0F2031;
    font-family: ${lang === "ar"
      ? "'Montserrat Arabic', 'Almarai', 'Segoe UI', sans-serif"
      : "'Montserrat', 'Montserrat Arabic', system-ui, sans-serif"};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #print-root {
    width: ${A4_WIDTH_PX}px;
    margin: 0 auto;
  }
  /* On screen (only briefly visible during load), keep layout stable. */
  @media print {
    body { width: auto; }
    #print-root { width: auto; }
    tr, .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
<div id="print-root"></div>
</body>
</html>`;
}

async function waitForAssets(doc: Document): Promise<void> {
  // Wait one microtask for React to mount.
  await new Promise((r) => setTimeout(r, 60));
  const fontsApi = (doc as unknown as { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fontsApi?.ready) {
    try { await fontsApi.ready; } catch { /* ignore */ }
  }
  const imgs = Array.from(doc.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));
  await new Promise((r) => setTimeout(r, 120));
}

/**
 * Render a React node into a hidden iframe and open the browser print
 * dialog. The user picks "Save as PDF" as destination.
 * Arabic ligatures, RTL, and mixed AR/EN text render correctly because
 * the browser's own text engine shapes the output — not a canvas.
 */
export async function printReactDocument(
  node: ReactNode,
  options: PrintOptions,
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const html = buildIframeHtml(options.lang, options.title);

  // Prefer document.open/write — srcdoc's load event can fire for the
  // initial about:blank before the actual HTML parses, leaving us with an
  // empty document and no #print-root.
  let doc = iframe.contentDocument;
  let win = iframe.contentWindow;
  try {
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    } else {
      iframe.srcdoc = html;
    }
  } catch {
    iframe.srcdoc = html;
  }

  // Poll for the mount node — handles both write and srcdoc paths.
  const deadline = Date.now() + 3000;
  let mount: HTMLElement | null = null;
  while (Date.now() < deadline) {
    doc = iframe.contentDocument;
    win = iframe.contentWindow;
    mount = doc?.getElementById("print-root") ?? null;
    if (mount && doc && win) break;
    await new Promise((r) => setTimeout(r, 40));
  }

  if (!doc || !win || !mount) {
    document.body.removeChild(iframe);
    throw new Error("Print root missing");
  }

  let root: Root | null = null;
  try {
    root = createRoot(mount);
    root.render(node as unknown as React.ReactElement);
    await waitForAssets(doc);
    // Set the title again after mount — some browsers seed the suggested
    // filename from document.title at print() time.
    doc.title = options.title;

    // Focus so the print dialog attaches to the iframe (not the parent),
    // which lets the browser use our document.title.
    win.focus();
    win.print();
  } finally {
    // Clean up after the dialog closes. `afterprint` isn't universally
    // reliable, so we also fall back to a delayed teardown.
    const cleanup = () => {
      try { root?.unmount(); } catch { /* ignore */ }
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    let done = false;
    const once = () => { if (done) return; done = true; cleanup(); };
    win.addEventListener("afterprint", once, { once: true });
    setTimeout(once, 60_000);
  }
}
