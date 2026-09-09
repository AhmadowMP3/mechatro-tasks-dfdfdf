// Renders a business document on the branded letterhead, page by page, from
// the page model the editor already computed. This file never decides where a
// page ends: it only lays out the pages it is given. When a document is opened
// without a cached model (import preview, a doc not edited this session) the
// model is computed once through the very same Phase 3 modules.

import { useEffect, useMemo, useRef, useState } from "react";
import { DocPaper } from "./DocPaper";
import { DocRichBody } from "./DocRichBody";
import { resolveDocHtml } from "@/lib/docs/rich";
import { A4_SIZE, HEADER_GAP_PX, FOOTER_GAP_PX, type DocPage, type PageChrome } from "@/lib/docs/geometry";
import { waitForPaperAssets } from "@/lib/docs/measure";
import {
  blocksFromHtml,
  getPageModel,
  pageModelKey,
  ESTIMATED_CHROME,
  ESTIMATED_CLIENT_CARD_PX,
  type DocPageModel,
} from "@/lib/docs/page-model-cache";
import type { DocClient, DocModel } from "@/lib/docs/model";
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

/** Top-level elements of a body, in document order. */
function topLevelHtml(html: string): string[] {
  if (typeof DOMParser === "undefined") return html ? [html] : [];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return Array.from(doc.body.children).map((el) => el.outerHTML);
}

/** Slice the resolved body across the pages the model decided. */
function splitByPages(nodes: string[], starts: number[], showClientBox: boolean): DocPage[] {
  if (starts.length === 0) return [{ showClientBox, html: nodes.join("") }];

  // A page always opens on a whole node, and never before the previous one.
  const bounded: number[] = [];
  starts.forEach((start, i) => {
    if (i === 0) { bounded.push(0); return; }
    const prev = bounded[i - 1]!;
    const value = start < 0 ? prev : start;
    bounded.push(Math.min(nodes.length, Math.max(prev, value)));
  });

  return bounded.map((start, i) => {
    const end = i + 1 < bounded.length ? bounded[i + 1]! : nodes.length;
    return { showClientBox: i === 0 && showClientBox, html: nodes.slice(start, end).join("") };
  });
}

/** Resolve the body and lay it out on the pages of `pageModel`. */
export async function paginateDocument(
  input: PaginatedDocInput,
  pageModel?: DocPageModel | null,
  chrome?: PageChrome,
): Promise<DocPage[]> {
  await waitForPaperAssets();
  const html = resolveDocHtml(input.model.html ?? "", {
    lang: input.lang,
    theme: input.theme,
    currency: input.currency,
    meta: input.meta ?? {},
  });
  const nodes = topLevelHtml(html);
  const showClientBox = !!input.model.showClientBox;

  let model = pageModel ?? null;
  if (!model) {
    const usedChrome = chrome ?? ESTIMATED_CHROME;
    const reservePx = showClientBox ? ESTIMATED_CLIENT_CARD_PX : 0;
    const { blocks, nodeOfBlock } = blocksFromHtml(html);
    const key = pageModelKey([html, usedChrome, input.header, input.model.section ?? null, reservePx]);
    try {
      model = await getPageModel(key, {
        blocks,
        nodeOfBlock,
        chrome: usedChrome,
        header: input.header,
        section: input.model.section,
        reservePx,
      });
    } catch {
      model = null;
    }
  }

  if (!model) return [{ showClientBox, html }];
  return splitByPages(nodes, model.pageStartNodes, showClientBox);
}

/** Render already-resolved body chunks (pure — safe for the print iframe). */
export function DocPages({
  input, pages, bare = false, pageStyle, pageIndexOffset = 0, totalPages,
}: {
  input: PaginatedDocInput;
  pages: DocPage[];
  bare?: boolean;
  pageStyle?: React.CSSProperties;
  pageIndexOffset?: number;
  totalPages?: number;
}) {
  const total = totalPages ?? pages.length;
  return (
    <>
      {pages.map((p, i) => (
        <div
          key={i}
          className="doc-page"
          style={{ width: A4_SIZE.width, ...pageStyle }}
        >
          <DocPaper
            header={input.header}
            section={input.model.section}
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

/** Live document preview on the branded sheet. */
export function PaginatedDoc({
  input, pageModel = null, bare = false, gap = 18, labels = false, onPages,
}: {
  input: PaginatedDocInput;
  /** The model the editor computed. When absent it is computed once here. */
  pageModel?: DocPageModel | null;
  bare?: boolean;
  gap?: number;
  labels?: boolean;
  onPages?: (n: number) => void;
}) {
  const [pages, setPages] = useState<DocPage[] | null>(null);
  const [chrome, setChrome] = useState<PageChrome | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const signature = useMemo(
    () => JSON.stringify([input.model, input.client, input.lang, input.theme, input.currency, input.header, input.footer, input.meta, pageModel?.pageStartNodes, chrome]),
    [input.model, input.client, input.lang, input.theme, input.currency, input.header, input.footer, input.meta, pageModel, chrome],
  );

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void paginateDocument(input, pageModel, chrome ?? undefined)
        .then((p) => { if (alive) { setPages(p); onPages?.(p.length); } })
        .catch(() => { if (alive) { setPages(null); onPages?.(1); } });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Without a model from the editor we measure the real letterhead once, so
  // the computed pages use the same chrome heights the editor would have used.
  useEffect(() => {
    if (pageModel || !pages || chrome) return;
    const host = hostRef.current;
    const sheet = host?.querySelector(".doc-page") as HTMLElement | null;
    const body = sheet?.querySelector("[data-doc-body-content]") as HTMLElement | null;
    if (!sheet || !body) return;
    const s = sheet.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const next: PageChrome = {
      headerPx: Math.max(0, b.top - s.top - HEADER_GAP_PX),
      footerPx: Math.max(0, s.bottom - b.bottom - FOOTER_GAP_PX),
      qrPx: 0,
    };
    if (Math.abs(next.headerPx - ESTIMATED_CHROME.headerPx) < 0.5 && Math.abs(next.footerPx - ESTIMATED_CHROME.footerPx) < 0.5) return;
    setChrome(next);
  }, [pages, pageModel, chrome]);

  if (!pages) return null;

  void labels;
  return (
    <div ref={hostRef} style={{ display: "flex", flexDirection: "column", gap }}>
      <DocPages input={input} pages={pages} bare={bare} />
    </div>
  );
}
