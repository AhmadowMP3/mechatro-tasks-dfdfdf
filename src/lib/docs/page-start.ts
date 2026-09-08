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
  const path: HTMLElement[] = [];
  let node: HTMLElement | null = root;
  let painted: HTMLElement = root;
  let guard = 0;

  while (node && guard++ < 64) {
    path.push(node);
    const children = Array.from(node.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    if (!children.length) {
      painted = node;
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
    painted = next;
    node = next;
  }

  const before = painted.getBoundingClientRect().top;
  path.forEach(zeroStart);
  if (!path.includes(painted)) zeroStart(painted);
  const after = painted.getBoundingClientRect().top;
  return Math.max(0, before - after);
}
