// Exact layout for protected PDFs. Their pages can be shown but not copied
// into another PDF, so each page is rendered (pdf.js) to a ~200 dpi image —
// only the part kept after cutting the original letterhead — and the images
// are fitted between the Mechatro bands.

import type { LetterheadBands } from "../word-exact/prepare-docx";
import type { ImportCrop } from "../model";

import { composeImagesIntoBands, type ComposedPdf, type PageImage } from "./pdf-exact";
import { canvasBytes, closePdf, openPdf, renderPage } from "./pdf-read";

/** ~200 dpi: sharp in print, still a reasonable file size. */
const RASTER_SCALE = 200 / 72;
/** Never cut more than this share of a page from either edge (as `keptBox`). */
const MAX_CUT_SHARE = 0.4;

export async function composeRasterIntoBands(bytes: Uint8Array, crop: ImportCrop, bands: LetterheadBands): Promise<ComposedPdf> {
  const doc = await openPdf(bytes);
  try {
    const images: PageImage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const full = await renderPage(doc, i, RASTER_SCALE);
      const landscape = full.width > full.height * 1.02;
      const heightPt = full.height / RASTER_SCALE;
      const cut = (v: number) => Math.round(Math.max(0, Math.min(v, heightPt * MAX_CUT_SHARE)) * RASTER_SCALE);
      const top = landscape ? 0 : cut(crop.topPt);
      const bottom = landscape ? 0 : cut(crop.bottomPt);
      const kept = document.createElement("canvas");
      kept.width = full.width;
      kept.height = Math.max(1, full.height - top - bottom);
      const ctx = kept.getContext("2d");
      if (!ctx) throw new Error("canvas_unavailable");
      ctx.drawImage(full, 0, top, full.width, kept.height, 0, 0, kept.width, kept.height);
      images.push({
        bytes: await canvasBytes(kept, "jpeg", 0.9),
        type: "jpeg",
        widthPt: kept.width / RASTER_SCALE,
        heightPt: kept.height / RASTER_SCALE,
        landscape,
      });
      // Release the pixel buffers right away: long documents add up quickly.
      full.width = full.height = kept.width = kept.height = 0;
    }
    return await composeImagesIntoBands(images, bands);
  } finally {
    await closePdf(doc);
  }
}
