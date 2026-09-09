// Renders a business document on the branded letterhead. Pagination has been
// removed for the editor rebuild: the body is drawn as one continuous, elastic
// sheet. Header and footer are drawn once, around the whole body.

import { useEffect, useMemo, useState } from "react";
import { DocPaper } from "./DocPaper";
import { DocRichBody } from "./DocRichBody";
import { resolveDocHtml } from "@/lib/docs/rich";
import { A4_SIZE, type DocPage } from "@/lib/docs/geometry";
import { waitForPaperAssets } from "@/lib/docs/measure";
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

/** Resolve the document body. Returns a single continuous "page". */
export async function paginateDocument(input: PaginatedDocInput): Promise<DocPage[]> {
  await waitForPaperAssets();
  const html = resolveDocHtml(input.model.html ?? "", {
    lang: input.lang,
    theme: input.theme,
    currency: input.currency,
    meta: input.meta ?? {},
  });
  return [{ showClientBox: !!input.model.showClientBox, html }];
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
            sizing="grow"
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

  if (!pages) return null;

  void labels;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <DocPages input={input} pages={pages} bare={bare} />
    </div>
  );
}
