// Renders a business document as real A4 pages: the header/footer bands and
// page numbers repeat on every page, and the body is distributed so nothing
// gets clipped. Shared by the editor preview and the PDF exporter, so the
// printed page count always equals the previewed page count.

import { useEffect, useMemo, useState } from "react";
import { DocPaper } from "./DocPaper";
import { DocBody, DocClientCard, DocUnit } from "./DocBody";
import { A4_SIZE, paginateModel, waitForPaperAssets, type DocPage } from "@/lib/docs/paginate";
import type { DocClient, DocModel, DocBlock } from "@/lib/docs/model";
import type { DocFooter, DocHeader, DocLang, DocTheme } from "@/lib/docs/types";

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
  return Math.max(200, A4_SIZE.height - chrome);
}

/** Compute the page split for a document (browser-only). */
export async function paginateDocument(input: PaginatedDocInput): Promise<DocPage[]> {
  await waitForPaperAssets();
  const bodyHeight = await measureBodyHeight(input);
  return paginateModel({
    model: input.model,
    lang: input.lang,
    theme: input.theme,
    currency: input.currency,
    bodyHeight,
    renderBlock: (block: DocBlock) => (
      <DocUnit block={block} lang={input.lang} theme={input.theme} currency={input.currency} />
    ),
    renderClientBox: () => <DocClientCard client={input.client} lang={input.lang} theme={input.theme} />,
  });
}

/** Render already-computed pages (pure — safe for the print iframe). */
export function DocPages({
  input, pages, bare = false, pageStyle,
}: { input: PaginatedDocInput; pages: DocPage[]; bare?: boolean; pageStyle?: React.CSSProperties }) {
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
            page={{ current: i + 1, total: pages.length }}
            sizing="fixed"
            bare={bare}
          >
            <DocBody
              model={{ ...input.model, showClientBox: p.showClientBox, blocks: p.blocks }}
              client={input.client}
              lang={input.lang}
              theme={input.theme}
              currency={input.currency}
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

  if (!pages) {
    return (
      <DocPaper
        header={input.header}
        footer={input.footer}
        lang={input.lang}
        theme={input.theme}
        meta={input.meta}
        page={{ current: 1, total: 1 }}
        bare={bare}
      >
        <DocBody model={input.model} client={input.client} lang={input.lang} theme={input.theme} currency={input.currency} />
      </DocPaper>
    );
  }

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
