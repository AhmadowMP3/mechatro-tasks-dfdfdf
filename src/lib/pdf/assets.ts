// Lazy, cached loaders for PDF-side assets: the Mechatro logo (as data URL)
// and the Montserrat Arabic font (as base64 for jsPDF font embedding).

import logoUrl from "@/assets/mechatro-logo.png";
import fontAsset from "@/assets/MontserratArabic-Regular.ttf.asset.json";

const fontUrl: string = fontAsset.url;

let logoPromise: Promise<{ dataUrl: string; widthPx: number; heightPx: number } | null> | null = null;
let fontPromise: Promise<string | null> | null = null;

export function loadBrandLogo() {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const res = await fetch(logoUrl);
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        // Measure natural size to preserve aspect ratio.
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 1, h: 1 });
          img.src = dataUrl;
        });
        return { dataUrl, widthPx: dims.w, heightPx: dims.h };
      } catch {
        return null;
      }
    })();
  }
  return logoPromise;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function loadArabicFontB64(): Promise<string | null> {
  if (!fontPromise) {
    fontPromise = (async () => {
      try {
        const res = await fetch(fontUrl);
        const buf = await res.arrayBuffer();
        return arrayBufferToBase64(buf);
      } catch {
        return null;
      }
    })();
  }
  return fontPromise;
}

/** URL to Montserrat Arabic asset — reusable as a @font-face src. */
export const arabicFontUrl = fontUrl;
