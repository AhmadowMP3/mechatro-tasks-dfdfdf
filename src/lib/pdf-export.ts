// Client-side branded PDF generator using html2canvas + jsPDF.
// Renders a hidden branded HTML template, captures it to canvas, embeds in PDF.
// Handles multi-page for long content and preserves Arabic fonts (from the DOM).

export async function htmlToPdf(element: HTMLElement, filename: string, breakHintsPx?: number[]): Promise<void> {
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

  // A4 in mm
  const pdfWidth = 210;
  const pdfHeight = 297;
  const pxPerMm = canvas.width / pdfWidth;
  // Whole pixels only — fractional canvas sizes break jsPDF's scale math.
  const pageHeightPx = Math.floor(pdfHeight * pxPerMm);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const addImageSafe = (data: string, w: number, h: number) => {
    // Guard against NaN/Infinity/<=0 → jsPDF throws "Invalid argument passed to jsPDF.scale"
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    pdf.addImage(data, "JPEG", 0, 0, w, h);
  };

  const totalPages = Math.ceil(canvas.height / pageHeightPx);

  // Draw a canvas slice onto a full A4-sized (pageHeightPx tall) canvas with
  // white padding at the bottom, then place it as a full A4 image in the PDF.
  // This guarantees every emitted PDF page is exactly A4 (210×297 mm).
  const addFullA4Page = (sliceSourceY: number, sliceHeight: number) => {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageHeightPx;
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
    addImageSafe(data, pdfWidth, pdfHeight);
  };

  if (totalPages <= 1) {
    addFullA4Page(0, canvas.height);
  } else {
    // Read source pixels once so we can find safe (mostly-white) break rows.
    const srcCtx = canvas.getContext("2d");
    const findSafeBreak = (from: number, maxBack: number): number => {
      if (!srcCtx) return from;
      const backLimit = Math.max(0, from - maxBack);
      try {
        const strip = srcCtx.getImageData(0, backLimit, canvas.width, from - backLimit).data;
        // Scan bottom-up for a fully-light row (>=98% of pixels near white)
        for (let y = from - backLimit - 1; y >= 0; y--) {
          let light = 0;
          const rowStart = y * canvas.width * 4;
          const step = 4 * 4; // sample every 4th pixel for speed
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
      } catch { /* tainted canvas — fall back */ }
      return from;
    };

    // html2canvas scale=2 → canvas pixels are 2× the CSS px passed in as hints.
    const hintsCanvasPx = (breakHintsPx ?? []).map((h) => h * 2).sort((a, b) => a - b);

    let yOffset = 0;
    let pageIndex = 0;
    const maxBacktrack = Math.floor(pageHeightPx * 0.15);
    while (yOffset < canvas.height) {
      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      let nextY = Math.min(canvas.height, yOffset + pageHeightPx);
      if (nextY < canvas.height) {
        const minAdvance = yOffset + Math.min(200, pageHeightPx * 0.25);
        const upper = yOffset + pageHeightPx;
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
      addFullA4Page(yOffset, sliceHeightPx);
      yOffset = nextY;
      pageIndex++;
    }
  }

  pdf.save(filename);
}
