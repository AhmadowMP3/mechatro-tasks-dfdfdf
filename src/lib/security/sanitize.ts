import DOMPurify from "dompurify";
import { z } from "zod";

/**
 * Central input-safety helpers.
 *
 * Everything a user can type goes through one of these before it is stored,
 * sent to an AI model, rendered as HTML, or written into a spreadsheet.
 */

// DOMPurify needs a real DOM. The app also renders on the server (Cloudflare
// Workers), where no DOM exists, so every DOM-backed call is gated behind this
// check and falls back to a DOM-free implementation.
const HAS_DOM = typeof window !== "undefined" && typeof window.document !== "undefined";

// Control chars (except \n and \t) + zero-width / bidi override characters.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/** Remove every tag (and the content of dangerous ones) without needing a DOM. */
function stripTags(input: string): string {
  return input
    .replace(/<\s*(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|template|noscript)\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "");
}

/** Strip HTML tags, control/invisible characters and collapse whitespace. */
export function sanitizeText(value: unknown, opts?: { maxLength?: number; multiline?: boolean }): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  s = s.replace(CONTROL_RE, "").replace(INVISIBLE_RE, "");
  // Remove any markup entirely — plain-text fields never carry HTML.
  s = stripTags(s);

  // DOMPurify escapes entities; decode the handful that matter back to text.
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Second pass: any markup re-formed by decoding is neutralised.
  s = s.replace(/<[^>]*>/g, "");
  if (opts?.multiline) {
    s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    s = s.replace(/\s+/g, " ").trim();
  }
  const max = opts?.maxLength;
  if (max && s.length > max) s = s.slice(0, max).trim();
  return s;
}

/** Zod helper: trimmed, sanitized, length-capped string. */
export function safeString(maxLength = 500, opts?: { multiline?: boolean }) {
  return z
    .string()
    .max(maxLength * 4, { message: `Too long (max ${maxLength} characters)` })
    .transform((v) => sanitizeText(v, { maxLength, multiline: opts?.multiline }));
}

const HTML_CONFIG: Record<string, unknown> = {
  ALLOWED_TAGS: [
    "p", "br", "hr", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "mark", "small",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
    "a", "img", "figure", "figcaption", "label", "input",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "title", "alt", "src", "width", "height",
    "colspan", "rowspan", "align", "dir", "lang", "class", "style",
    "data-type", "data-checked", "type", "checked", "disabled",
    "start", "colwidth",
  ],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,|#|\/)/i,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "formaction", "srcdoc", "xlink:href"],
};

let hookInstalled = false;
function installHook() {
  if (hookInstalled || !HAS_DOM) return;
  hookInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.tagName === "A") {
      el.setAttribute("rel", "noopener noreferrer nofollow");
      if (el.getAttribute("target")) el.setAttribute("target", "_blank");
    }
    // Block CSS-based script vectors in inline styles.
    const style = el.getAttribute?.("style");
    if (style && /(expression|javascript:|url\s*\(\s*['"]?\s*(?!data:image)[a-z]+:)/i.test(style)) {
      el.removeAttribute("style");
    }
  });
}

/** DOM-free HTML sanitizer used during server rendering (no window available). */
function sanitizeHtmlWithoutDom(raw: string): string {
  return raw
    // Drop dangerous elements together with their content.
    .replace(
      /<\s*(script|style|iframe|object|embed|form|link|meta|base|template|noscript|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base|template|noscript|svg|math)\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Strip inline event handlers and script-bearing URLs from any remaining tag.
    .replace(/<[^>]+>/g, (tag) =>
      tag
        .replace(/\son[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
        .replace(/\s(?:href|src|xlink:href|formaction|action)\s*=\s*(?:"|')?\s*(?:javascript|vbscript|data:text\/html)[^"'>]*(?:"|')?/gi, "")
        .replace(/\sstyle\s*=\s*(".*?"|'.*?')/gi, (m) =>
          /(expression|javascript:|vbscript:)/i.test(m) ? "" : m,
        ),
    );
}

/** Allow-list sanitizer for rich text (notes editor content, note PDFs). */
export function sanitizeHtml(html: unknown): string {
  if (!html) return "";
  const raw = String(html).replace(CONTROL_RE, "");
  if (!HAS_DOM) return sanitizeHtmlWithoutDom(raw);
  installHook();
  return DOMPurify.sanitize(raw, { ...HTML_CONFIG }) as unknown as string;
}


/** Strip characters illegal in most filesystems + trim. */
export function sanitizeFilename(name: unknown, fallback = "file"): string {
  const s = String(name ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "")
    .replace(INVISIBLE_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return s || fallback;
}

/** Escape a value so spreadsheet apps never treat it as a formula. */
export function sanitizeCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = sanitizeText(value, { maxLength: 8000 });
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Wrap untrusted text before sending it to an AI model as data, not instructions. */
export function sanitizeForPrompt(value: unknown, maxLength = 20000): string {
  return sanitizeText(value, { maxLength, multiline: true })
    .replace(/```/g, "'''")
    .replace(/<\/?(system|assistant|user)>/gi, "");
}

/** Only allow safe navigable URLs (http/https/mailto). */
export function sanitizeUrl(value: unknown): string {
  const s = sanitizeText(value, { maxLength: 2048 });
  if (!s) return "";
  if (/^(https?:\/\/|mailto:|\/)/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return "";
}
