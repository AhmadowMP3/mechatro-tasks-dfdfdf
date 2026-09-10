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
import { A4_SIZE } from "@/lib/docs/geometry";
import { prepareShare, saveSharePayload, type ShareTarget } from "@/lib/share/public-share";
import { stampQrOnLastPage } from "@/lib/share/qr-stamp";

export type PrintOptions = {
  /** Suggested filename shown in the browser's print dialog. */
  title: string;
  /** Document language — sets html[lang] and html[dir]. */
  lang: "ar" | "en";
  /** Page background (defaults to the app's dark navy). */
  background?: string;
  /** Page text color (defaults to the app's light ink). */
  color?: string;
  /**
   * When set, a QR code linking to a public read-only copy of this document
   * is stamped on the bottom-left of the last page, and the rendered A4
   * snapshot is stored so /v/{token} shows the very same document.
   */
  share?: ShareTarget;
};

const A4_WIDTH_PX = 794;

function buildIframeHtml(lang: "ar" | "en", title: string, background: string, color: string): string {
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
    /* Paginated documents carry their own inner padding; a printer margin
       here would push each page onto two sheets. */
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: ${background};
    color: ${color};
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
  /* Pre-paginated documents: one .doc-page element == exactly one sheet. */
  .doc-page {
    width: ${A4_WIDTH_PX}px;
    height: ${A4_SIZE.height}px;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
  }

  .doc-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  /* Table density MUST match .doc-rich in src/styles.css and the measure
     host, or a printed row is taller than the one that was measured. */
  .doc-rich table { border-collapse: collapse; table-layout: fixed; font-size: 11.5px; }
  .doc-rich table:not([data-width-pct]) { width: 100%; }
  .doc-rich th, .doc-rich td {
    border: 1px solid rgba(128,128,128,.45);
    padding: 5.33px 8px;
    vertical-align: top;
    word-break: break-word;
    line-height: 1.3;
  }
  .doc-rich th > p, .doc-rich td > p { margin: 0; line-height: 1.3; }
  .doc-rich th > p + p, .doc-rich td > p + p { margin-top: 3px; }

  /* The body writes under the letterhead, never over it. */
  .doc-page .doc-page-body { position: relative; z-index: 2; }
  .doc-page [data-qr-slot],
  .doc-page [data-doc-footer] { position: relative; z-index: 3; }

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

/** The exact CSS used by the print iframe — reused by the public viewer so the
 *  stored snapshot renders identically. */
export function printDocCss(lang: "ar" | "en", background = "#081320", color = "#E6EEF7"): string {
  const html = buildIframeHtml(lang, "", background, color);
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
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

  const html = buildIframeHtml(options.lang, options.title, options.background ?? "#081320", options.color ?? "#E6EEF7");

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

  // Reserve the public read-only link + QR before rendering, so the QR can be
  // stamped on the last page of this very export.
  const share = options.share ? await prepareShare({ lang: options.lang, title: options.title, ...options.share }) : null;

  let root: Root | null = null;
  try {
    root = createRoot(mount);
    root.render(node as unknown as React.ReactElement);
    await waitForAssets(doc);

    if (share) {
      stampQrOnLastPage(doc, share.qrDataUrl, options.lang);
      await waitForAssets(doc);
      // Store the rendered A4 snapshot for /v/{token}.
      const snapshotHtml = mount.innerHTML;
      void saveSharePayload(share.token, {
        html: snapshotHtml,
        css: printDocCss(options.lang, options.background ?? "#081320", options.color ?? "#E6EEF7"),
        width: A4_WIDTH_PX,
        background: options.background ?? "#081320",
        color: options.color ?? "#E6EEF7",
        title: options.title,
      });
    }

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
