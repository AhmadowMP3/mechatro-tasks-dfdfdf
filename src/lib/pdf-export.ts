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

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
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

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const addImageSafe = (data: string, x: number, y: number, w: number, h: number) => {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    pdf.addImage(data, "JPEG", x, y, w, h);
  };

  // Renders a canvas slice onto a scratch canvas sized to the content area
  // (with white padding at the bottom), then places it as an image at the
  // content-zone top of the current PDF page.
  const drawContentSlice = (sliceSourceY: number, sliceHeight: number) => {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageContentPx;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0, sliceSourceY, canvas.width, sliceHeight,
      0, 0, canvas.width, sliceHeight,
    );
    const data = pageCanvas.toDataURL("image/jpeg", 0.95);
    addImageSafe(data, 0, contentTop, pdfWidth, contentH);
  };

  const totalPages = Math.max(1, Math.ceil(canvas.height / pageContentPx));

  if (totalPages <= 1) {
    drawContentSlice(0, canvas.height);
  } else {
    const srcCtx = canvas.getContext("2d");
    const findSafeBreak = (from: number, maxBack: number): number => {
      if (!srcCtx) return from;
      const backLimit = Math.max(0, from - maxBack);
      try {
        const strip = srcCtx.getImageData(0, backLimit, canvas.width, from - backLimit).data;
        for (let y = from - backLimit - 1; y >= 0; y--) {
          let light = 0;
          const rowStart = y * canvas.width * 4;
          const step = 4 * 4;
          let sampled = 0;
          for (let x = 0; x < canvas.width * 4; x += step) {
            const r = strip[rowStart + x];
            const g = strip[rowStart + x + 1];
            const b = strip[rowStart + x + 2];
            if (r > 240 && g > 240 && b > 240) light++;
            sampled++;
          }
          if (sampled > 0 && light / sampled >= 0.98) return backLimit + y + 1;
        }
      } catch { /* tainted canvas */ }
      return from;
    };

    // html2canvas scale=2 → canvas pixels are 2× the CSS px hints.
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
      yOffset = nextY;
      pageIndex++;
    }
  }

  // Stamp unified header + footer over every page.
  if (options.chrome) {
    await stampChrome(pdf, options.chrome);
  }

  pdf.save(filename);
}
