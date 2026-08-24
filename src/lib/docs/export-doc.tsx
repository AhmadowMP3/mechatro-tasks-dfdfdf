// Exporters for business documents: PDF (browser print engine → perfect
// Arabic shaping) and Word (.doc, same layout, fully editable).

import { DocPaper } from "@/components/documents/DocPaper";
import { DocBody } from "@/components/documents/DocBody";
import { printReactDocument } from "@/lib/pdf/print-document";
import { PAPER, docTypeLabel, type DocType } from "./types";
import { downloadDocWord, type DocRenderInput } from "./export-html";

export type ExportDocInput = DocRenderInput & { docType: DocType; number: string };

function filenameFor(input: ExportDocInput): string {
  const label = docTypeLabel(input.docType, "en").replace(/[^A-Za-z0-9]+/g, "-");
  const num = (input.number || "doc").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${label}-${num}`;
}

export async function exportDocPdf(input: ExportDocInput): Promise<void> {
  const palette = PAPER[input.theme];
  await printReactDocument(
    <DocPaper
      header={input.header}
      footer={input.footer}
      lang={input.lang}
      theme={input.theme}
      meta={input.meta}
      page={{ current: 1, total: 1 }}
      bare
    >
      <DocBody
        model={input.model}
        client={input.client}
        lang={input.lang}
        theme={input.theme}
        currency={input.currency}
      />
    </DocPaper>,
    {
      title: filenameFor(input),
      lang: input.lang,
      background: palette.bg,
      color: palette.ink,
    },
  );
}

export async function exportDocWord(input: ExportDocInput): Promise<void> {
  await downloadDocWord(input, filenameFor(input));
}
