// One-way converter: legacy block documents → Word-style HTML body.
// Runs the first time an old document is opened in the new editor; the
// original blocks stay on the row as a backup.

import { esc, buildItemsTableHtml, mergeItemsData, type RichCtx } from "./rich";
import type { DocModel } from "./model";
import { PAPER, type DocLang, type DocTheme } from "./types";

const nl2p = (text: string, style = ""): string =>
  (text ?? "")
    .split(/\n{2,}/)
    .map((para) => `<p${style ? ` style="${style}"` : ""}>${esc(para).replace(/\n/g, "<br/>") || "<br/>"}</p>`)
    .join("");

export function blocksToHtml(model: DocModel, ctx: RichCtx): string {
  const ar = ctx.lang === "ar";
  const c = PAPER[ctx.theme];
  const out: string[] = [];

  for (const block of (model.blocks ?? []) as LegacyBlock[]) {
    out.push(blockToHtml(block, ar, c, ctx));
  }
  const html = out.filter(Boolean).join("");
  return html || "<p><br/></p>";
}

type Palette = { surface: string; border: string; muted: string; zebra: string };

/** Legacy blocks are read loosely — their types no longer exist in the model. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyBlock = any;

function blockToHtml(block: LegacyBlock, ar: boolean, c: Palette, ctx: RichCtx): string {
  switch (block.kind) {
    case "heading": {
      const t = ar ? block.ar : block.en;
      return t ? `<h2>${esc(t)}</h2>` : "";
    }
    case "text": {
      const t = ar ? block.ar : block.en;
      return t ? nl2p(t) : "";
    }
    case "spacer":
      return `<p style="margin:0"><br/></p>`;
    case "pagebreak":
      return `<div data-page-break="true"></div>`;
    case "terms": {
      const t = ar ? block.ar : block.en;
      const title = ar ? block.titleAr : block.titleEn;
      if (!t && !title) return "";
      return `${title ? `<h3>${esc(title)}</h3>` : ""}${t ? nl2p(t, "font-size:11px") : ""}`;
    }
    case "keyvalue": {
      const rows = ((block.rows ?? []) as LegacyBlock[]).filter((r) => (ar ? r.kAr || r.vAr : r.kEn || r.vEn));
      if (rows.length === 0) return "";
      const title = ar ? block.titleAr : block.titleEn;
      const body = rows
        .map(
          (r) =>
            `<tr><td style="border:1px solid ${c.border};padding:5px 8px;color:${c.muted};width:35%">${esc(ar ? r.kAr : r.kEn)}</td>` +
            `<td style="border:1px solid ${c.border};padding:5px 8px;font-weight:600">${esc(ar ? r.vAr : r.vEn)}</td></tr>`,
        )
        .join("");
      return `${title ? `<h3>${esc(title)}</h3>` : ""}<table style="width:100%;border-collapse:collapse;font-size:11.5px"><tbody>${body}</tbody></table>`;
    }
    case "table": {
      const head = (ar ? block.headAr : block.headEn) ?? [];
      if ((block.rows ?? []).length === 0) return "";
      const title = ar ? block.titleAr : block.titleEn;
      const th = (head as string[])
        .map((h: string) => `<th style="border:1px solid ${c.border};padding:6px 8px;background:${c.surface};text-align:inherit">${esc(h)}</th>`)
        .join("");
      const body = (block.rows as LegacyBlock[])
        .map((r: LegacyBlock, i: number) => {
          const cells = (ar ? r.cellsAr : r.cellsEn) ?? [];
          return (
            `<tr${i % 2 ? ` style="background:${c.zebra}"` : ""}>` +
            (head as string[]).map((_: string, ci: number) => `<td style="border:1px solid ${c.border};padding:6px 8px">${esc(cells[ci] ?? "")}</td>`).join("") +
            "</tr>"
          );
        })
        .join("");
      return `${title ? `<h3>${esc(title)}</h3>` : ""}<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
    }
    case "items": {
      const { id: _id, kind: _kind, startIndex: _si, ...data } = block;
      void _id; void _kind; void _si;
      return buildItemsTableHtml(mergeItemsData(data), ctx);
    }
    default:
      return "";
  }
}

export function needsConversion(model: DocModel): boolean {
  return !model.html || model.html.trim() === "";
}

export function legacyLang(lang: DocLang): DocLang {
  return lang;
}

export function legacyTheme(theme: DocTheme): DocTheme {
  return theme;
}
