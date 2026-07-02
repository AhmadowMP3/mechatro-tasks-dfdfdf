import type { ReportData } from "./data";
import { buildReportHtml, buildBilingualHtml } from "./report-html";
import type { Lang } from "@/i18n/dict";

// Lazy-load html2pdf.js only when generating
async function loadHtml2Pdf(): Promise<any> {
  const mod: any = await import("html2pdf.js");
  return mod.default ?? mod;
}

export type ReportLangChoice = "ar" | "en" | "bilingual";

export async function generateMemberReportPdf(data: ReportData, choice: ReportLangChoice): Promise<void> {
  const html = choice === "bilingual" ? buildBilingualHtml(data) : buildReportHtml(data, choice as Lang);

  // Build off-DOM container sized to A4 width (~794px at 96dpi)
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:794px;background:#fff;font-family:'Montserrat','Segoe UI',Tahoma,Arial,sans-serif;color:#0F1B2D;`;
  container.innerHTML = `<style>
    .pdf-page{width:794px;height:1123px;box-sizing:border-box;overflow:hidden;page-break-after:always;break-after:page}
    .pdf-page:last-child{page-break-after:auto}
    .pdf-page *{box-sizing:border-box}
    table{font-family:inherit}
  </style>${html}`;
  document.body.appendChild(container);

  // Wait a tick for images (logo) to be ready
  await new Promise((r) => setTimeout(r, 60));

  const filename = `Mechatro_Report_${data.member.full_name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;

  try {
    const html2pdf = await loadHtml2Pdf();
    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait", compress: true },
        pagebreak: { mode: ["css", "legacy"], before: ".html2pdf__page-break" },
      })
      .from(container)
      .save();
  } finally {
    container.remove();
  }
}
