// Renders a business document as real A4 pages: the header/footer bands and
// page numbers repeat on every page, and the body is distributed so nothing
// gets clipped. Shared by the editor preview and the PDF exporter, so the
// printed page count always equals the previewed page count.

import { useEffect, useMemo, useState } from "react";
import { DocPaper } from "./DocPaper";
import { DocClientCard } from "./DocBody";
import { DocRichBody } from "./DocRichBody";
import { paginateHtmlBody } from "@/lib/docs/paginate-html";
import { resolveDocHtml } from "@/lib/docs/rich";
import { A4_SIZE, waitForPaperAssets, type DocPage } from "@/lib/docs/paginate";
import { bodyHeightPx, bodyWidthPx } from "@/lib/docs/page-metrics";
import type { DocClient, DocModel } from "@/lib/docs/model";
import { pageMarginsPx, type DocFooter, type DocHeader, type DocLang, type DocTheme } from "@/lib/docs/types";


export type PaginatedDocInput = {
  header: DocHeader;
  footer: DocFooter;
  model: DocModel;
  client: DocClient;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  meta?: { number?: string; date?: string; validUntil?: string; client?: string };
};

/** Measure the header + footer chrome of one page, then compute the usable
 *  body height. Runs off-screen with the real components. */
export async function measureBodyHeight(input: PaginatedDocInput): Promise<number> {
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;top:0;left:-10000px;visibility:hidden;pointer-events:none";
  document.body.appendChild(host);
  const root = createRoot(host);
  let chrome = 260;
  try {
    flushSync(() => {
      root.render(
        <DocPaper
          header={input.header}
          footer={input.footer}
          lang={input.lang}
          theme={input.theme}
          meta={input.meta}
          logoVariant={input.model.logoVariant}
          page={{ current: 1, total: 1 }}
          sizing="auto"
          bare
        />,
      );
    });
    const h = host.firstElementChild?.getBoundingClientRect().height ?? 0;
    if (h > 0) chrome = Math.ceil(h);
  } finally {
    setTimeout(() => {
      try { root.unmount(); } catch { /* ignore */ }
      host.remove();
    }, 0);
  }
  // Small safety reserve: fonts settling a fraction later or Arabic line
  // height rounding must never push the last row past the sheet edge.
  return bodyHeightPx(chrome);

}

/** Measure the client card so the first page reserves the right space. */
async function measureClientBox(input: PaginatedDocInput): Promise<number> {
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;top:0;left:-10000px;visibility:hidden;pointer-events:none;width:${bodyWidthPx(input.header)}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  let h = 0;
  try {
    flushSync(() => {
      root.render(<DocClientCard client={input.client} lang={input.lang} theme={input.theme} />);
    });
    h = Math.ceil(host.firstElementChild?.getBoundingClientRect().height ?? 0);
  } finally {
    setTimeout(() => {
      try { root.unmount(); } catch { /* ignore */ }
      host.remove();
    }, 0);
  }
  return h;
}

/** Compute the page split for a document (browser-only). */
export async function paginateDocument(input: PaginatedDocInput): Promise<DocPage[]> {
  await waitForPaperAssets();
  const bodyHeight = await measureBodyHeight(input);

  // Word-style body: one HTML string, split by the DOM paginator.
  {
    const html = resolveDocHtml(input.model.html ?? "", {
      lang: input.lang,
      theme: input.theme,
      currency: input.currency,
      meta: input.meta ?? {},
    });
    const clientBoxHeight = input.model.showClientBox ? await measureClientBox(input) : 0;
    return paginateHtmlBody({
      html,
      lang: input.lang,
      bodyHeight,
      clientBoxHeight,
      showClientBox: input.model.showClientBox,
      sidePadding: pageMarginsPx(input.header).side,
    }).map((p) => ({ showClientBox: p.showClientBox, html: p.html }));
  }
}

/** Render already-computed pages (pure — safe for the print iframe). */
export function DocPages({
  input, pages, bare = false, pageStyle, pageIndexOffset = 0, totalPages,
}: {
  input: PaginatedDocInput;
  pages: DocPage[];
  bare?: boolean;
  pageStyle?: React.CSSProperties;
  /** Number of pages rendered before this batch (for correct numbering). */
  pageIndexOffset?: number;
  /** Total page count of the whole document (defaults to this batch's length). */
  totalPages?: number;
}) {
  const total = totalPages ?? pages.length;
  return (
    <>
      {pages.map((p, i) => (
        <div
          key={i}
          className="doc-page"
          style={{ width: A4_SIZE.width, height: A4_SIZE.height, overflow: "hidden", ...pageStyle }}
        >
          <DocPaper
            header={input.header}
            footer={input.footer}
            lang={input.lang}
            theme={input.theme}
            meta={input.meta}
            logoVariant={input.model.logoVariant}
            page={{ current: pageIndexOffset + i + 1, total }}
            sizing="fixed"
            bare={bare}
          >
            <DocRichBody
              html={p.html ?? ""}
              resolved
              showClientBox={p.showClientBox}
              client={input.client}
              lang={input.lang}
              theme={input.theme}
            />
          </DocPaper>
        </div>
      ))}
    </>
  );
}

/**
 * Live paginated preview. Falls back to a single elastic sheet until the
 * first measurement pass finishes (one frame), so nothing flashes empty.
 * `onPages` reports the page count back to the surrounding UI.
 */
export function PaginatedDoc({
  input, bare = false, gap = 18, labels = false, onPages,
}: { input: PaginatedDocInput; bare?: boolean; gap?: number; labels?: boolean; onPages?: (n: number) => void }) {
  const [pages, setPages] = useState<DocPage[] | null>(null);
  const signature = useMemo(
    () => JSON.stringify([input.model, input.client, input.lang, input.theme, input.currency, input.header, input.footer, input.meta]),
    [input.model, input.client, input.lang, input.theme, input.currency, input.header, input.footer, input.meta],
  );

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void paginateDocument(input)
        .then((p) => { if (alive) { setPages(p); onPages?.(p.length); } })
        .catch(() => { if (alive) { setPages(null); onPages?.(1); } });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Never paint raw, unpaginated Word HTML while the real page split is being
  // calculated. That temporary path bypassed page-start normalisation and was
  // the source of a visible large white band before the paginated view settled.
  if (!pages) return null;

  if (labels) {
    const ar = input.lang === "ar";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {pages.map((p, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", textAlign: ar ? "right" : "left" }}>
              {ar ? `صفحة ${i + 1} من ${pages.length}` : `Page ${i + 1} of ${pages.length}`}
            </div>
            <DocPages input={input} pages={[p]} bare={bare} pageIndexOffset={i} totalPages={pages.length} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <DocPages input={input} pages={pages} bare={bare} />
    </div>
  );
}
