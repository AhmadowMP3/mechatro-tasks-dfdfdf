// Utility to render a React node into an offscreen div and export it as PDF.
// Injects the Montserrat Arabic @font-face so Arabic content rasterizes with
// correct shaping regardless of what the host app has loaded, and forwards the
// unified header/footer chrome options to the PDF exporter.

import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { htmlToPdf } from "./pdf-export";
import { arabicFontUrl } from "./pdf/assets";
import type { ChromeOptions } from "./pdf/chrome";

// The A4 content zone is 297mm − 24mm top − 16mm bottom = 257mm at 96dpi.
// 794px = 210mm, so 257mm ≈ 972px. We size the host to that first-page
// content height so page-break hints stay accurate.
const A4_WIDTH_PX = 794;

// Ensure a Montserrat Arabic @font-face declaration lives in <head> exactly once.
let fontFaceInstalled = false;
function ensureArabicFontFace() {
  if (fontFaceInstalled) return;
  fontFaceInstalled = true;
  const style = document.createElement("style");
  style.setAttribute("data-mechatro-pdf-fonts", "true");
  style.textContent = `
    @font-face {
      font-family: 'Montserrat Arabic';
      font-style: normal;
      font-weight: 400 700;
      font-display: block;
      src: url(${arabicFontUrl}) format('truetype');
    }
  `;
  document.head.appendChild(style);
}

export type RenderPdfOptions = {
  breakHintsPx?: number[];
  chrome?: ChromeOptions;
};

/**
 * Renders the given React node into a hidden offscreen container, waits for
 * fonts + images to load, captures to PDF via html2canvas, downloads, then
 * tears the container down. Unified header + footer are drawn natively by
 * the PDF exporter when a `chrome` option is supplied.
 */
export async function renderAndDownloadPdf(
  node: ReactNode,
  filename: string,
  options: RenderPdfOptions = {},
): Promise<void> {
  ensureArabicFontFace();

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "-99999px";
  host.style.width = `${A4_WIDTH_PX}px`;
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";
  // Nudge every descendant toward the embedded Arabic-safe font stack.
  host.style.setProperty("--mechatro-pdf-font", "'Montserrat Arabic', 'Almarai', 'Montserrat', system-ui, sans-serif");
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(node as unknown as React.ReactElement);

  try {
    await new Promise((r) => setTimeout(r, 60));
    if ((document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready) {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }
    const imgs = Array.from(host.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    }));
    await new Promise((r) => setTimeout(r, 100));

    const target = host.firstElementChild as HTMLElement | null;
    if (!target) throw new Error("No document rendered");

    // Compute block-boundary break hints (in CSS px relative to target top)
    // so htmlToPdf can slice pages at safe block boundaries — prevents
    // images and paragraphs from being chopped mid-render.
    const breakHintsPx: number[] = [];
    const rootRect = target.getBoundingClientRect();
    const contentEl = target.querySelector(".note-pdf-content, .pdf-flow") as HTMLElement | null;
    if (contentEl) {
      for (const kid of Array.from(contentEl.children) as HTMLElement[]) {
        const r = kid.getBoundingClientRect();
        breakHintsPx.push(r.top - rootRect.top);
      }
      const cr = contentEl.getBoundingClientRect();
      breakHintsPx.push(cr.bottom - rootRect.top);
    }

    await htmlToPdf(target, filename, {
      breakHintsPx: options.breakHintsPx ?? breakHintsPx,
      chrome: options.chrome,
    });
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}
