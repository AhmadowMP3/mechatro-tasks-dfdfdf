# Fix: tables spill past the page edge and leave big empty gaps

In the editor a long table keeps running over the bottom of the sheet — it prints on top of the signature line and the footer — and the block that was pushed down leaves a large empty area on the previous page.

## What is wrong

The page splitter only works with whole top-level blocks. When a block (a table) is taller than one page it cannot be moved anywhere useful, so it is left where it is and simply overflows the sheet. When a block that is slightly too tall is pushed down, everything above it stays put, which is where the large blank area comes from.

## The fix

1. **Split long tables by rows.** When a table crosses a page boundary, the split now happens between two rows instead of moving the whole table. The rows that fit stay on the page, the remaining rows continue at the top of the next sheet, and the table's header row is repeated on each continuation so the columns stay readable.
2. **Never draw over the footer.** The writing area on each sheet ends above the signature/footer band, and anything past that point moves to the next page instead of overlapping.
3. **Reduce the empty gaps.** Only the space actually needed to reach the next page is added, and an oversized single block (an image or a row taller than a full page) is allowed to run on rather than wasting a whole blank page.
4. **Same result in the preview and the PDF** — the preview/export pagination uses the same row-splitting rule so what the editor shows is what prints.

## Technical notes

- `src/components/documents/editor/usePageLayout.ts`: descend into `table` blocks and measure `tr` rows; compute break points per row; emit spacers keyed to the row position. Guard the "block taller than page" case so no spacer is emitted when `h > H`.
- `src/components/documents/editor/pagination.ts`: support spacers placed inside a table by using a node decoration that adds bottom padding to the last visible row's cells (a widget cannot be a table child), plus a decoration class that repeats the header row visually on continuations.
- Usable body height comes from the measured `.pdf-flow` box, which already excludes the QR row and footer band; verify the measurement is taken from a `sizing="fixed"` sheet so it matches print.
- `src/lib/docs/paginate-html.ts` / `PaginatedDoc.tsx`: apply the same row-level split so preview and PDF agree.
- No database or schema changes.
