import type { ReportData } from "./data";
import { buildReportHtml, buildBilingualHtml } from "./report-html";
import type { Lang } from "@/i18n/dict";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { buildKpiSnapshot } from "./snapshot";

// Lazy-load html2pdf.js only when generating
async function loadHtml2Pdf(): Promise<any> {
  const mod: any = await import("html2pdf.js");
  return mod.default ?? mod;
}

export type ReportLangChoice = "ar" | "en" | "bilingual";

async function renderHtmlToPdfBlob(html: string, filename: string): Promise<{ blob: Blob; pageCount: number }> {
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:794px;background:#fff;font-family:'Montserrat','Segoe UI',Tahoma,Arial,sans-serif;color:#0F1B2D;`;
  container.innerHTML = `<style>
    .pdf-page{width:794px;height:1123px;box-sizing:border-box;overflow:hidden;page-break-after:always;break-after:page}
    .pdf-page:last-child{page-break-after:auto}
    .pdf-page *{box-sizing:border-box}
    table{font-family:inherit}
  </style>${html}`;
  document.body.appendChild(container);
  await new Promise((r) => setTimeout(r, 60));

  try {
    const html2pdf = await loadHtml2Pdf();
    const worker = html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait", compress: true },
        pagebreak: { mode: ["css", "legacy"], before: ".html2pdf__page-break" },
      })
      .from(container);
    const blob: Blob = await worker.outputPdf("blob");
    // Approximate page count from container height
    const pageCount = Math.max(1, container.querySelectorAll(".pdf-page").length);
    return { blob, pageCount };
  } finally {
    container.remove();
  }
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

    await logActivity(authUser.user?.id ?? null, "report.generated", "report", row.id, {
      member_id: data.member.id,
      language: choice,
      range: data.range.label,
    });
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

    await logActivity(authUser.user?.id ?? null, "report.compared", "report", row.id, {
      a: opts.reportAId, b: opts.reportBId,
    });
    return { id: row.id, path };
  } catch (e) {
    console.warn("Comparison save failed:", e);
    return { id: null, path: null };
  }
}
