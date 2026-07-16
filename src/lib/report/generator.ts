import type { ReportData } from "./data";
import { buildReportHtml, buildBilingualHtml } from "./report-html";
import type { Lang } from "@/i18n/dict";
import { supabase } from "@/integrations/supabase/client";
import montArabic from "@/assets/MontserratArabic-Regular.ttf.asset.json";

import { buildKpiSnapshot } from "./snapshot";


export type ReportLangChoice = "ar" | "en" | "bilingual";
export type ReportKind = "member" | "team" | "comparison";
const REPORT_LABELS: Record<ReportKind, { en: string; ar: string }> = {
  member: { en: "Member Report", ar: "تقرير العضو" },
  team: { en: "Team Report", ar: "تقرير الفريق" },
  comparison: { en: "Comparison Report", ar: "تقرير مقارنة" },
};


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
  html,body{margin:0;padding:0;background:#081320;color:#E6EEF7;font-family:'Montserrat','Segoe UI',Tahoma,Arial,'Montserrat Arabic','Cairo',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
  *{box-sizing:border-box}
  :lang(ar),[dir="rtl"]{font-family:'Montserrat Arabic','Cairo',Tahoma,Arial,sans-serif;unicode-bidi:isolate}
  .pdf-page{width:794px;min-height:1123px;box-sizing:border-box;overflow:hidden;display:block;background:#081320;position:relative}
  .pdf-block{width:706px;box-sizing:border-box;background:transparent}
  .pdf-chrome{width:794px;box-sizing:border-box;background:#081320}
  table{border-collapse:collapse;font-family:inherit}
  svg{display:block;max-width:100%}
  img{max-width:100%;display:block}
`;

// A4 pixel canvas dimensions at 96 DPI (matches CSS px in html2canvas).
const A4_W = 794;
const A4_H = 1123;
// Page chrome sizes reserved at top and bottom of each content page.
const HEADER_H = 74; // px, includes hairline
const FOOTER_H = 42; // px, includes hairline
const SIDE_PAD = 44; // px, matches .pdf-block width offset
const CONTENT_W = A4_W - SIDE_PAD * 2; // 706
const CONTENT_TOP = HEADER_H + 10;      // small gap below header
const CONTENT_BOTTOM = A4_H - FOOTER_H - 10; // small gap above footer
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;

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

/** Render an arbitrary HTML fragment inside an isolated iframe and return
 *  its rasterised canvas. The fragment is sized to the given width; height
 *  is measured from actual layout. */
async function renderFragmentToCanvas(
  fragmentHtml: string,
  html2canvas: typeof import("html2canvas").default,
  widthPx: number,
): Promise<HTMLCanvasElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed", "left:-10000px", "top:0",
    `width:${widthPx}px`, "height:200px",
    "border:0", "opacity:1", "pointer-events:none", "background:#081320",
  ].join(";");
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      <style>${PDF_STYLE}</style>
      </head><body>${fragmentHtml}</body></html>`);
    doc.close();

    await waitForImages(doc);
    const fonts = (doc as unknown as { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) { try { await fonts.ready; } catch { /* noop */ } }
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 120)));

    const el = (doc.body.firstElementChild as HTMLElement) ?? doc.body;
    const naturalH = Math.max(1, el.scrollHeight);
    iframe.style.height = `${naturalH}px`;

    const baseOpts = {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#081320",
      logging: false,
      windowWidth: widthPx,
      windowHeight: naturalH,
    };
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(el, { ...baseOpts, foreignObjectRendering: true });
      const probe = canvas.getContext("2d")?.getImageData(1, 1, 1, 1).data;
      const blank = probe && probe[0] === 0 && probe[1] === 0 && probe[2] === 0 && probe[3] === 0;
      if (blank) throw new Error("blank foreignObject canvas");
    } catch {
      canvas = await html2canvas(el, { ...baseOpts, foreignObjectRendering: false });
    }
    return canvas;
  } finally {
    iframe.remove();
  }
}

/** HTML for the shared page-chrome header (logo + branding) painted at the
 *  top of every content page. Rendered once and reused. */
function headerHtml(title: string, rangeText: string, logoDataUrl: string, kind: ReportKind): string {
  const label = REPORT_LABELS[kind];
  return `<div class="pdf-chrome" style="width:${A4_W}px;height:${HEADER_H}px;padding:14px ${SIDE_PAD}px 10px;display:flex;justify-content:space-between;align-items:center;font-family:'Montserrat','Montserrat Arabic',sans-serif;border-bottom:1px solid #1E3A57;background:#081320">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="${logoDataUrl}" style="height:32px;object-fit:contain"/>
      <div style="border-left:2px solid #1E3A57;padding-left:12px">
        <div style="font-size:10.5px;font-weight:900;letter-spacing:2px;color:#E6EEF7;text-transform:uppercase">${escHtml(label.en)}</div>
        <div dir="rtl" style="font-size:10px;color:#94A3B8;margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${escHtml(label.ar)}</div>
      </div>
    </div>
    <div style="text-align:right;font-size:9.5px;color:#94A3B8;line-height:1.4">
      <div style="color:#E6EEF7;font-weight:800;letter-spacing:.5px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(title)}</div>
      <div>${escHtml(rangeText)}</div>
    </div>
  </div>
  <div style="width:${A4_W}px;height:3px;background:linear-gradient(90deg,#189FD1 0,#189FD1 56px,#D4A017 56px,#D4A017 112px,#E8732E 112px,#E8732E 168px,#4E9A33 168px,#4E9A33 224px,transparent 224px)"></div>`;
}

/** HTML for the shared page-chrome footer. Rendered once; the page number is
 *  drawn on top as jsPDF text so we don't need one canvas per page. */
function footerHtml(logoDataUrl: string): string {
  return `<div class="pdf-chrome" style="width:${A4_W}px;height:${FOOTER_H}px;padding:10px ${SIDE_PAD}px;display:flex;justify-content:space-between;align-items:center;font-family:'Montserrat','Montserrat Arabic',sans-serif;border-top:1px solid #1E3A57;font-size:10px;color:#94A3B8;letter-spacing:.5px;background:#081320">
    <div style="display:flex;align-items:center;gap:8px">
      <img src="${logoDataUrl}" style="width:14px;height:14px;object-fit:contain;opacity:.9"/>
      <span>mechatro · Innovative Energy Solutions</span>
    </div>
    <div style="width:120px"></div>
  </div>`;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Pack rendered block canvases into physical A4 pages. Each returned page is
 *  an array of {canvas, yPx} entries where yPx is the top offset inside the
 *  page's content band. Blocks taller than the content band get scaled down
 *  to fit as a full-page block. */
function packBlocks(blockCanvases: HTMLCanvasElement[]): { canvas: HTMLCanvasElement; yPx: number; heightPx: number }[][] {
  // Each block canvas is at scale=2 → convert to page pixels (1x) by /2.
  const gap = 14; // px between blocks on a page
  const pages: { canvas: HTMLCanvasElement; yPx: number; heightPx: number }[][] = [];
  let current: { canvas: HTMLCanvasElement; yPx: number; heightPx: number }[] = [];
  let cursorY = 0;
  for (const c of blockCanvases) {
    let hPx = c.height / 2;
    // If a single block is taller than the content area, scale it to fit.
    if (hPx > CONTENT_H) hPx = CONTENT_H;
    const needed = hPx + (current.length ? gap : 0);
    if (cursorY + needed > CONTENT_H && current.length) {
      pages.push(current);
      current = [];
      cursorY = 0;
    }
    const y = cursorY + (current.length ? gap : 0);
    current.push({ canvas: c, yPx: y, heightPx: hPx });
    cursorY = y + hPx;
  }
  if (current.length) pages.push(current);
  return pages;
}

async function renderHtmlToPdfBlob(
  html: string,
  filename: string,
  memberName: string,
  rangeText: string,
  kind: ReportKind = "member",
): Promise<{ blob: Blob; pageCount: number }> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = (jspdfMod as unknown as { jsPDF: typeof import("jspdf").jsPDF }).jsPDF;

  const inlined = await inlineLogo(html);
  const logoDataUrl = (await getLogoDataUrl()) ?? "";

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!doctype html><html><body>${inlined}</body></html>`, "text/html");
  const coverEls = Array.from(parsed.querySelectorAll<HTMLElement>("section.pdf-page"));
  const blockEls = Array.from(parsed.querySelectorAll<HTMLElement>("div.pdf-block"));

  const pdf = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const pxToPt = pageW / A4_W;

  // Pre-render shared chrome canvases (logo, hairline, brand strip).
  const headerCanvas = logoDataUrl
    ? await renderFragmentToCanvas(headerHtml(memberName, rangeText, logoDataUrl, kind), html2canvas, A4_W)
    : null;
  const footerCanvas = logoDataUrl
    ? await renderFragmentToCanvas(footerHtml(logoDataUrl), html2canvas, A4_W)
    : null;

  // Render each content block into its own canvas so we know its true height
  // before deciding page breaks.
  const blockCanvases: HTMLCanvasElement[] = [];
  for (const el of blockEls) {
    const c = await renderFragmentToCanvas(el.outerHTML, html2canvas, CONTENT_W);
    blockCanvases.push(c);
  }
  const contentPages = packBlocks(blockCanvases);

  let pdfPageCount = 0;

  // 1. Cover page(s) — render as full A4 (they have their own branding).
  for (const cover of coverEls) {
    const canvas = await renderFragmentToCanvas(cover.outerHTML, html2canvas, A4_W);
    if (pdfPageCount > 0) pdf.addPage();
    const imgH = (canvas.height * pageW) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, Math.min(imgH, pageH), undefined, "FAST");
    pdfPageCount++;
  }

  // 2. Content pages — draw chrome + packed blocks.
  const totalPhysicalPages = pdfPageCount + contentPages.length;
  contentPages.forEach((pageBlocks, idx) => {
    pdf.addPage();
    pdfPageCount++;

    // Header strip
    if (headerCanvas) {
      const hPt = (headerCanvas.height / 2) * pxToPt;
      pdf.addImage(headerCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, hPt, undefined, "FAST");
    }

    // Content blocks
    for (const b of pageBlocks) {
      const xPt = SIDE_PAD * pxToPt;
      const yPt = (CONTENT_TOP + b.yPx) * pxToPt;
      const wPt = CONTENT_W * pxToPt;
      const hPt = b.heightPx * pxToPt;
      pdf.addImage(
        b.canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        xPt, yPt, wPt, hPt,
        undefined, "FAST",
      );
    }

    // Footer strip
    if (footerCanvas) {
      const fPt = (footerCanvas.height / 2) * pxToPt;
      pdf.addImage(footerCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, pageH - fPt, pageW, fPt, undefined, "FAST");
    }

    // Page number overlay (Latin digits render fine in default jsPDF font).
    pdf.setFontSize(9);
    pdf.setTextColor(138, 138, 138);
    const pageLabel = `page ${pdfPageCount} / ${totalPhysicalPages}`;
    pdf.text(pageLabel, pageW - SIDE_PAD * pxToPt, pageH - 14, { align: "right" });
    void idx;
  });

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
};

/** Build the branded PDF blob without downloading or persisting — for preview. */
export async function buildMemberReportPdf(
  data: ReportData,
  choice: ReportLangChoice,
): Promise<PreparedMemberReport> {
  const html = choice === "bilingual" ? buildBilingualHtml(data) : buildReportHtml(data, choice as Lang);
  const safeName = data.member.full_name.replace(/[^\w\-\u0600-\u06FF]+/g, "_");
  const filename = `Mechatro_Report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const rangeText = data.range.from
    ? `${data.range.from.toISOString().slice(0, 10)} — ${(data.range.to ?? new Date()).toISOString().slice(0, 10)}`
    : "All time";
  const { blob, pageCount } = await renderHtmlToPdfBlob(html, filename, data.member.full_name, rangeText, "member");
  return { blob, filename, pageCount, data, choice };
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
): Promise<{ id: string | null; path: string | null }> {
  const prepared = await buildMemberReportPdf(data, choice);
  return persistMemberReportPdf(prepared);
}

/** Build a team-wide PDF (all members). */
export async function buildTeamReportPdf(
  html: string,
  filename: string,
  rangeText?: string,
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const { blob, pageCount } = await renderHtmlToPdfBlob(html, filename, "Mechatro Team", rangeText ?? "", "team");
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
  const { blob, pageCount } = await renderHtmlToPdfBlob(opts.html, opts.filename, `${opts.memberALabel} ⇄ ${opts.memberBLabel}`, "Head-to-head", "comparison");
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
