# Fix blank PDF pages + logo everywhere

## What's actually broken

I opened `Mechatro_Report_zaven_2026-07-04.pdf`:

- Page 1 → cover renders correctly.
- Page 2 → completely white.
- Page 3 → completely **black**.
- Page 4 → white.

A solid black canvas from html2canvas is a signature of one specific bug: capturing elements that live outside the initial viewport of the iframe with `foreignObjectRendering: true` enabled. Our current pipeline builds one long iframe (`pageCount × 1123px`), stacks every `.pdf-page` section inside it, then loops and calls `html2canvas(section)` on each. Sections 2+ start at y=1123, 2246, … outside the initial 794×1123 window — html2canvas returns blank / black canvases for those.

The HTML itself is correct: `buildReportHtml` in `src/lib/report/report-html.ts` produces cover + 3 content sections, joined into 4 `.pdf-page` blocks. The bug is purely in the renderer at `src/lib/report/generator.ts`.

## Fix (technical)

Rewrite `renderHtmlToPdfBlob` in `src/lib/report/generator.ts` so each `.pdf-page` is rendered in isolation:

1. Parse the incoming HTML once, extract every `<section class="pdf-page">` node.
2. For each section, create a **fresh 794×1123 iframe**, write only that section into its body (`position:absolute; inset:0`) — so the element html2canvas captures is at (0,0) of its own viewport.
3. Wait for fonts + images to load in that iframe, then capture with:
   - `foreignObjectRendering: false` (root cause of the black page)
   - `scale: 2`, `useCORS: true`, `backgroundColor: "#ffffff"`
4. If the resulting canvas is taller than A4 (long tasks/activity lists), slice it into multiple A4-sized image tiles and add each as a new PDF page — no more clipped content.
5. Preload the Mechatro logo once as a **base64 data URL**, and replace `src="…/mechatro-logo.png"` in the HTML before rendering. This guarantees the logo shows up regardless of asset CDN CORS behavior in html2canvas.
6. Remove each temporary iframe in a `finally` block.

Apply the same renderer to team, member, bilingual, and comparison flows — they all funnel through `renderHtmlToPdfBlob`, so one fix covers everything.

## Logo everywhere ("cool" polish)

- Excel already embeds the logo on Summary, Tasks, and each member sheet — leave that alone.
- PDF: keep the current cover logo + top-of-page header logo, and add a subtle **watermark logo** in `contentPage()` (bottom-right, 60px, 8% opacity) so every internal page is branded without competing with content.
- Add a thin gold underline (`th.gold`) under the header logo lockup to match the cover style.

## Verification

After the change I'll render a fresh member report with the same range as the uploaded one, convert every page to a JPEG with `pdftoppm`, and view all pages to confirm:

- Cover intact
- Pages 2-N show real content (profile, KPIs, charts, tasks, sessions, activity)
- Watermark logo visible bottom-right on every content page
- No black frames, no clipping

## Files to touch

- `src/lib/report/generator.ts` — new isolated-iframe renderer, canvas slicing, logo → data URL preload
- `src/lib/report/report-html.ts` — add watermark logo + gold underline in `contentPage()`
- `src/lib/report/team-report.ts` — same watermark in the team page footer (small)

## Out of scope

- Redesigning report themes/layouts
- Changing Excel export (logo already works there)
- Comparison page visual layout (only the render pipeline is fixed)
