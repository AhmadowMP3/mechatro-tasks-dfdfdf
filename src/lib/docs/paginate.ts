// A4 page model + shared helpers. Pagination itself has been removed; this
// module only keeps the page type, the paper size and the asset-readiness
// helper used before rendering or printing.

export type DocPage = {
  showClientBox: boolean;
  /** Resolved body HTML for this page. */
  html: string;
};

/** Full A4 at 96dpi, matching DocPaper. */
export const A4_SIZE = { width: 794, height: 1123 } as const;

/** Wait for fonts and images so measurements match what gets printed. */
export async function waitForPaperAssets(): Promise<void> {
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* ignore */ }
  const imgs = Array.from(document.images).filter((i) => !i.complete);
  await Promise.all(
    imgs.map((img) => new Promise<void>((res) => {
      img.addEventListener("load", () => res(), { once: true });
      img.addEventListener("error", () => res(), { once: true });
      setTimeout(res, 1500);
    })),
  );
}
