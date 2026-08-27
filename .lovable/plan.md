# Official Riyal Symbol as a PNG Glyph

Replace the hand-drawn SVG riyal symbol with the real official glyph you uploaded, everywhere the Saudi Riyal appears — screen, documents, PDF, and the QR viewer — with no font or export issues.

## What changes visually

- The riyal symbol becomes the exact official mark from your image, sharp on every screen and in print.
- It automatically switches color: dark glyph on light paper (documents, PDF, printed sheets), light glyph on the dark dashboard.
- It sits perfectly on the text baseline next to the amount (same optical size as the digits, no jumping, no clipping in Arabic RTL lines).
- Plain-text places that cannot show images (Excel cells, file names, logs) keep using "SAR" / "ر.س" exactly as today.

## How it will be built

1. **Prepare two clean PNGs** from the upload: trim the whitespace, keep the shape crisp at high resolution (retina-ready), and produce a dark version and a white version with transparent backgrounds.
2. **Embed them as data URLs** in a single module (`src/lib/currency/riyal-glyph.ts`). Embedding rather than linking guarantees the symbol renders identically in the app, in generated PDFs, in Word exports, and inside the sandboxed `/v/:token` QR viewer — no network fetch, no missing-image boxes.
3. **Rewrite the two existing entry points** in `src/lib/currency.tsx` so nothing else in the codebase has to change:
   - `RiyalSymbol` (React) renders an `<img>` with the right variant, sized in `em` so it scales with the surrounding text.
   - `riyalSymbolSvg(size, color)` keeps its exact signature but returns an `<img>` tag, picking the dark or light PNG from the requested color — so `Money.tsx`, the finance pages, the document renderer and the PDF/Word exporters all pick it up automatically.
4. **Verify the call sites** in `src/components/finance/Money.tsx`, `src/routes/_authenticated/finance.index.tsx`, and the document/PDF HTML path so alignment and size look right in both languages.

## Technical notes

- New file: `src/lib/currency/riyal-glyph.ts` — exports `RIYAL_PNG_DARK` and `RIYAL_PNG_LIGHT` base64 data URLs plus a `riyalGlyphFor(color)` helper.
- `src/lib/currency.tsx` — `RiyalSymbol` and `riyalSymbolSvg` reimplemented on top of the PNGs; public API and all imports stay unchanged.
- Baseline handling stays `vertical-align:-0.12em` with `height:1em;width:auto` so the glyph never distorts.
- The originals stay small (a few KB each), so bundle size and PDF weight are unaffected.
- Typecheck and build are run at the end; no other feature is touched.
