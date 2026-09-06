// High-fidelity .docx -> HTML converter.
//
// mammoth deliberately throws formatting away (it targets "clean" semantic
// HTML). For imported business documents we want the opposite: the admin's
// Word design — colours, fonts, sizes, alignment, spacing, table borders and
// shading — has to survive into our A4 sheet and stay editable.
//
// So we read the OOXML ourselves: unzip the package, walk word/document.xml
// and resolve every property against word/styles.xml (docDefaults + style
// chain + direct formatting), then emit HTML with inline styles.

import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/* ── unit helpers ─────────────────────────────────────────────── */
const twipsToPt = (t: number) => Math.round((t / 20) * 100) / 100;
const emuToPx = (e: number) => Math.round(e / 9525);
const halfPtToPt = (h: number) => Math.round((h / 2) * 10) / 10;

const HIGHLIGHTS: Record<string, string> = {
  yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff",
  blue: "#0000ff", red: "#ff0000", darkBlue: "#000080", darkCyan: "#008080",
  darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── tiny XML helpers (namespace-safe via localName) ──────────── */
function kids(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === name);
}
function kid(el: Element | null | undefined, ...path: string[]): Element | null {
  let cur: Element | null = el ?? null;
  for (const p of path) {
    if (!cur) return null;
    cur = kids(cur, p)[0] ?? null;
  }
  return cur;
}
function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`) ?? el.getAttribute(name);
}
/** w:b / w:i style on-off elements: present means true unless val="0"/"false". */
function onOff(el: Element | null | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = attr(el, "val");
  if (v === null) return true;
  return !/^(0|false|off)$/i.test(v);
}

/* ── property bags ────────────────────────────────────────────── */
type RunProps = {
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  color?: string; highlight?: string; shade?: string;
  font?: string; sizePt?: number; caps?: boolean; vertAlign?: string; rtl?: boolean;
};
type ParaProps = {
  align?: string; rtl?: boolean; indentLeft?: number; indentRight?: number; firstLine?: number;
  before?: number; after?: number; lineHeight?: string; shade?: string;
  outline?: number; styleId?: string; numId?: string; ilvl?: number;
  borderBottom?: string;
};

function mergeRun(base: RunProps, add: RunProps): RunProps {
  const out = { ...base };
  for (const [k, v] of Object.entries(add)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

function readRunProps(rPr: Element | null): RunProps {
  if (!rPr) return {};
  const p: RunProps = {};
  const b = onOff(kid(rPr, "b")); if (b !== undefined) p.bold = b;
  const i = onOff(kid(rPr, "i")); if (i !== undefined) p.italic = i;
  const st = onOff(kid(rPr, "strike")); if (st !== undefined) p.strike = st;
  const caps = onOff(kid(rPr, "caps")); if (caps !== undefined) p.caps = caps;
  const rtl = onOff(kid(rPr, "rtl")); if (rtl !== undefined) p.rtl = rtl;

  const u = kid(rPr, "u");
  if (u) p.underline = (attr(u, "val") ?? "single") !== "none";

  const color = attr(kid(rPr, "color"), "val");
  if (color && color !== "auto") p.color = `#${color}`;

  const hl = attr(kid(rPr, "highlight"), "val");
  if (hl && hl !== "none") p.highlight = HIGHLIGHTS[hl] ?? hl;

  const shdFill = attr(kid(rPr, "shd"), "fill");
  if (shdFill && shdFill !== "auto" && !/^F{6}$/i.test(shdFill)) p.shade = `#${shdFill}`;

  const fonts = kid(rPr, "rFonts");
  const face = attr(fonts, "ascii") || attr(fonts, "cs") || attr(fonts, "hAnsi");
  if (face) p.font = face;

  const sz = attr(kid(rPr, "sz"), "val") || attr(kid(rPr, "szCs"), "val");
  if (sz) p.sizePt = halfPtToPt(Number(sz));

  const va = attr(kid(rPr, "vertAlign"), "val");
  if (va && va !== "baseline") p.vertAlign = va;

  return p;
}

function readParaProps(pPr: Element | null): ParaProps {
  if (!pPr) return {};
  const p: ParaProps = {};
  p.styleId = attr(kid(pPr, "pStyle"), "val") ?? undefined;

  const jc = attr(kid(pPr, "jc"), "val");
  if (jc) p.align = jc === "both" ? "justify" : jc === "start" ? undefined : jc === "end" ? undefined : jc;

  const bidi = onOff(kid(pPr, "bidi"));
  if (bidi !== undefined) p.rtl = bidi;

  const ind = kid(pPr, "ind");
  if (ind) {
    const l = attr(ind, "left") ?? attr(ind, "start");
    const r = attr(ind, "right") ?? attr(ind, "end");
    const fl = attr(ind, "firstLine");
    const hang = attr(ind, "hanging");
    if (l) p.indentLeft = twipsToPt(Number(l));
    if (r) p.indentRight = twipsToPt(Number(r));
    if (fl) p.firstLine = twipsToPt(Number(fl));
    else if (hang) p.firstLine = -twipsToPt(Number(hang));
  }

  const sp = kid(pPr, "spacing");
  if (sp) {
    const before = attr(sp, "before"); const after = attr(sp, "after");
    const line = attr(sp, "line"); const rule = attr(sp, "lineRule");
    if (before) p.before = twipsToPt(Number(before));
    if (after) p.after = twipsToPt(Number(after));
    if (line) {
      p.lineHeight = rule === "exact" || rule === "atLeast"
        ? `${twipsToPt(Number(line))}pt`
        : String(Math.round((Number(line) / 240) * 100) / 100);
    }
  }

  const shd = attr(kid(pPr, "shd"), "fill");
  if (shd && shd !== "auto" && !/^F{6}$/i.test(shd)) p.shade = `#${shd}`;

  const outline = attr(kid(pPr, "outlineLvl"), "val");
  if (outline) p.outline = Number(outline);

  const numPr = kid(pPr, "numPr");
  if (numPr) {
    p.numId = attr(kid(numPr, "numId"), "val") ?? undefined;
    const lvl = attr(kid(numPr, "ilvl"), "val");
    p.ilvl = lvl ? Number(lvl) : 0;
  }

  const bottom = kid(pPr, "pBdr", "bottom");
  if (bottom && (attr(bottom, "val") ?? "none") !== "none") {
    const c = attr(bottom, "color");
    p.borderBottom = `${Math.max(1, Math.round(Number(attr(bottom, "sz") ?? 8) / 8))}px solid ${c && c !== "auto" ? `#${c}` : "rgba(128,128,128,.6)"}`;
  }

  return p;
}

/* ── style sheet resolution ───────────────────────────────────── */
type StyleDef = { id: string; name: string; basedOn?: string; rPr: RunProps; pPr: ParaProps };

class Styles {
  defaults: { rPr: RunProps; pPr: ParaProps } = { rPr: {}, pPr: {} };
  byId = new Map<string, StyleDef>();

  constructor(doc: Document | null) {
    if (!doc?.documentElement) return;
    const root = doc.documentElement;
    const dd = kid(root, "docDefaults");
    this.defaults = {
      rPr: readRunProps(kid(dd, "rPrDefault", "rPr")),
      pPr: readParaProps(kid(dd, "pPrDefault", "pPr")),
    };
    for (const s of kids(root, "style")) {
      const id = attr(s, "styleId");
      if (!id) continue;
      this.byId.set(id, {
        id,
        name: attr(kid(s, "name"), "val") ?? id,
        basedOn: attr(kid(s, "basedOn"), "val") ?? undefined,
        rPr: readRunProps(kid(s, "rPr")),
        pPr: readParaProps(kid(s, "pPr")),
      });
    }
  }

  chain(id?: string): StyleDef[] {
    const out: StyleDef[] = [];
    let cur = id ? this.byId.get(id) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.basedOn ? this.byId.get(cur.basedOn) : undefined;
    }
    return out;
  }

  runFor(styleId: string | undefined, direct: RunProps, charStyleId?: string): RunProps {
    let acc: RunProps = { ...this.defaults.rPr };
    for (const s of this.chain(styleId)) acc = mergeRun(acc, s.rPr);
    for (const s of this.chain(charStyleId)) acc = mergeRun(acc, s.rPr);
    return mergeRun(acc, direct);
  }

  paraFor(styleId: string | undefined, direct: ParaProps): ParaProps {
    let acc: ParaProps = { ...this.defaults.pPr };
    for (const s of this.chain(styleId)) acc = { ...acc, ...clean(s.pPr) };
    return { ...acc, ...clean(direct) };
  }

  nameOf(styleId?: string): string {
    return styleId ? (this.byId.get(styleId)?.name ?? styleId) : "";
  }
}

function clean<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/* ── CSS emitters ─────────────────────────────────────────────── */
function runCss(p: RunProps): string {
  const css: string[] = [];
  if (p.color) css.push(`color:${p.color}`);
  if (p.font) css.push(`font-family:'${p.font.replace(/'/g, "")}', 'Montserrat Arabic', Montserrat, sans-serif`);
  if (p.sizePt) css.push(`font-size:${p.sizePt}pt`);
  if (p.caps) css.push("text-transform:uppercase");
  if (p.vertAlign === "superscript") css.push("vertical-align:super;font-size:.72em");
  if (p.vertAlign === "subscript") css.push("vertical-align:sub;font-size:.72em");
  return css.join(";");
}

function paraCss(p: ParaProps): string {
  const css: string[] = [];
  if (p.align) css.push(`text-align:${p.align}`);
  if (p.rtl) css.push("direction:rtl");
  if (p.indentLeft) css.push(`padding-inline-start:${p.indentLeft}pt`);
  if (p.indentRight) css.push(`padding-inline-end:${p.indentRight}pt`);
  if (p.firstLine) css.push(`text-indent:${p.firstLine}pt`);
  if (p.before) css.push(`margin-top:${p.before}pt`);
  if (p.after !== undefined) css.push(`margin-bottom:${p.after}pt`);
  if (p.lineHeight) css.push(`line-height:${p.lineHeight}`);
  if (p.shade) css.push(`background-color:${p.shade}`);
  if (p.borderBottom) css.push(`border-bottom:${p.borderBottom}`);
  return css.join(";");
}

/* ── numbering ────────────────────────────────────────────────── */
class Numbering {
  private fmt = new Map<string, string>(); // `${numId}:${ilvl}` -> numFmt

  constructor(doc: Document | null) {
    if (!doc?.documentElement) return;
    const root = doc.documentElement;
    const abstractFmt = new Map<string, Map<number, string>>();
    for (const a of kids(root, "abstractNum")) {
      const id = attr(a, "abstractNumId");
      if (!id) continue;
      const levels = new Map<number, string>();
      for (const l of kids(a, "lvl")) {
        const ilvl = Number(attr(l, "ilvl") ?? 0);
        levels.set(ilvl, attr(kid(l, "numFmt"), "val") ?? "decimal");
      }
      abstractFmt.set(id, levels);
    }
    for (const n of kids(root, "num")) {
      const numId = attr(n, "numId");
      const aId = attr(kid(n, "abstractNumId"), "val");
      if (!numId || !aId) continue;
      const levels = abstractFmt.get(aId);
      if (!levels) continue;
      for (const [ilvl, f] of levels) this.fmt.set(`${numId}:${ilvl}`, f);
    }
  }

  isOrdered(numId: string, ilvl = 0): boolean {
    const f = this.fmt.get(`${numId}:${ilvl}`) ?? "decimal";
    return f !== "bullet" && f !== "none";
  }
}

/* ── image resolution ─────────────────────────────────────────── */
type Media = { rels: Map<string, string>; files: Map<string, string> };

/* ── main converter ───────────────────────────────────────────── */
export type OoxmlResult = { html: string; images: number; tables: number };

export async function docxToStyledHtml(
  arrayBuffer: ArrayBuffer,
  opts: { shrink: (dataUrl: string, contentType: string) => Promise<string>; maxImageWidth: number },
): Promise<OoxmlResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parser = new DOMParser();
  const readXml = async (path: string): Promise<Document | null> => {
    const f = zip.file(path);
    if (!f) return null;
    return parser.parseFromString(await f.async("string"), "application/xml");
  };

  const docXml = await readXml("word/document.xml");
  if (!docXml?.documentElement) throw new Error("document.xml missing");
  const styles = new Styles(await readXml("word/styles.xml"));
  const numbering = new Numbering(await readXml("word/numbering.xml"));

  // relationship id -> media path, and media path -> data URL
  const relsXml = await readXml("word/_rels/document.xml.rels");
  const media: Media = { rels: new Map(), files: new Map() };
  if (relsXml?.documentElement) {
    for (const r of Array.from(relsXml.documentElement.children)) {
      const id = r.getAttribute("Id");
      const target = r.getAttribute("Target");
      if (id && target && /media\//i.test(target)) media.rels.set(id, target.replace(/^\.?\//, ""));
    }
  }
  const mediaUrl = async (relId: string): Promise<string | null> => {
    const target = media.rels.get(relId);
    if (!target) return null;
    if (media.files.has(target)) return media.files.get(target)!;
    const path = target.startsWith("word/") ? target : `word/${target}`;
    const f = zip.file(path) ?? zip.file(target);
    if (!f) return null;
    const ext = (target.split(".").pop() ?? "png").toLowerCase();
    const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
    const base64 = await f.async("base64");
    const url = await opts.shrink(`data:${type};base64,${base64}`, type);
    media.files.set(target, url);
    return url;
  };

  let images = 0;
  let tables = 0;

  /* runs */
  const renderRun = async (r: Element, paraStyleId?: string): Promise<string> => {
    const rPr = kid(r, "rPr");
    const charStyle = attr(kid(rPr, "rStyle"), "val") ?? undefined;
    const props = styles.runFor(paraStyleId, readRunProps(rPr), charStyle);

    let inner = "";
    for (const node of Array.from(r.children)) {
      switch (node.localName) {
        case "t":
          inner += esc(node.textContent ?? "");
          break;
        case "tab":
          inner += "<span style=\"display:inline-block;width:36pt\"></span>";
          break;
        case "br":
          inner += attr(node, "type") === "page" ? "\u0000PAGEBREAK\u0000" : "<br>";
          break;
        case "drawing":
        case "pict": {
          const html = await renderDrawing(node);
          if (html) { inner += html; images += 1; }
          break;
        }
        case "sym":
          inner += esc(String.fromCharCode(parseInt(attr(node, "char") ?? "0", 16) & 0xff));
          break;
        default:
          break;
      }
    }
    if (!inner) return "";

    // Highlights must be <mark> so the editor's highlight mark keeps them.
    const hl = props.highlight ?? props.shade;
    if (hl) inner = `<mark style="background-color:${hl}">${inner}</mark>`;
    if (props.bold) inner = `<strong>${inner}</strong>`;
    if (props.italic) inner = `<em>${inner}</em>`;
    if (props.underline) inner = `<u>${inner}</u>`;
    if (props.strike) inner = `<s>${inner}</s>`;
    const css = runCss(props);
    return css ? `<span style="${css}">${inner}</span>` : inner;
  };

  const renderDrawing = async (node: Element): Promise<string> => {
    // <a:blip r:embed="rIdN"> anywhere below, plus wp:extent for the size.
    const blip = node.getElementsByTagName("*");
    let relId: string | null = null;
    let widthPx = 0;
    for (const el of Array.from(blip)) {
      if (el.localName === "blip") {
        relId = el.getAttribute("r:embed") ?? el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
      }
      if (el.localName === "extent") {
        const cx = Number(el.getAttribute("cx") ?? 0);
        if (cx) widthPx = emuToPx(cx);
      }
      if (el.localName === "imagedata") {
        relId = el.getAttribute("r:id") ?? el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      }
    }
    if (!relId) return "";
    const url = await mediaUrl(relId);
    if (!url) return "";
    const w = widthPx ? Math.min(widthPx, opts.maxImageWidth) : 0;
    const style = w ? `width:${w}px;max-width:100%;height:auto` : `max-width:100%;height:auto`;
    return `<img src="${url}" style="${style}">`;
  };

  /* paragraphs */
  const renderParagraph = async (p: Element): Promise<{ html: string; props: ParaProps; empty: boolean }> => {
    const pPr = kid(p, "pPr");
    const direct = readParaProps(pPr);
    const props = styles.paraFor(direct.styleId, direct);

    let inner = "";
    for (const child of Array.from(p.children)) {
      if (child.localName === "r") inner += await renderRun(child, direct.styleId);
      else if (child.localName === "hyperlink") {
        let sub = "";
        for (const r of kids(child, "r")) sub += await renderRun(r, direct.styleId);
        if (sub) inner += `<a href="#">${sub}</a>`;
      } else if (child.localName === "ins") {
        for (const r of kids(child, "r")) inner += await renderRun(r, direct.styleId);
      }
    }

    const text = inner.replace(/<[^>]+>/g, "").replace(/\u00a0/g, " ").trim();
    const hasMedia = /<img /.test(inner);
    const empty = !text && !hasMedia && !inner.includes("\u0000PAGEBREAK\u0000");

    const name = styles.nameOf(direct.styleId).toLowerCase();
    const level =
      /^heading\s*1$/.test(name) || name === "title" ? 1 :
      /^heading\s*2$/.test(name) || name === "subtitle" ? 2 :
      /^heading\s*3$/.test(name) ? 3 :
      props.outline !== undefined && props.outline <= 2 ? props.outline + 1 : 0;

    const tag = level ? `h${level}` : "p";
    const css = paraCss(props);
    const dir = props.rtl ? ' dir="rtl"' : "";
    const html = `<${tag}${css ? ` style="${css}"` : ""}${dir}>${inner || "<br>"}</${tag}>`;
    return { html, props, empty };
  };

  /* tables */
  const cellCss = (tcPr: Element | null): string => {
    const css: string[] = ["padding:4pt 6pt", "vertical-align:top"];
    const fill = attr(kid(tcPr, "shd"), "fill");
    if (fill && fill !== "auto") css.push(`background-color:#${fill}`);
    const va = attr(kid(tcPr, "vAlign"), "val");
    if (va) css.push(`vertical-align:${va === "center" ? "middle" : va}`);
    const borders = kid(tcPr, "tcBorders");
    const side = (n: string, prop: string) => {
      const b = kid(borders, n);
      if (!b) return;
      const val = attr(b, "val") ?? "single";
      if (val === "none" || val === "nil") { css.push(`${prop}:none`); return; }
      const c = attr(b, "color");
      const sz = Math.max(1, Math.round(Number(attr(b, "sz") ?? 4) / 8));
      css.push(`${prop}:${sz}px solid ${c && c !== "auto" ? `#${c}` : "rgba(128,128,128,.5)"}`);
    };
    side("top", "border-top"); side("bottom", "border-bottom");
    side("left", "border-left"); side("right", "border-right");
    if (!borders) css.push("border:1px solid rgba(128,128,128,.45)");
    return css.join(";");
  };

  const renderTable = async (tbl: Element): Promise<string> => {
    tables += 1;
    const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => Number(attr(g, "w") ?? 0));
    const total = grid.reduce((a, b) => a + b, 0);
    const colgroup = total > 0
      ? `<colgroup>${grid.map((w) => `<col style="width:${Math.round((w / total) * 1000) / 10}%">`).join("")}</colgroup>`
      : "";

    const rowsXml = kids(tbl, "tr");
    // vertical merges: a "continue" cell folds into the "restart" cell above.
    const rowsCells: { html: string; restart: boolean; cont: boolean; col: number }[][] = [];

    for (const tr of rowsXml) {
      const cells: { html: string; restart: boolean; cont: boolean; col: number }[] = [];
      let col = 0;
      for (const tc of kids(tr, "tc")) {
        const tcPr = kid(tc, "tcPr");
        const span = Number(attr(kid(tcPr, "gridSpan"), "val") ?? 1);
        const vMerge = kid(tcPr, "vMerge");
        const cont = !!vMerge && (attr(vMerge, "val") ?? "continue") === "continue";
        let inner = "";
        for (const node of Array.from(tc.children)) {
          if (node.localName === "p") { const r = await renderParagraph(node); inner += r.html; }
          else if (node.localName === "tbl") inner += await renderTable(node);
        }
        const css = cellCss(tcPr);
        const spanAttr = span > 1 ? ` colspan="${span}"` : "";
        cells.push({
          html: `<td style="${css}"${spanAttr}%ROWSPAN%>${inner || "<p><br></p>"}</td>`,
          restart: !!vMerge && !cont,
          cont,
          col,
        });
        col += span;
      }
      rowsCells.push(cells);
    }

    const rowspans = new Map<string, number>();
    rowsCells.forEach((cells, ri) => {
      cells.forEach((c) => {
        if (!c.restart) return;
        let n = 1;
        for (let k = ri + 1; k < rowsCells.length; k++) {
          const below = rowsCells[k].find((x) => x.col === c.col && x.cont);
          if (!below) break;
          n += 1;
        }
        if (n > 1) rowspans.set(`${ri}:${c.col}`, n);
      });
    });

    const body = rowsCells.map((cells, ri) =>
      `<tr>${cells
        .filter((c) => !c.cont)
        .map((c) => {
          const n = rowspans.get(`${ri}:${c.col}`);
          return c.html.replace("%ROWSPAN%", n ? ` rowspan="${n}"` : "");
        })
        .join("")}</tr>`,
    ).join("");

    return `<table style="width:100%;border-collapse:collapse;table-layout:fixed">${colgroup}<tbody>${body}</tbody></table>`;
  };

  /* body walk with list grouping */
  const body = kid(docXml.documentElement, "body");
  if (!body) throw new Error("empty document body");

  const out: string[] = [];
  type ListState = { tag: "ul" | "ol"; numId: string; items: string[] } | null;
  let list: ListState = null;
  const flush = () => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`);
    list = null;
  };

  for (const node of Array.from(body.children)) {
    if (node.localName === "tbl") { flush(); out.push(await renderTable(node)); continue; }
    if (node.localName !== "p") continue;

    const { html, props, empty } = await renderParagraph(node);
    const withBreaks = html.split("\u0000PAGEBREAK\u0000");

    if (props.numId) {
      const tag = numbering.isOrdered(props.numId, props.ilvl ?? 0) ? "ol" : "ul";
      if (!list || list.tag !== tag || list.numId !== props.numId) { flush(); list = { tag, numId: props.numId, items: [] }; }
      list.items.push(`<li>${withBreaks.join("")}</li>`);
      continue;
    }

    flush();
    if (empty && withBreaks.length === 1) { out.push("<p><br></p>"); continue; }
    withBreaks.forEach((chunk, i) => {
      if (i > 0) out.push('<div data-page-break="true"></div>');
      if (chunk) out.push(chunk);
    });
  }
  flush();

  // Collapse runs of blank paragraphs left over from Word spacing tricks.
  const html = out.join("").replace(/(<p><br><\/p>){3,}/g, "<p><br></p><p><br></p>");
  return { html, images, tables };
}
