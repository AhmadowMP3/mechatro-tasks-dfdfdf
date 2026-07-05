// Utility to render a React node into an offscreen div and export it as PDF.

import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { htmlToPdf } from "./pdf-export";

/**
 * Renders the given React node into a hidden offscreen container, waits for
 * fonts + images to load, captures to PDF via html2canvas, downloads, then
 * tears the container down.
 */
export async function renderAndDownloadPdf(node: ReactNode, filename: string): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  // Push offscreen but keep it painted (visibility hidden or display:none
  // breaks html2canvas font metrics).
  host.style.top = "0";
  host.style.left = "-99999px";
  host.style.width = "794px"; // A4 width @ 96dpi
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(node as unknown as React.ReactElement);

  try {
    // Wait for React to commit + fonts to be ready
    await new Promise((r) => setTimeout(r, 60));
    if ((document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready) {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }
    // Wait for images inside the host
    const imgs = Array.from(host.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    }));
    // Extra tick to let layout settle
    await new Promise((r) => setTimeout(r, 100));

    const target = host.firstElementChild as HTMLElement | null;
    if (!target) throw new Error("No document rendered");
    await htmlToPdf(target, filename);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}
