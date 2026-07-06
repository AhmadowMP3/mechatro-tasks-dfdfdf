// Client-side branded PDF generator using html2canvas + jsPDF.
// Renders a hidden branded HTML template, captures it to canvas, embeds in PDF.
// Handles multi-page for long content and preserves Arabic fonts (from the DOM).

export async function htmlToPdf(element: HTMLElement, filename: string): Promise<void> {
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

  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

  if (totalPages <= 1) {
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;
    addImageSafe(imgData, pdfWidth, imgHeightMm);
  } else {
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage();
      const yOffset = i * pageHeightPx;
      const sliceHeightPx = Math.max(1, Math.min(pageHeightPx, canvas.height - yOffset));
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, yOffset, canvas.width, sliceHeightPx,
        0, 0, sliceCanvas.width, sliceCanvas.height,
      );
      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
      const sliceHeightMm = (sliceHeightPx / canvas.width) * pdfWidth;
      addImageSafe(sliceData, pdfWidth, sliceHeightMm);
    }
  }

  pdf.save(filename);
}
