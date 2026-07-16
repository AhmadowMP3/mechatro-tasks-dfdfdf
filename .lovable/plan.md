## Goal

Polish Arabic PDF output so **every** piece of text in an Arabic-mode PDF renders in Montserrat Arabic — matching the same font the HTML content is already rasterized with.

## Findings

- The font you uploaded (`Montserrat-Arabic Regular.ttf`, 247,452 bytes) is byte-identical to the one already registered at `src/assets/MontserratArabic-Regular.ttf.asset.json`. No new upload needed — the asset is in place.
- HTML side already uses it via `@font-face` in `src/lib/pdf-render.ts` — Arabic body content in Notes/Reports/Finance rasterizes correctly.
- The gap is in **native jsPDF chrome** (`src/lib/pdf/chrome.ts`, `src/lib/report/pdf-chrome.ts`). Today `setFont()` only switches to Montserrat Arabic when a string contains Arabic codepoints (`\u0600-\u06FF`). In Arabic-mode PDFs, Latin bits (page numbers "1 / 5", the "Mechatro" wordmark, timestamps like "16/07/2026 14:32") still render in **Helvetica**, so the header/footer looks visually mixed.

## Plan

Small, surgical edits — no design changes, no new assets.

### 1. `src/lib/pdf/chrome.ts`
- Change `setFont(pdf, text, hasArabicFont, weight)` selection rule: when `opts.lang === "ar"` **and** the Arabic font is embedded, always use `MontserratArabic` for every string drawn on that page (page counter, generated-at line, center wordmark, fallback "Mechatro" title). Latin characters render fine from the same TTF.
- Keep current behavior for `lang === "en"` (Helvetica remains default; Arabic substrings still switch to Montserrat Arabic).
- Pass `lang` into the internal `setFont` helper (it already receives `opts` at the call sites).

### 2. `src/lib/report/pdf-chrome.ts`
- Apply the same rule in the report-side native chrome helpers (header title, footer meta, cover subtitle) so team/comparison reports match.

### 3. Verify HTML host font stack
- `src/lib/notes-pdf.tsx`, `src/lib/report/report-html.ts`, `src/components/finance/BrandedDocuments.tsx`: confirm Arabic branches list `'Montserrat Arabic'` **first** in `font-family`. Adjust only if a file has it lower in the stack.

### Out of scope
- No bold weight (uploaded zip is Regular only; bold requests will fall back gracefully to synthesized weight as today).
- No changes to English PDFs, layout, colors, or logo.

### QA
After edits, generate one Arabic PDF from each surface (Report, Note, Invoice) via Playwright, run `pdftoppm` and visually confirm header/footer strings render in Montserrat Arabic — no mixed-font seams.
