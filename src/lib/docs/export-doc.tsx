// Exporters for business documents: PDF (browser print engine → perfect
// Arabic shaping) and Word (.doc, same layout, fully editable).

import { DocPages, paginateDocument, type PaginatedDocInput } from "@/components/documents/PaginatedDoc";
import { printReactDocument } from "@/lib/pdf/print-document";
import { PAPER, docTypeLabel, type DocType } from "./types";
import { downloadDocWord, type DocRenderInput } from "./export-html";

export type ExportDocInput = DocRenderInput & { docType: DocType; number: string };

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
  const pages = await paginateDocument(paged);

  await printReactDocument(
    <DocPages input={paged} pages={pages} bare />,
    {
      title: filenameFor(input),
      lang: input.lang,
      background: palette.bg,
      color: palette.ink,
    },
  );
}

export async function exportDocWord(input: ExportDocInput): Promise<void> {
  const pages = await paginateDocument(paginatedInput(input));
  await downloadDocWord({ ...input, pages }, filenameFor(input));
}
