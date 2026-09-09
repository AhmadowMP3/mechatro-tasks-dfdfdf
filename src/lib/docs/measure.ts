// The ONLY place block heights are measured. A single hidden host, created
// once and reused, styled exactly like the printed body so what we measure is
// what gets printed. Never mounted inside the editor or the preview.

import { toHtml, docFromBlocks, type DocBlock } from "./doc-model";
import { bodyBox, type BodyBox } from "./geometry";

export type Measured = {
  block: DocBlock;
  heightPx: number;
  splittable: boolean;
  /** Per-row heights for tables. */
  rows?: number[];
  /** Per-line heights for paragraphs, headings and lists. */
  lines?: number[];
};

/** Wait for fonts and images so measurements match what gets printed. */
export async function waitForPaperAssets(): Promise<void> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* ignore */
  }
  const imgs = Array.from(document.images).filter((i) => !i.complete);
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((res) => {
          img.addEventListener("load", () => res(), { once: true });
          img.addEventListener("error", () => res(), { once: true });
          setTimeout(res, 1500);
        }),
    ),
  );
}

let host: HTMLDivElement | null = null;

function getHost(widthPx: number): HTMLDivElement {
  if (!host || !host.isConnected) {
    host = document.createElement("div");
    host.setAttribute("data-doc-measure-host", "true");
    host.className = "doc-rich";
    document.body.appendChild(host);
  }
  host.style.cssText =
    `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;` +
    `width:${widthPx}px;font-size:12.5px;line-height:1.7;overflow-wrap:anywhere;`;
  host.className = "doc-rich";
  return host;
}

/** Heights of each visual line inside an element, via client rects. */
function lineHeights(el: Element): number[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0.5);
  range.detach?.();
  if (rects.length === 0) return [el.getBoundingClientRect().height];
  // Group rects that share a baseline band into one line.
  const lines: number[] = [];
  let top = rects[0]!.top;
  let height = rects[0]!.height;
  for (const r of rects.slice(1)) {
    if (Math.abs(r.top - top) < 2) {
      height = Math.max(height, r.height);
    } else {
      lines.push(height);
      top = r.top;
      height = r.height;
    }
  }
  lines.push(height);
  return lines;
}

function outerHeight(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  return el.getBoundingClientRect().height + parseFloat(cs.marginTop || "0") + parseFloat(cs.marginBottom || "0");
}

let fontsHooked = false;
const fontListeners = new Set<() => void>();

/** Re-run a callback when fonts finish loading (a second, accurate pass). */
export function onFontsReady(cb: () => void): () => void {
  fontListeners.add(cb);
  if (!fontsHooked) {
    fontsHooked = true;
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready
      .then(() => { for (const l of fontListeners) l(); })
      .catch(() => { /* ignore */ });
  }
  return () => fontListeners.delete(cb);
}

/** Measure every block against the printed body width. */
export async function measureBlocks(blocks: DocBlock[], box?: BodyBox): Promise<Measured[]> {
  const width = (box ?? bodyBox({ headerPx: 0, footerPx: 0, qrPx: 0 })).widthPx;
  await waitForPaperAssets();

  const el = getHost(width);
  el.innerHTML = toHtml(docFromBlocks(blocks));
  const children = Array.from(el.children) as HTMLElement[];

  const out: Measured[] = blocks.map((block, i) => {
    const node = children[i];
    if (!node) return { block, heightPx: 0, splittable: false };
    const heightPx = outerHeight(node);

    if (block.type === "pageBreak") return { block, heightPx: 0, splittable: false };
    if (block.type === "image") return { block, heightPx, splittable: false };

    if (block.type === "table") {
      const rows = Array.from(node.querySelectorAll("tr")).map((r) => r.getBoundingClientRect().height);
      return { block, heightPx, splittable: rows.length > 1, rows };
    }

    if (block.type === "list") {
      const lines = Array.from(node.children).map((li) => outerHeight(li as HTMLElement));
      return { block, heightPx, splittable: lines.length > 1, lines };
    }

    const lines = lineHeights(node);
    return { block, heightPx, splittable: lines.length > 1, lines };
  });

  el.innerHTML = "";
  return out;
}
