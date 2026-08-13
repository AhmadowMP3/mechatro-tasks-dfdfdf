# Input Safety: Block SQL / HTML / JS Injection Everywhere

Goal: every place a user can type — task titles, project fields, notes, finance forms, comments, names, search boxes, AI prompts — is validated on input and sanitized on render, so no script, HTML, or SQL payload can execute or be stored in a harmful form.

## 1. One shared sanitation layer

Add `src/lib/security/sanitize.ts` with a small set of helpers used across the app:

- `sanitizeText(value)` — strips control characters, zero-width chars, and HTML tags; trims and collapses whitespace. Used for all plain-text fields (names, titles, numbers, emails, addresses, search input).
- `sanitizeHtml(html)` — allow-list cleaner for rich content: keeps formatting tags (p, headings, lists, tables, b/i/u, links, images) and safe attributes only; removes `<script>`, `<style>`, `<iframe>`, event handlers (`onclick`, ...), `javascript:` / `data:` URLs (except safe image data URLs).
- `sanitizeFilename(name)` — reuse the existing logic in `FilenamePrompt` so it lives in one place.
- Length caps per field type so oversized payloads are rejected with a clear message instead of hitting the database.

Library: `dompurify` (browser) + `isomorphic-dompurify` for code paths that also run during SSR/PDF generation.

## 2. Rich text (Notes)

Notes are the only place HTML is stored and re-rendered:

- Sanitize on save in the note editor and on load, so old stored content is cleaned too.
- Sanitize before the two render points: the notes page and the note PDF export (`dangerouslySetInnerHTML`), plus the DOM parsing helper in `notes.ts`.
- Links get `rel="noopener noreferrer"` and are limited to `http`, `https`, `mailto`.

## 3. Forms and typed labels

Wire the helpers into every form submit path rather than each input, so nothing is missed:

- Zod schemas gain `.transform(sanitizeText)` and max-length rules for text fields across tasks, projects, references, team/profile, finance (invoices, receipts, payslips, customers, items), settings, notes titles, and search/filter boxes.
- Values pasted from the clipboard go through the same schema on submit.

## 4. Server side (defense in depth)

- Server functions and edge functions re-sanitize and re-validate their inputs with the same rules — a client can be bypassed, so the server never trusts what it receives.
- AI prompts (Notes assistant) get prompt-injection guarding: user text is passed as data with delimiters, never merged into the system instruction.
- SQL: the app already uses the Supabase query builder and parameterized RPC (no string-built SQL), which is injection-safe. I'll audit the one place that builds dynamic SQL (`backup-snapshot`) and make sure table names come from a fixed allow-list rather than input.

## 5. Verification

- Try a payload set (`<script>alert(1)</script>`, `'; DROP TABLE tasks;--`, `<img onerror=...>`, `javascript:` links, zero-width chars) in notes, task titles, invoice fields, and search, and confirm they store/render as harmless text.
- Confirm PDFs and Excel exports render sanitized content with no layout breakage.

## Notes

- Nothing about the visual design or existing behaviour changes; legitimate text (Arabic, symbols, currency) is untouched.
- Excel exports also get formula-injection protection (a leading `=`, `+`, `-`, `@` is escaped) so opening a sheet can't execute a cell command.
