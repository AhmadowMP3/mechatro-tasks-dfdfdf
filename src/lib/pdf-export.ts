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

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  // A4 in mm
  const pdfWidth = 210;
  const pdfHeight = 297;
  const pxPerMm = canvas.width / pdfWidth;
  const pageHeightPx = pdfHeight * pxPerMm;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const totalPages = Math.ceil(canvas.height / pageHeightPx);
  if (totalPages <= 1) {
    // Fits on one page
    const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeightMm);
  } else {
    // Slice canvas per page
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage();
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.min(pageHeightPx, canvas.height - i * pageHeightPx);
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, i * pageHeightPx, canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
      const sliceHeightMm = (sliceCanvas.height / canvas.width) * pdfWidth;
      pdf.addImage(sliceData, "JPEG", 0, 0, pdfWidth, sliceHeightMm);
    }
  }

  pdf.save(filename);
}
