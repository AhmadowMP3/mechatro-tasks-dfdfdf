
# Fix Creative PDF: no overlap, logo on every page

The current pipeline rasterises each `.pdf-page` section into one tall canvas and blindly slices it into A4 tiles. Charts, cards, and rows get cut in half; the header/logo only paint on the first tile and the footer only on the last tile — that's the overlap and "missing logo" the user is seeing. Fix it by rendering blocks individually, packing them into A4 pages with real awareness of block heights, and painting the header/footer natively via jsPDF on every physical page.

## Changes

### 1. `src/lib/report/report-html.ts` — blocks instead of full sections

- Remove the in-HTML `contentPage` header/footer chrome (it will move to jsPDF).
- Export a new function `buildReportBlocks(data, lang, theme)` that returns:
  ```ts
  { cover: string; blocks: { html: string; kind: "kpi" | "chart" | "table" | "profile" | "activity" }[] }
  ```
  Each block is a self-contained HTML fragment (one card, one chart, one table). Tables that can be tall (tasks, sessions, activity) are split into chunks of ~14 rows per block so a single block always fits inside an A4 content area.
- Add `buildBilingualBlocks(data, theme)` for the creative theme: interleaves AR and EN blocks in reading order (AR block → EN block → next section), each block already dir-scoped.
- Keep `buildReportHtml` / `buildBilingualHtml` as thin wrappers over the block builders for any legacy callers, but the generator will use the block API.
- Fix `barsSVG` to cap `bw` at 56px so a single-entry chart doesn't span the whole card (the giant blue bar in image-92).
- Fix `chartsSection` grid: enforce fixed heights on donut/bars cards (240px) so nothing overflows its card.

### 2. `src/lib/report/generator.ts` — page packer + native chrome

- Replace `renderSectionToCanvas` + `sliceCanvasToPages` with:
  - `renderBlockToCanvas(html)` → renders one block at exact width (706px = A4 minus 44px side margins) and returns its canvas + measured height in PDF points.
  - `packBlocksIntoPages(blocks, contentH)` → greedy packer that lays blocks top-to-bottom, opening a new PDF page when the next block would overflow `contentH`. Small `blocks` (KPIs, section headers) can share a page; a chart card that's taller than the remaining space moves to the next page whole — no more mid-card slicing.
- After the packer, for each physical PDF page paint the chrome directly with jsPDF:
  - **Header (top 56pt)**: logo image (26pt square) + "MECHATRO · MEMBER REPORT / تقرير العضو" text + thin gold hairline. `pdf.addImage(LOGO_DATA_URL, "PNG", ...)` for the logo, `pdf.text` for the labels, `pdf.setDrawColor` + `pdf.line` for the rule.
  - **Footer (bottom 44pt)**: small logo (14pt) + `mechatro @ mechatro.hub4tech.net` on the left, `page X / Y` on the right, hairline top border.
  - Cover page renders as one big canvas (no chrome) — it already has its own branded header/footer inside.
- Reserve `headerH = 72pt`, `footerH = 44pt`; content area = `pageH - headerH - footerH`. Blocks are drawn inside that band, so header/footer never overlap content.

### 3. Fonts for the native jsPDF text

- Register `Montserrat Arabic` (already inlined as a base64 asset JSON) with `pdf.addFileToVFS` + `pdf.addFont` at generator init so `pdf.text` can render the Arabic header/footer labels correctly. Fall back to Helvetica for Latin text.

### 4. Legacy bilingual path

- Remove the `buildReportHtml(ar) + page-break + buildReportHtml(en)` legacy branch — every choice (ar / en / bilingual) now goes through the block API. This kills the leftover "Mechatro © 2026" footer visible in the uploaded PDF.

## Out of scope

- No changes to `data.ts`, storage upload, history table, preview modal, or dialog UI.
- No new fonts or dependencies (Montserrat Arabic + logo asset already inlined).
- Existing themes (aurora / executive / minimal) still work — they just get the new native chrome too.

## Verification

After build, generate a bilingual Creative report for a test member, open the preview iframe, and confirm:
- Logo appears in the top-left of every non-cover page (not just page 2).
- Footer reads `mechatro @ mechatro.hub4tech.net · page X / Y` on every non-cover page.
- No chart card, table row, or section title is cut in half at a page break.
- Single-project bar chart no longer spans the full card width.
- Arabic still renders with correct shaping (Montserrat Arabic font).
