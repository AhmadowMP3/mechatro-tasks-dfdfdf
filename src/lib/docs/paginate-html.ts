// DOM-based pagination for Word-style document bodies.
//
// The body is one HTML string. We lay it out off-screen at the exact paper
// body width / font metrics, then move top-level nodes into pages until the
// page is full. Overflowing tables are split row-wise (header repeated),
// lists item-wise and paragraphs word-wise, so nothing is ever clipped.
// Browser-only.

export const BODY_PAD_X = 40;
export const A4_HTML = { width: 794, height: 1123 } as const;

/** Body width for a given side padding (defaults to the legacy 40px inset). */
function bodyWidth(sidePadding?: number): number {
  const pad = Number.isFinite(sidePadding) && (sidePadding as number) >= 0 ? (sidePadding as number) : BODY_PAD_X;
  return Math.max(240, A4_HTML.width - pad * 2);
}

function hostStyle(lang: "ar" | "en", sidePadding?: number): string {
  return [
    "position:fixed",
    "top:0",
    "left:-10000px",
    `width:${bodyWidth(sidePadding)}px`,
    "visibility:hidden",
    "pointer-events:none",
    "contain:layout style",
    "height:auto",
    "font-size:12.5px",
    "line-height:1.7",
    `direction:${lang === "ar" ? "rtl" : "ltr"}`,
    `text-align:${lang === "ar" ? "right" : "left"}`,
    "font-family:'Montserrat Arabic','Almarai','Montserrat',system-ui,sans-serif",
  ].join(";");
}

const isBreak = (el: Element): boolean => el.hasAttribute?.("data-page-break");

/** A paragraph carrying nothing but a <br> or whitespace — Word leaves plenty
 *  of these behind and they would open a page with a blank line. */
function isEmptyBlock(el: Element | null): boolean {
  if (!el) return false;
  if (el.hasAttribute?.("data-page-break")) return false;
  if (el.querySelector("img,table,hr,svg,canvas,input")) return false;
  return (el.textContent ?? "").trim() === "";
}

/** Drop blank paragraphs from the start and the end of a page. */
function trimEdges(page: HTMLElement): void {
  while (isEmptyBlock(page.firstElementChild)) page.firstElementChild!.remove();
  while (isEmptyBlock(page.lastElementChild)) page.lastElementChild!.remove();
}

function height(el: HTMLElement): number {
  return Math.ceil(Math.max(el.getBoundingClientRect().height, el.scrollHeight));
}


/** Split a table: as many body rows as fit stay, the rest go to a clone. */
function splitTable(table: HTMLTableElement, page: HTMLElement, avail: number): HTMLElement | null {
  const bodies = Array.from(table.tBodies);
  const rows: HTMLTableRowElement[] = bodies.flatMap((b) => Array.from(b.rows));
  if (rows.length <= 1) return null;

  const rest = table.cloneNode(true) as HTMLTableElement;
  // Drop all body rows from the working copy, then add them back one by one.
  Array.from(table.tBodies).forEach((b) => { while (b.rows.length) b.deleteRow(0); });
  const target = table.tBodies[0] ?? table.createTBody();

  let placed = 0;
  for (const row of rows) {
    target.appendChild(row);
    if (height(page) > avail) {
      target.removeChild(row);
      break;
    }
    placed += 1;
  }
  if (placed === 0) return null;

  // Keep the remaining rows in the clone; strip the caption so a continued
  // table does not repeat its title.
  Array.from(rest.tBodies).forEach((b) => { while (b.rows.length) b.deleteRow(0); });
  const restBody = rest.tBodies[0] ?? rest.createTBody();
  rows.slice(placed).forEach((r) => restBody.appendChild(r));
  rest.querySelector("caption")?.remove();
  rest.setAttribute("data-continued", "true");
  return restBody.rows.length > 0 ? rest : null;
}

/** Split a list: keep the items that fit, move the rest to a clone. */
function splitList(list: HTMLElement, page: HTMLElement, avail: number): HTMLElement | null {
  const items = Array.from(list.children);
  if (items.length <= 1) return null;
  const rest = list.cloneNode(false) as HTMLElement;
  items.forEach((li) => li.remove());
  let placed = 0;
  for (const li of items) {
    list.appendChild(li);
    if (height(page) > avail) { list.removeChild(li); break; }
    placed += 1;
  }
  if (placed === 0) return null;
  items.slice(placed).forEach((li) => rest.appendChild(li));
  if (list.tagName === "OL") rest.setAttribute("start", String(placed + 1));
  return rest.children.length > 0 ? rest : null;
}

/** Split a text block word-wise. */
function splitText(el: HTMLElement, page: HTMLElement, avail: number): HTMLElement | null {
  const text = el.textContent ?? "";
  const words = text.split(/(\s+)/);
  if (words.length <= 3) return null;
  const rest = el.cloneNode(false) as HTMLElement;
  let lo = 1;
  let hi = words.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    el.textContent = words.slice(0, mid).join("");
    if (height(page) <= avail) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best === 0) { el.textContent = text; return null; }
  el.textContent = words.slice(0, best).join("");
  rest.textContent = words.slice(best).join("").trimStart();
  return (rest.textContent ?? "").trim() ? rest : null;
}

function splitNode(el: HTMLElement, page: HTMLElement, avail: number): HTMLElement | null {
  const tag = el.tagName;
  if (tag === "TABLE") return splitTable(el as HTMLTableElement, page, avail);
  if (tag === "UL" || tag === "OL") return splitList(el, page, avail);
  if (["P", "DIV", "BLOCKQUOTE", "PRE"].includes(tag) && el.children.length === 0) return splitText(el, page, avail);
  return null;
}

export type HtmlPage = { html: string; showClientBox: boolean };

/**
 * Distribute a body HTML string over A4 pages.
 * `clientBoxHtml` (optional) is placed at the top of the first page and is
 * measured together with the content.
 */
export function paginateHtmlBody(opts: {
  html: string;
  lang: "ar" | "en";
  bodyHeight: number;
  clientBoxHeight?: number;
  showClientBox?: boolean;
  /** Real side padding of the printed sheet, so measuring matches printing. */
  sidePadding?: number;
}): HtmlPage[] {
  const { html, lang, bodyHeight } = opts;
  const avail = Math.max(200, bodyHeight);

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = hostStyle(lang, opts.sidePadding);
  document.body.appendChild(host);

  const source = document.createElement("div");
  source.innerHTML = html ?? "";

  const page = document.createElement("div");
  // Measure with the same typography/spacing rules the sheet paints with.
  page.className = "doc-rich";
  host.appendChild(page);

  const pages: HtmlPage[] = [];
  let first = true;
  let reserve = opts.showClientBox ? Math.max(0, opts.clientBoxHeight ?? 0) + 14 : 0;

  const flush = () => {
    trimEdges(page);
    pages.push({ html: page.innerHTML, showClientBox: first && !!opts.showClientBox });
    first = false;
    reserve = 0;
    page.innerHTML = "";
  };


  try {
    const queue: HTMLElement[] = Array.from(source.children) as HTMLElement[];
    while (queue.length > 0) {
      const node = queue.shift()!;
      // Never open a page with a blank paragraph.
      if (page.childElementCount === 0 && isEmptyBlock(node)) continue;
      if (isBreak(node)) {
        if (page.childElementCount > 0 || first) flush();
        continue;
      }
      page.appendChild(node);
      if (height(page) <= avail - reserve) continue;

      // Overflow — try to split, otherwise push to a fresh page.
      const rest = splitNode(node, page, avail - reserve);
      if (rest) {
        queue.unshift(rest);
        flush();
        continue;
      }
      if (page.childElementCount > 1) {
        page.removeChild(node);
        queue.unshift(node);
        flush();
        continue;
      }
      // A single node taller than a whole page: try splitting on a clean page.
      const rest2 = splitNode(node, page, avail - reserve);
      if (rest2) queue.unshift(rest2);
      flush();
    }
    if (page.childElementCount > 0 || pages.length === 0) flush();
  } finally {
    host.remove();
  }

  return pages;
}
