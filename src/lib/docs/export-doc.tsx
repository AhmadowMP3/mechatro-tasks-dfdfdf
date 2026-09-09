// Exporter for business documents: PDF via the browser print engine
// (perfect Arabic shaping, exact A4 layout).

import { DocPages, paginateDocument, type PaginatedDocInput } from "@/components/documents/PaginatedDoc";
import { printReactDocument } from "@/lib/pdf/print-document";
import { PAPER, docTypeLabel, type DocFooter, type DocHeader, type DocLang, type DocTheme, type DocType } from "./types";
import type { DocPageModel } from "./page-model-cache";
import type { DocClient, DocModel } from "./model";

export type DocRenderInput = {
  header: DocHeader;
  footer: DocFooter;
  model: DocModel;
  client: DocClient;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  meta: { number: string; date: string; validUntil?: string; client?: string };
  title: string;
  /** The page model the editor computed — the PDF uses it as-is. */
  pageModel?: DocPageModel | null;
};


export type ExportDocInput = DocRenderInput & { docType: DocType; number: string; docId?: string };

function filenameFor(input: ExportDocInput): string {
  const label = docTypeLabel(input.docType, "en").replace(/[^A-Za-z0-9]+/g, "-");
  const num = (input.number || "doc").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${label}-${num}`;
}

function paginatedInput(input: ExportDocInput): PaginatedDocInput {
  return {
    header: input.header,
    footer: input.footer,
    model: input.model,
    client: input.client,
    lang: input.lang,
    theme: input.theme,
    currency: input.currency,
    meta: input.meta,
  };
}

export async function exportDocPdf(input: ExportDocInput): Promise<void> {
  const palette = PAPER[input.theme];
  const paged = paginatedInput(input);
  const pages = await paginateDocument(paged, input.pageModel ?? null);


  await printReactDocument(
    <DocPages input={paged} pages={pages} bare />,
    {
      title: filenameFor(input),
      lang: input.lang,
      background: palette.bg,
      color: palette.ink,
      share: {
        kind: "business_doc",
        refId: input.docId ?? `${input.docType}:${input.number}`,
        title: `${docTypeLabel(input.docType, input.lang)} ${input.number}`,
      },
    },
  );
}
