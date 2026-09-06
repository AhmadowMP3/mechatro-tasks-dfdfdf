# Fix: editor page view looks wrong (preview is fine)

The preview renders correctly, but the editing surface shows the text washed out, misplaced against the sheet, and not following the document's language/theme styling.

## What is wrong

1. The typing layer is drawn on top of the A4 sheets, but it sits outside the sheet's own styling, so it inherits the app's dark-mode text colour and font instead of the document's ink colour, font, direction and alignment. On the white sheet the text looks pale grey and almost invisible (only links stay readable).
2. The measurement code looks for a body marker on the sheet that does not exist, so it cannot find where the sheet's writing area is. When that lookup fails the typing layer falls back to the top-left corner of the sheet instead of aligning with the printed margins, which also throws the page-break calculation off.

## The fix

- Add the missing body marker to the A4 sheet component so the writing area can be measured reliably (no change to how the sheet prints).
- Apply the same paper styling to the typing layer as the sheet body uses: paper ink colour, document font, right-to-left or left-to-right direction, text alignment, and the same padding-free box that matches the printed margins.
- Keep the typing layer above the sheets with a caret colour that is visible on paper, while the sheets stay non-interactive.
- Until the first measurement lands, hide the typing layer instead of parking it at the corner, so no flash of misplaced text appears.
- Re-measure after fonts and images settle so the page splits match the preview exactly.

## Technical notes

- `src/components/documents/DocPaper.tsx`: add `doc-page-body` to the existing `.pdf-flow` body element.
- `src/components/documents/editor/DocEditor.tsx`: give the overlay flow the paper theme values (`color`, `direction`, `textAlign`, `fontFamily`), a `z-index`, and render it hidden until `geo` is available.
- `src/styles.css`: `.doc-editor-flow` gets `z-index: 2`, `caret-color`, and paper typography inheritance; `.doc-editor-sheets` keeps `pointer-events: none`.
- `src/components/documents/editor/usePageLayout.ts`: keep the `.doc-page-body` query (now satisfied) and add a re-measure after `document.fonts.ready` / image load.
- No database or schema changes; PDF export and preview paths untouched.
