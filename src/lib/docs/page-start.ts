// Shared page-start normalisation for imported Word HTML.
//
// A Word page can begin with nested wrappers, invisible bidi-only paragraphs,
// or source-page spacing. Preview and editor measurement must make exactly the
// same decision about what the first painted element is.

export const INVISIBLE_WORD_CHARS = /[\s\u00a0\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;

const MEDIA_SELECTOR = "img,table,hr,svg,canvas,input";
const SECTION_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN"]);

export function visibleWordText(el: Element): string {
  return (el.textContent ?? "").replace(INVISIBLE_WORD_CHARS, "");
}

export function isWordBlankBlock(el: Element | null): boolean {
  if (!el || el.hasAttribute?.("data-page-break")) return false;
  if (el.matches?.(MEDIA_SELECTOR) || el.querySelector(MEDIA_SELECTOR)) return false;
  return visibleWordText(el) === "";
}

function zeroStart(el: HTMLElement): void {
  el.style.setProperty("margin-top", "0", "important");
  el.style.setProperty("padding-top", "0", "important");
  el.style.setProperty("margin-block-start", "0", "important");
  el.style.setProperty("padding-block-start", "0", "important");
  if (SECTION_TAGS.has(el.tagName)) {
    el.style.setProperty("height", "auto", "important");
    el.style.setProperty("min-height", "0", "important");
    // A source section may vertically distribute its children over the old
    // Word page. Once our own letterhead owns the page, that distribution is
    // source chrome and must not push the first item down.
    el.style.setProperty("justify-content", "flex-start", "important");
    el.style.setProperty("align-content", "flex-start", "important");
  }
}

/**
 * Remove/hide every empty node on the leading branch, then make the first
 * painted branch begin at y=0. Returns its measured upward movement when the
 * caller supplies a rendered DOM tree.
 */
export function normaliseWordPageStart(root: HTMLElement, removeBlanks = true): number {
  // Locate the ink-bearing node before changing anything. This preserves the
  // real movement caused by deleting leading blank siblings; callers use that
  // delta to avoid adding the same empty space back into a page spacer.
  const findPainted = (start: HTMLElement): HTMLElement => {
    let current = start;
    let depth = 0;
    while (depth++ < 64) {
      const children: HTMLElement[] = Array.from(current.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      const next = children.find((child) => !isWordBlankBlock(child));
      if (!next) return current;
      current = next;
    }
    return current;
  };

  const painted = findPainted(root);
  const before = painted.getBoundingClientRect().top;
  const path: HTMLElement[] = [];
  let node: HTMLElement | null = root;
  let guard = 0;

  while (node && guard++ < 64) {
    path.push(node);
    const children: HTMLElement[] = Array.from(node.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    if (!children.length) {
      break;
    }

    let next: HTMLElement | null = null;
    for (const child of children) {
      if (isWordBlankBlock(child)) {
        if (removeBlanks) child.remove();
        else child.style.setProperty("display", "none", "important");
        continue;
      }
      next = child;
      break;
    }
    if (!next) break;
    node = next;
  }

  path.forEach(zeroStart);
  if (!path.includes(painted)) zeroStart(painted);
  const after = painted.getBoundingClientRect().top;
  return Math.max(0, before - after);
}

/** Remove empty leading rows/cells of a table that opens a page: Word keeps
 *  spacer rows that read as a blank band under our own letterhead. */
function trimLeadingEmptyRows(root: HTMLElement): void {
  const table = root.tagName === "TABLE" ? (root as HTMLTableElement) : root.querySelector("table");
  if (!table || table !== (root.tagName === "TABLE" ? table : root.firstElementChild)) {
    if (!table) return;
  }
  let guard = 0;
  while (guard++ < 8) {
    const row = table.querySelector("tr");
    if (!row) return;
    const painted = Array.from(row.cells ? row.cells : []).some(
      (cell) => visibleWordText(cell) !== "" || cell.querySelector(MEDIA_SELECTOR),
    );
    if (painted) return;
    row.remove();
  }
}

/**
 * Final guarantee: whatever the remaining cause (collapsed margins, cell
 * padding, wrapper borders), pull the first painted content of a page flush
 * with the top of the body box. Returns the removed gap in px.
 */
export function snapPageStart(container: HTMLElement): number {
  const first = Array.from(container.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (!first) return 0;

  trimLeadingEmptyRows(first);
  normaliseWordPageStart(container, true);

  const target = Array.from(container.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (!target) return 0;

  let painted: HTMLElement = target;
  let depth = 0;
  while (depth++ < 64) {
    const next = Array.from(painted.children).find(
      (child): child is HTMLElement => child instanceof HTMLElement && !isWordBlankBlock(child),
    );
    if (!next) break;
    painted = next;
  }

  const gap = painted.getBoundingClientRect().top - container.getBoundingClientRect().top;
  if (!Number.isFinite(gap) || gap <= 2 || gap > 600) return 0;

  const current = parseFloat(target.style.marginTop || "0") || 0;
  target.style.setProperty("margin-top", `${current - gap}px`, "important");
  return gap;
}
