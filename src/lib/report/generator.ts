import type { ReportData } from "./data";
import { buildReportHtml, buildBilingualHtml } from "./report-html";
import type { Lang } from "@/i18n/dict";
import { supabase } from "@/integrations/supabase/client";
import montArabic from "@/assets/MontserratArabic-Regular.ttf.asset.json";
import type { ThemeId } from "./themes";

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
  html,body{margin:0;padding:0;background:#ffffff;color:#0F1B2D;font-family:'Montserrat Arabic','Montserrat','Cairo','Segoe UI',Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
  *{box-sizing:border-box;font-family:inherit;letter-spacing:0 !important;word-spacing:normal !important}
  [dir="rtl"],[lang="ar"],[dir="rtl"] *{font-family:'Montserrat Arabic','Cairo',Tahoma,Arial,sans-serif;unicode-bidi:isolate}
  .pdf-page{width:794px;min-height:1123px;box-sizing:border-box;overflow:hidden;display:block;background:#ffffff;position:relative}
  table{border-collapse:collapse;font-family:inherit}
  svg{display:block;max-width:100%}
  img{max-width:100%;display:block}
`;

const A4_W = 794;
const A4_H = 1123;

// Cache the logo as a data URL so html2canvas never has to hit the CDN.
let LOGO_DATA_URL: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (LOGO_DATA_URL) return LOGO_DATA_URL;
  try {
    const mod = await import("@/assets/mechatro-logo.png.asset.json");
    const url = (mod.default as { url: string }).url;
    const resp = await fetch(url);
    const blob = await resp.blob();
    LOGO_DATA_URL = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return LOGO_DATA_URL;
  } catch {
    return null;
  }
}

/** Inline the Mechatro logo so html2canvas paints it deterministically. */
async function inlineLogo(html: string): Promise<string> {
  const dataUrl = await getLogoDataUrl();
  if (!dataUrl) return html;
  return html.replace(
    /src="([^"]*mechatro-logo\.png[^"]*)"/g,
    `src="${dataUrl}"`
  );
}

/** Render one already-parsed section into a canvas via an isolated iframe. */
async function renderSectionToCanvas(
  sectionHtml: string,
  html2canvas: typeof import("html2canvas").default,
): Promise<HTMLCanvasElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${A4_W}px`,
    `height:${A4_H}px`,
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
      </head><body>${sectionHtml}</body></html>`);
    doc.close();

    await waitForImages(doc);
    const fonts = (doc as unknown as { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) { try { await fonts.ready; } catch { /* noop */ } }
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 150)));

    const el = doc.querySelector<HTMLElement>(".pdf-page") ?? doc.body;
    const naturalH = Math.max(A4_H, el.scrollHeight);
    iframe.style.height = `${naturalH}px`;
    el.style.minHeight = `${naturalH}px`;

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: A4_W,
      windowHeight: naturalH,
      foreignObjectRendering: false,
    });
    return canvas;
  } finally {
    iframe.remove();
  }
}

/** Split a tall canvas into A4-sized tile canvases. */
function sliceCanvasToPages(source: HTMLCanvasElement): HTMLCanvasElement[] {
  const pageHpx = Math.round((source.width * A4_H) / A4_W);
  if (source.height <= pageHpx + 4) return [source];
  const out: HTMLCanvasElement[] = [];
  let y = 0;
  while (y < source.height) {
    const h = Math.min(pageHpx, source.height - y);
    const tile = document.createElement("canvas");
    tile.width = source.width;
    tile.height = h;
    const ctx = tile.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tile.width, tile.height);
    ctx.drawImage(source, 0, y, source.width, h, 0, 0, source.width, h);
    out.push(tile);
    y += pageHpx;
  }
  return out;
}

async function renderHtmlToPdfBlob(
  html: string,
  filename: string
): Promise<{ blob: Blob; pageCount: number }> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = (jspdfMod as unknown as { jsPDF: typeof import("jspdf").jsPDF }).jsPDF;

  const inlined = await inlineLogo(html);

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!doctype html><html><body>${inlined}</body></html>`, "text/html");
  const sectionEls = Array.from(parsed.querySelectorAll<HTMLElement>("section.pdf-page"));
  const sections: string[] = sectionEls.length
    ? sectionEls.map((s) => s.outerHTML)
    : [inlined];

  const pdf = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  let pdfPageCount = 0;
  for (let i = 0; i < sections.length; i++) {
    const canvas = await renderSectionToCanvas(sections[i], html2canvas);
    const tiles = sliceCanvasToPages(canvas);
    for (const tile of tiles) {
      if (pdfPageCount > 0) pdf.addPage();
      const imgH = (tile.height * pageW) / tile.width;
      const drawH = Math.min(imgH, pageH);
      pdf.addImage(tile.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, drawH, undefined, "FAST");
      pdfPageCount++;
    }
  }

  const blob = pdf.output("blob");
  void filename;
  return { blob, pageCount: pdfPageCount };
}


export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type PreparedMemberReport = {
  blob: Blob;
  filename: string;
  pageCount: number;
  data: ReportData;
  choice: ReportLangChoice;
  theme?: ThemeId;
};

/** Build the branded PDF blob without downloading or persisting — for preview. */
export async function buildMemberReportPdf(
  data: ReportData,
  choice: ReportLangChoice,
  theme?: ThemeId,
): Promise<PreparedMemberReport> {
  const html = choice === "bilingual" ? buildBilingualHtml(data, theme) : buildReportHtml(data, choice as Lang, theme);
  const safeName = data.member.full_name.replace(/[^\w\-\u0600-\u06FF]+/g, "_");
  const filename = `Mechatro_Report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const { blob, pageCount } = await renderHtmlToPdfBlob(html, filename);
  return { blob, filename, pageCount, data, choice, theme };
}


/** Download + persist a previously-prepared member report to storage & history. */
export async function persistMemberReportPdf(
  prepared: PreparedMemberReport
): Promise<{ id: string | null; path: string | null }> {
  const { blob, filename, pageCount, data, choice } = prepared;
  triggerDownload(blob, filename);

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
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

/** Legacy one-shot: build + download + persist. Kept for callers that skip preview. */
export async function generateMemberReportPdf(
  data: ReportData,
  choice: ReportLangChoice,
  theme?: ThemeId,
): Promise<{ id: string | null; path: string | null }> {
  const prepared = await buildMemberReportPdf(data, choice, theme);
  return persistMemberReportPdf(prepared);
}

/** Build a team-wide PDF (all members). */
export async function buildTeamReportPdf(
  html: string,
  filename: string,
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const { blob, pageCount } = await renderHtmlToPdfBlob(html, filename);
  return { blob, filename, pageCount };
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
