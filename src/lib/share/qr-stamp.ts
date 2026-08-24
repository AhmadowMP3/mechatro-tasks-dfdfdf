// The QR stamp that sits at the bottom-left of the LAST page of every PDF,
// ALWAYS in the normal flow directly ABOVE the footer band — never absolutely
// positioned, so it can't overlap the signature / contact / page-number lines.

export const QR_SIZE = 68;
/** Height reserved for the QR row on every A4 page (stamp + breathing room). */
export const QR_ROW_H = 92;

const CAPTION_AR = "امسح للاطلاع على نسخة للقراءة فقط";
const CAPTION_EN = "Scan for a read-only copy";

/** Markup for the stamp (used inside the print iframe / stored snapshot). */
export function qrStampHtml(qrDataUrl: string, lang: "ar" | "en" = "ar"): string {
  const caption = lang === "ar" ? CAPTION_AR : CAPTION_EN;
  const second = lang === "ar" ? CAPTION_EN : CAPTION_AR;
  return `<div class="mx-qr-stamp" dir="ltr" style="position:relative;display:flex;align-items:center;gap:9px;break-inside:avoid;page-break-inside:avoid">
    <img src="${qrDataUrl}" alt="QR" style="width:${QR_SIZE}px;height:${QR_SIZE}px;display:block;background:#fff;border-radius:8px;padding:4px;box-sizing:border-box;flex:0 0 auto"/>
    <div style="width:158px;line-height:1.35">
      <div style="font-size:8.5px;color:#94A3B8;letter-spacing:.2px">${second}</div>
      <div dir="rtl" style="font-size:9px;color:#CBD5E1;font-family:'Montserrat Arabic','Cairo',sans-serif;margin-top:2px">${caption}</div>
    </div>
  </div>`;
}

/**
 * Stamp the QR on the last A4 page of an already-rendered document.
 * Priority: the reserved `[data-qr-slot]` row → right before the footer band
 * → the end of the content flow (finance lists / by-member reports).
 */
export function stampQrOnLastPage(doc: Document, qrDataUrl: string, lang: "ar" | "en" = "ar"): void {
  const pages = Array.from(doc.querySelectorAll<HTMLElement>(".doc-page"));
  const host = pages.length ? pages[pages.length - 1] : doc.getElementById("print-root");
  if (!host) return;

  const html = qrStampHtml(qrDataUrl, lang);

  // 1. Reserved slot inside the paper (business documents).
  const slot = host.querySelector<HTMLElement>("[data-qr-slot]");
  if (slot) {
    slot.innerHTML = html;
    return;
  }

  // 2. Insert as a flow row immediately above the footer band.
  const footer = host.querySelector<HTMLElement>("[data-doc-footer]");
  const wrap = doc.createElement("div");
  wrap.setAttribute("dir", "ltr");
  wrap.style.cssText =
    "display:flex;justify-content:flex-start;padding:0 40px 6px;break-inside:avoid;page-break-inside:avoid";
  wrap.innerHTML = html;
  if (footer?.parentElement) {
    footer.parentElement.insertBefore(wrap, footer);
    return;
  }

  // 3. Free-flowing document — land at the very end of the content.
  wrap.style.marginTop = "26px";
  host.appendChild(wrap);
}
