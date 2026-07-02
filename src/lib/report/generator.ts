import type { ReportData } from "./data";
import { buildReportHtml, buildBilingualHtml } from "./report-html";
import type { Lang } from "@/i18n/dict";
import { supabase } from "@/integrations/supabase/client";
import montArabic from "@/assets/MontserratArabic-Regular.ttf.asset.json";

import { buildKpiSnapshot } from "./snapshot";


export type ReportLangChoice = "ar" | "en" | "bilingual";

async function waitForImages(root: Document | HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          setTimeout(() => resolve(), 3000);
        })
    )
  );
}

const PDF_STYLE = `
  @font-face{font-family:'Montserrat Arabic';src:url('${montArabic.url}') format('truetype');font-weight:100 900;font-style:normal;font-display:block}
  html,body{margin:0;padding:0;background:#ffffff;color:#0F1B2D;font-family:'Montserrat Arabic','Montserrat','Cairo','Segoe UI',Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  *{box-sizing:border-box;font-family:inherit}
  [dir="rtl"],[lang="ar"]{font-family:'Montserrat Arabic','Cairo',Tahoma,Arial,sans-serif}
  .pdf-page{width:794px;min-height:1123px;box-sizing:border-box;overflow:hidden;display:block;background:#ffffff;page-break-after:always}
  .pdf-page:last-child{page-break-after:auto}
  table{border-collapse:collapse;font-family:inherit}
  svg{display:block;max-width:100%}
  img{max-width:100%;display:block}
`;


async function renderHtmlToPdfBlob(
  html: string,
  filename: string
): Promise<{ blob: Blob; pageCount: number }> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = (jspdfMod as unknown as { jsPDF: typeof import("jspdf").jsPDF }).jsPDF;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:794px",
    "height:1123px",
    "border:0",
    "opacity:1",
    "pointer-events:none",
    "background:#ffffff",
  ].join(";");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>${PDF_STYLE}</style>
      </head><body>${html}</body></html>`);
    doc.close();

    // Size iframe to full content so html2canvas has room
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".pdf-page"));
    const pageCount = Math.max(1, pages.length);
    iframe.style.height = `${pageCount * 1123}px`;

    // Wait for fonts + images + a settle frame
    await waitForImages(doc);
    const fonts = (doc as unknown as { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) { try { await fonts.ready; } catch { /* noop */ } }
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 200)));

    const pdf = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const targets: HTMLElement[] = pages.length ? pages : [doc.body];

    for (let i = 0; i < targets.length; i++) {
      const canvas = await html2canvas(targets[i], {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
        windowHeight: 1123,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) pdf.addPage();
      // Fit width, preserve aspect
      const imgH = (canvas.height * pageW) / canvas.width;
      const drawH = Math.min(imgH, pageH);
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, drawH, undefined, "FAST");
    }

    const blob = pdf.output("blob");
    return { blob, pageCount: targets.length };
  } finally {
    iframe.remove();
  }
  // filename retained by caller for download
  void filename;
}


function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateMemberReportPdf(data: ReportData, choice: ReportLangChoice): Promise<{ id: string | null; path: string | null }> {
  const html = choice === "bilingual" ? buildBilingualHtml(data) : buildReportHtml(data, choice as Lang);
  const safeName = data.member.full_name.replace(/[^\w\-\u0600-\u06FF]+/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `Mechatro_Report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const { blob, pageCount } = await renderHtmlToPdfBlob(html, filename);

  triggerDownload(blob, filename);

  // Persist to history — best-effort (does not block the download)
  try {
    const path = `${data.member.id}/${stamp}-${choice}.pdf`;
    const { error: upErr } = await supabase.storage.from("member-reports").upload(path, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw upErr;

    const snapshot = buildKpiSnapshot(data);
    const rangeFrom = data.range.from?.toISOString() ?? null;
    const rangeTo = data.range.to?.toISOString() ?? null;

    const { data: authUser } = await supabase.auth.getUser();
    const { data: row, error: insErr } = await supabase
      .from("member_reports")
      .insert({
        kind: "member",
        member_id: data.member.id,
        member_name_snapshot: data.member.full_name,
        generated_by: authUser.user?.id ?? null,
        generated_by_name_snapshot: data.generated_by.full_name,
        language: choice,
        range_key: data.range.label,
        range_from: rangeFrom,
        range_to: rangeTo,
        pdf_path: path,
        pdf_size_bytes: blob.size,
        page_count: pageCount,
        kpi_snapshot: snapshot as never,
        snapshot_version: 1,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { id: row.id, path };

  } catch (e) {
    console.warn("Report history save failed:", e);
    return { id: null, path: null };
  }
}

/** Render a pre-built HTML doc, download it, and upload to history as a `comparison` row. */
export async function persistComparisonPdf(opts: {
  html: string;
  filename: string;
  memberAId: string | null;
  memberBId: string | null;
  memberALabel: string;
  memberBLabel: string;
  reportAId: string;
  reportBId: string;
  language: ReportLangChoice;
  snapshot: unknown;
}): Promise<{ id: string | null; path: string | null }> {
  const { blob, pageCount } = await renderHtmlToPdfBlob(opts.html, opts.filename);
  triggerDownload(blob, opts.filename);

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `_comparisons/${stamp}-${opts.memberAId ?? "x"}-vs-${opts.memberBId ?? "x"}.pdf`;
    const { error: upErr } = await supabase.storage.from("member-reports").upload(path, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: authUser } = await supabase.auth.getUser();
    const { data: row, error: insErr } = await supabase
      .from("member_reports")
      .insert({
        kind: "comparison",
        member_id: opts.memberAId,
        member_name_snapshot: `${opts.memberALabel} ⇄ ${opts.memberBLabel}`,
        generated_by: authUser.user?.id ?? null,
        generated_by_name_snapshot: authUser.user?.user_metadata?.full_name || authUser.user?.email || null,
        language: opts.language,
        range_key: "comparison",
        pdf_path: path,
        pdf_size_bytes: blob.size,
        page_count: pageCount,
        compare_member_a: opts.memberAId,
        compare_member_b: opts.memberBId,
        compare_report_a: opts.reportAId,
        compare_report_b: opts.reportBId,
        kpi_snapshot: opts.snapshot as never,
        snapshot_version: 1,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { id: row.id, path };

  } catch (e) {
    console.warn("Comparison save failed:", e);
    return { id: null, path: null };
  }
}
