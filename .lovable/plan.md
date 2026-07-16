## Problem

On the Member Report (and Team Report) cover page, the logo slot next to "MECHATRO / MEMBER REPORT · تقرير العضو" renders as an empty outlined square instead of the actual Mechatro logo — as shown in the uploaded screenshot.

Root cause: the cover HTML uses `<img src="${logo}">` where `logo` is a Vite import of `@/assets/mechatro-logo.png`. `generator.ts` runs `inlineLogo()` to swap that URL for a base64 data URL before html2canvas rasterises the cover, but the swap only fires if `getLogoDataUrl()` succeeds — and when it fails (CDN fetch/CORS/timing), the raw Vite URL is left in place and html2canvas paints a blank/broken image inside the iframe, producing the empty square the user sees.

## Fix

1. **Guarantee the logo data URL is available before rendering the cover.**
   - In `src/lib/report/generator.ts`, if `getLogoDataUrl()` returns `null`, fall back to fetching directly from the bundler URL (`import logoUrl from "@/assets/mechatro-logo.png"`) and converting to a data URL, so the cover always has a real embedded image.
   - Pass the resolved `logoDataUrl` explicitly into the cover HTML instead of relying on regex replacement of a bundler URL that html2canvas may not resolve.

2. **Update cover templates to accept an explicit logo data URL.**
   - `src/lib/report/report-html.ts`: change `coverPage()` and `buildReportHtml*()` to take a `logoDataUrl` argument and use it in both the header logo slot (currently 38×38) and the footer mini-logo (16×16). Keep the outer `<img>` styling identical.
   - `src/lib/report/team-report.ts`: same change for its `coverPage()` and `buildTeamReportHtml()`.

3. **Make the cover logo more prominent.**
   - Bump the cover header logo from 38×38 to 56×56 (member) and keep 48px (team) so it reads clearly at print size, matching the "logo + wordmark" lockup in the user's screenshot.

4. **Keep the jsPDF chrome path untouched.**
   - `src/lib/pdf/chrome.ts` already loads the logo via `loadBrandLogo()` and draws it in `drawHeader`; no change needed there. This fix is scoped to the html2canvas cover pipeline only.

## Files touched

- `src/lib/report/generator.ts` — hardened `getLogoDataUrl()` with a bundler-URL fallback; thread `logoDataUrl` into cover HTML builders.
- `src/lib/report/report-html.ts` — accept `logoDataUrl` in `coverPage` and exported builders; drop reliance on the Vite import for the cover `<img>`.
- `src/lib/report/team-report.ts` — same change for the team cover.

No schema, business logic, or route changes.
