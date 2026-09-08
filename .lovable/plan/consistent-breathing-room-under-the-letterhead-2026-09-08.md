# Consistent breathing room under the letterhead

Right now the page body has no top padding of its own, so the first block of every
page sits flush against the header rule. The Word-spacing cleanup stays exactly as it
is — the fix is to give our own letterhead a small, fixed gap.

## What changes

1. `src/lib/docs/page-metrics.ts` — add `export const BODY_TOP_GAP = 16;` with a note
   that this is the letterhead's own breathing room, not Word spacing, and must never
   be normalised away by `page-start.ts`.
2. `src/components/documents/DocPaper.tsx` — the body wrapper (`pdf-flow doc-page-body`,
   line 232) changes its padding from `0 ${mg.side}px 18px` to
   `${BODY_TOP_GAP}px ${mg.side}px 18px`.

## What stays untouched

- `page-start.ts` normalisation, `BODY_SAFETY`, margins, pagination gap math.
- No margin-top on content, no spacer element — the gap lives on the body box only, so
  `snapPageStart` / `snapWordPageStartBlock` cannot cancel it.

## Measurement (verified, no change needed)

- `measureBodyHeight` in `PaginatedDoc.tsx` renders the full `DocPaper` with
  `sizing="auto"`, so the padding is inside the measured chrome and the usable body
  height shrinks correctly.
- `usePageLayout.ts` measures `[data-doc-body-content]` (line 234 of `DocPaper.tsx`),
  which sits inside the padding, so its rect already accounts for it.
  If either turns out not to hold in practice, the measurement gets fixed — the padding
  is never shrunk to compensate.

## Result

Every page, including pages 2+ of an imported Word file, shows the same 16px gap under
the header rule in the editor, the preview and the printed PDF, with no page count
change for existing documents.
