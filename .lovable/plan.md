## Problem

The generated PDF is blank (1 page, 3 KB, jsPDF 4.0.0 producer, no text). Root cause: the current renderer in `src/lib/report/generator.ts` mounts the HTML inside a container with `opacity: 0; z-index: -1; pointer-events: none` and hands it to `html2pdf.js`. html2canvas frequently captures nothing (or a blank canvas) when the source node is not truly on-screen, especially with our large `.pdf-page` blocks (794×1123px) and web fonts — which is exactly what the blank output shows.

## Fix (only the PDF renderer — no feature/data changes)

Rewrite `renderHtmlToPdfBlob` in `src/lib/report/generator.ts` to a robust HTML → branded PDF pipeline:

1. **Render into a real, isolated off-screen iframe** (`position: fixed; left: -10000px; top: 0; width: 794px; height: <page>*count px; visibility: visible`) so layout, fonts, colors, and RTL all compute correctly without being visible to the user.
2. Inject the same `<style>` block plus links to the app's already-loaded Google Fonts (Cairo/Montserrat) into the iframe's `<head>`, then wait for:
   - `iframe.contentDocument.fonts.ready`
   - all `<img>` in the iframe to finish (with a 3 s safety timeout)
   - one `requestAnimationFrame` + 150 ms settle
3. **Capture each `.pdf-page` individually** with `html2canvas` (scale 2, `backgroundColor: #ffffff`, `useCORS: true`) instead of one giant node — this avoids the "canvas too tall" limit that silently produces empty output and gives crisp per-page rendering.
4. Build the PDF with `jsPDF` (A4 portrait, `pt`) by adding each captured canvas as a JPEG image sized to the full page, `addPage()` between them. Return `{ blob, pageCount }` with the real page count.
5. Remove the iframe in a `finally` block. Drop the `html2pdf.js` dependency usage here (keep the package installed — no code-wide changes needed).
6. Keep the existing download + Supabase Storage upload + `member_reports` insert flow exactly as-is, plus the comparison PDF path (`persistComparisonPdf`) which reuses the same renderer.

### Files touched

- `src/lib/report/generator.ts` — only `renderHtmlToPdfBlob` is rewritten; public exports (`generateMemberReportPdf`, `persistComparisonPdf`, `ReportLangChoice`) keep their signatures.

### Verification

After the edit, generate a member report from the Team page in the preview, download the PDF, and confirm via `pdfinfo` / `pdftotext` that it has >1 page (for a real member) and contains the expected Arabic/English headings — not an empty 3 KB file.
