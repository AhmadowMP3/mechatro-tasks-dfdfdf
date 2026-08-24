// Renders a Word-style (HTML) document body inside the A4 paper, plus the
// optional client card. Shared by the live preview, the PDF print pass and
// the Word exporter, so all three are pixel-identical.

import { sanitizeHtml } from "@/lib/security/sanitize";
import { resolveDocHtml, type RichCtx } from "@/lib/docs/rich";
import { DocClientCard } from "./DocBody";
import type { DocClient } from "@/lib/docs/model";
import type { DocLang, DocTheme } from "@/lib/docs/types";

type Props = {
  html: string;
  showClientBox: boolean;
  client: DocClient;
  lang: DocLang;
  theme: DocTheme;
  /** Already-resolved HTML (skips the field/items rebuild). */
  resolved?: boolean;
  ctx?: RichCtx;
};

export function DocRichBody({ html, showClientBox, client, lang, theme, resolved, ctx }: Props) {
  const out = resolved || !ctx ? html : resolveDocHtml(html, ctx);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {showClientBox && <DocClientCard client={client} lang={lang} theme={theme} />}
      <div className="doc-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(out) }} />
    </div>
  );
}
