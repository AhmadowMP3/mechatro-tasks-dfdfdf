// Client-side branded PDF generator using html2canvas + jsPDF.
// Content is rasterized from an offscreen HTML host and placed on each A4 page
// inside a reserved content zone; the unified header (logo) and footer
// (Page X/Y + generated meta) are drawn natively on top by stampChrome().

import { PAGE, CONTENT_HEIGHT_MM } from "./pdf/brand";
import { stampChrome, type ChromeOptions } from "./pdf/chrome";

export type HtmlToPdfOptions = {
  breakHintsPx?: number[];
  chrome?: ChromeOptions;
};

export async function htmlToPdf(
  element: HTMLElement,
  filename: string,
  options: HtmlToPdfOptions = {},
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Capture anchor positions (in CSS px, relative to `element`) BEFORE
  // rasterisation so we can convert them to PDF link annotations after
  // pages are laid out. This keeps hyperlinks clickable in the exported PDF.
  const elementRect = element.getBoundingClientRect();
  const anchors: { href: string; cssTop: number; cssLeft: number; cssWidth: number; cssHeight: number }[] = [];
  const anchorEls = element.querySelectorAll("a[href]");
  anchorEls.forEach((a) => {
    const href = (a as HTMLAnchorElement).href;
    if (!href || href.startsWith("javascript:")) return;
    // A single <a> may wrap text that spans multiple lines — capture every
    // client rect so multi-line links get one annotation per line.
    const rects = (a as HTMLAnchorElement).getClientRects();
    for (const r of Array.from(rects)) {
      if (r.width <= 0 || r.height <= 0) continue;
      anchors.push({
        href,
        cssTop: r.top - elementRect.top,
        cssLeft: r.left - elementRect.left,
        cssWidth: r.width,
        cssHeight: r.height,
      });
    }
  });

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#081320",
    logging: false,
  });

  if (!canvas || !canvas.width || !canvas.height) {
    throw new Error("Failed to render document to canvas");
  }

  const pdfWidth = PAGE.width;
  const pdfHeight = PAGE.height;
  const contentTop = PAGE.marginTop;
  const contentH = CONTENT_HEIGHT_MM;

  // The captured HTML is A4-width (~794px), so map: canvas.width == pdfWidth.
  const pxPerMm = canvas.width / pdfWidth;
  const pageContentPx = Math.floor(contentH * pxPerMm);
  // html2canvas scale=2 → 1 CSS px = 2 canvas px.
  const canvasPxPerCssPx = canvas.width / (elementRect.width || (pdfWidth * (canvas.width / pdfWidth) / 2));
  // Fallback to scale=2 if the computed ratio is off (element hidden/0-width).
  const cssToCanvas = Number.isFinite(canvasPxPerCssPx) && canvasPxPerCssPx > 0 ? canvasPxPerCssPx : 2;
  // Vertical: mm per canvas px inside the content zone.
  const mmPerCanvasPxY = contentH / pageContentPx;
  const mmPerCanvasPxX = pdfWidth / canvas.width;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const addImageSafe = (data: string, x: number, y: number, w: number, h: number) => {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    pdf.addImage(data, "JPEG", x, y, w, h);
  };

  const drawContentSlice = (sliceSourceY: number, sliceHeight: number) => {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageContentPx;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) return;
    // Fill with the same dark navy the app renders on — prevents any
    // 1-2px gaps between slices from flashing white.
    ctx.fillStyle = "#081320";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0, sliceSourceY, canvas.width, sliceHeight,
      0, 0, canvas.width, sliceHeight,
    );
    const data = pageCanvas.toDataURL("image/jpeg", 0.95);
    // Paint a matching dark rectangle across the full page then place the
    // slice inside the content zone. jsPDF's default page is white otherwise.
    pdf.setFillColor(8, 19, 32);
    pdf.rect(0, 0, pdfWidth, pdfHeight, "F");
    addImageSafe(data, 0, contentTop, pdfWidth, contentH);
  };

  // Record each page's canvas Y range so we can place link annotations later.
  const pages: { yOffset: number; sliceHeightPx: number }[] = [];
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageContentPx));

  if (totalPages <= 1) {
    drawContentSlice(0, canvas.height);
    pages.push({ yOffset: 0, sliceHeightPx: canvas.height });
  } else {
    const srcCtx = canvas.getContext("2d");
    // On a dark page, scan for near-navy rows (safe to break in the gap
    // between two dark cards) rather than near-white rows.
    const findSafeBreak = (from: number, maxBack: number): number => {
      if (!srcCtx) return from;
      const backLimit = Math.max(0, from - maxBack);
      try {
        const strip = srcCtx.getImageData(0, backLimit, canvas.width, from - backLimit).data;
        for (let y = from - backLimit - 1; y >= 0; y--) {
          let dark = 0;
          const rowStart = y * canvas.width * 4;
          const step = 4 * 4;
          let sampled = 0;
          for (let x = 0; x < canvas.width * 4; x += step) {
            const r = strip[rowStart + x];
            const g = strip[rowStart + x + 1];
            const b = strip[rowStart + x + 2];
            // Match the brand-navy band (roughly rgb(8,19,32) ± 12).
            if (r < 24 && g < 34 && b < 48) dark++;
            sampled++;
          }
          if (sampled > 0 && dark / sampled >= 0.98) return backLimit + y + 1;
        }
      } catch { /* tainted canvas */ }
      return from;
    };


    const hintsCanvasPx = (options.breakHintsPx ?? []).map((h) => h * 2).sort((a, b) => a - b);

    let yOffset = 0;
    let pageIndex = 0;
    const maxBacktrack = Math.floor(pageContentPx * 0.15);
    while (yOffset < canvas.height) {
      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      let nextY = Math.min(canvas.height, yOffset + pageContentPx);
      if (nextY < canvas.height) {
        const minAdvance = yOffset + Math.min(200, pageContentPx * 0.25);
        const upper = yOffset + pageContentPx;
        let bestHint = -1;
        for (const h of hintsCanvasPx) {
          if (h > minAdvance && h <= upper && h > bestHint) bestHint = h;
        }
        if (bestHint > 0) {
          nextY = bestHint;
        } else {
          const safe = findSafeBreak(nextY, maxBacktrack);
          if (safe > yOffset + 100) nextY = safe;
        }
      }
      const sliceHeightPx = Math.max(1, nextY - yOffset);
      drawContentSlice(yOffset, sliceHeightPx);
      pages.push({ yOffset, sliceHeightPx });
      yOffset = nextY;
      pageIndex++;
    }
  }

  // Place clickable link annotations for every anchor rect, on whichever
  // page(s) it falls onto. Multi-page anchors are clipped per page.
  for (const a of anchors) {
    const aTopCanvas = a.cssTop * cssToCanvas;
    const aBotCanvas = (a.cssTop + a.cssHeight) * cssToCanvas;
    const aLeftCanvas = a.cssLeft * cssToCanvas;
    const aWidthCanvas = a.cssWidth * cssToCanvas;
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const pageTop = p.yOffset;
      const pageBot = p.yOffset + p.sliceHeightPx;
      const top = Math.max(aTopCanvas, pageTop);
      const bot = Math.min(aBotCanvas, pageBot);
      if (bot <= top) continue;
      const yMm = contentTop + (top - pageTop) * mmPerCanvasPxY;
      const hMm = (bot - top) * mmPerCanvasPxY;
      const xMm = aLeftCanvas * mmPerCanvasPxX;
      const wMm = aWidthCanvas * mmPerCanvasPxX;
      pdf.setPage(i + 1);
      pdf.link(xMm, yMm, wMm, hMm, { url: a.href });
    }
  }

  // Stamp unified header + footer over every page.
  if (options.chrome) {
    await stampChrome(pdf, options.chrome);
  }

  pdf.save(filename);
}
