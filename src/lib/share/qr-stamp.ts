// The QR stamp that appears at the bottom-left of the LAST page of every PDF.
// One shape, one size, one caption — shared by the print engine and jsPDF.

export const QR_SIZE = 74;

const CAPTION_AR = "امسح للاطلاع على نسخة للقراءة فقط";
const CAPTION_EN = "Scan for a read-only copy";

/** Markup for the stamp (used inside the print iframe / stored snapshot). */
export function qrStampHtml(qrDataUrl: string, lang: "ar" | "en" = "ar"): string {
  const caption = lang === "ar" ? CAPTION_AR : CAPTION_EN;
  const second = lang === "ar" ? CAPTION_EN : CAPTION_AR;
  return `<div class="mx-qr-stamp" dir="ltr" style="position:absolute;left:34px;bottom:16px;display:flex;align-items:center;gap:9px;z-index:9">
    <img src="${qrDataUrl}" alt="QR" style="width:${QR_SIZE}px;height:${QR_SIZE}px;display:block;background:#fff;border-radius:8px;padding:4px;box-sizing:border-box"/>
    <div style="max-width:150px;line-height:1.35">
      <div style="font-size:8.5px;color:#94A3B8;letter-spacing:.2px">${second}</div>
      <div dir="rtl" style="font-size:9px;color:#CBD5E1;font-family:'Montserrat Arabic','Cairo',sans-serif;margin-top:2px">${caption}</div>
    </div>
  </div>`;
}

/**
 * Stamp the QR on the last A4 page of an already-rendered document.
 * Works for `.doc-page` documents (business docs) and for free-flowing
 * documents (finance lists / by-member) by anchoring to #print-root.
 */
export function stampQrOnLastPage(doc: Document, qrDataUrl: string, lang: "ar" | "en" = "ar"): void {
  const pages = Array.from(doc.querySelectorAll<HTMLElement>(".doc-page"));
  const host = pages.length ? pages[pages.length - 1] : doc.getElementById("print-root");
  if (!host) return;
  const cs = doc.defaultView?.getComputedStyle(host);
  if (!cs || cs.position === "static") host.style.position = "relative";
  if (!pages.length) {
    // Free-flowing document: keep the stamp in the normal flow so it always
    // lands at the very end of the last printed page (never overlapping).
    const wrap = doc.createElement("div");
    wrap.setAttribute("dir", "ltr");
    wrap.style.cssText = "margin-top:26px;display:flex;justify-content:flex-start;break-inside:avoid;page-break-inside:avoid";
    wrap.innerHTML = qrStampHtml(qrDataUrl, lang).replace(
      'position:absolute;left:34px;bottom:16px;',
      'position:relative;',
    );
    host.appendChild(wrap);
    return;
  }
  const holder = doc.createElement("div");
  holder.innerHTML = qrStampHtml(qrDataUrl, lang);
  const stamp = holder.firstElementChild;
  if (stamp) host.appendChild(stamp);
}
