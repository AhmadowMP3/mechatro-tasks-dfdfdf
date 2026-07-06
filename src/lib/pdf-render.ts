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

    // Compute block-boundary break hints (in CSS px relative to target top)
    // so htmlToPdf can slice pages at safe block boundaries — prevents
    // images and paragraphs from being chopped mid-render.
    const breakHintsPx: number[] = [];
    const rootRect = target.getBoundingClientRect();
    const contentEl = target.querySelector(".note-pdf-content") as HTMLElement | null;
    if (contentEl) {
      for (const kid of Array.from(contentEl.children) as HTMLElement[]) {
        const r = kid.getBoundingClientRect();
        breakHintsPx.push(r.top - rootRect.top);
      }
      const cr = contentEl.getBoundingClientRect();
      breakHintsPx.push(cr.bottom - rootRect.top);
    }

    await htmlToPdf(target, filename, breakHintsPx);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}
