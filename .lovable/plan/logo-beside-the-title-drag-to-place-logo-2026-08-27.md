# Logo beside the title + drag-to-place logo

## What changes

Today the logo sits in its own full-width band above the header row, so it is always far from the document title. The goal: the logo sits next to the title, and the master admin can drag it anywhere in the header area and save that position — with the exact same result in the on-screen sheet, the PDF and the QR read-only copy.

## New behaviour

1. **Default layout: logo beside the title.** The header becomes a single row: logo + title together in the middle-left group, meta box (No. / Date / Client) on the opposite side. No more tall empty band; the title stays vertically centered next to the logo.

2. **Three placement modes** in the template settings (Header section):
   - **Beside title** (new default)
   - **Band above** (the current look, kept so existing templates don't change unless the admin switches)
   - **Free position** — the admin drags the logo anywhere inside the header area

3. **Drag & drop.** In the live A4 preview on the template settings page, the logo becomes grabbable. Dragging it:
   - switches the template to Free position automatically
   - moves it live under the cursor (mouse + touch)
   - snaps to a light guide grid, with edge/center snapping so it never lands crooked
   - clamps inside the header so it can never overlap the body, the meta box or the page edge
   - saves as percentage coordinates, so it scales identically at preview zoom, full A4 and PDF export

4. **Controls next to the drag area:** nudge arrows for pixel-perfect tweaks, a "Reset position" button, and the existing height field/reset stays.

5. **No overlap guarantee:** in Free mode the header area reserves the logo's measured box, so the title/meta/company text reflow around it instead of colliding. Long Arabic titles and long client names stay clipped-free.

## Technical notes

- `DocHeader` (src/lib/docs/types.ts) gains `logoMode: "inline" | "band" | "free"`, `logoX`, `logoY` (0–100 % of the header box). Defaults in `src/lib/docs/defaults.ts` set `logoMode: "inline"`, centered-start coordinates. Values are merged forward-compatibly, so templates already saved keep working (missing fields → `band` so nothing silently moves until the admin opts in, with a one-click "Use new layout" button).
- `src/components/documents/DocPaper.tsx` is the single renderer used by the editor, `PaginatedDoc`, the template preview and every PDF/QR export — the layout change is made there once, so all outputs match automatically.
- Drag logic lives in the template settings page (`src/routes/_authenticated/doc-templates.tsx`) via pointer events on an overlay in the preview; `DocPaper` stays a pure presentational component and receives an optional `onLogoDrag`/`draggableLogo` prop that is only enabled on that page.
- Header height in free mode is computed from `logoHeight` so pagination (`src/lib/docs/paginate.ts` reserved header height) stays accurate and no content is pushed off the page.
- No database migration needed — header is stored as JSON.

## Verification

- Preview each of the 6 document types in AR and EN, light and dark, in all three modes.
- Export a PDF and open a QR read-only copy to confirm the logo position matches pixel-for-pixel.
- Confirm build passes with no errors.
