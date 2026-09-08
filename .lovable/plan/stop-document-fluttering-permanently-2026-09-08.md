# Stop document fluttering permanently

## Goal
Keep imported Word documents visually stable while scrolling and editing, without changing their content, formatting, headers, footers, or A4 margins.

## Confirmed cause
The live editor currently observes all size and DOM attribute changes, including the pagination classes and spacer elements it creates itself. Those decorations are also copied into the hidden measurement document. This creates a feedback loop: measure → apply page offsets → observer fires → measure the previous offsets again → apply a different layout.

## Changes
1. **Make every measurement clean and deterministic**
   - Strip all prior pagination-only classes, spacer nodes, row-gap styles, page-start lift variables, and temporary negative margins from the hidden measurement copy before calculating pages.
   - Recalculate page starts only from the original Word content and shared A4 geometry.

2. **Stop self-triggered layout loops**
   - Ignore observer events caused only by pagination decorations.
   - Guard the layout-application phase so its own spacer/class updates cannot immediately schedule another conflicting pass.
   - Keep genuine changes—typing, image loading, table edits, font loading, resize, and drag/drop—able to trigger a fresh calculation.

3. **Apply one stable layout per frame**
   - Compute the complete page layout first, compare it with the currently applied layout, and update the editor only when the result has materially changed.
   - Preserve the current scroll position when pagination changes so content does not jump under the user.

4. **Validate the real behavior**
   - Test a Word-imported multi-page document while scrolling, typing near a page boundary, moving a table, and waiting for images/fonts to load.
   - Confirm page count, headers, table splits, and top spacing remain fixed with no repeated DOM/layout cycle.
   - Check the latest app error/build signals before completion.

## Technical scope
Frontend document pagination only. No database, backend, migration, or deployment-setting changes are required.
