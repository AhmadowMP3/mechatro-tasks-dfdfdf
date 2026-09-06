# Fix the language switch crash + polish the document editor

## What is going wrong

Switching an Offer between Arabic and English blanks the page with "Cannot read properties of null (reading 'extensions')".

Confirmed cause: the document editor is thrown away and rebuilt from scratch every time the language (or currency) changes. During that rebuild the old editor is already torn down — its internals are set to null — but the toolbar, the auto-field chips and the smart item tables still reach into it for one more render. That read on a dead editor is the crash.

Nothing is wrong with your document data: the crash is purely in the editing screen.

## The fix

1. **Never rebuild the editor on a language or currency change.** Instead, the existing editor is updated in place: text direction flips, the placeholder switches language, and the auto-fields and item tables refresh their labels and currency. Your typing, cursor and undo history all survive the switch.
2. **Hard guards on every editor read.** Toolbar buttons, field chips and table views all check the editor is alive before touching it, so no teardown race can ever blank the page again.
3. **A safety net around the sheet.** If anything inside the editor ever fails, you get a small inline "reload the editor" card instead of a blank page, with the document content intact.

## Polish pass on the document page

- **Language / theme switch right on the sheet**: AR / EN and Light / Dark toggles move into the ribbon (currently they only exist inside the preview dialog), with an instant flip of the letterhead, footer and body direction.
- **Sticky ribbon**: the toolbar stays pinned while you scroll a long document.
- **Save state that reads clearly**: "Unsaved changes" / "Saved" indicator, keyboard shortcut Ctrl/Cmd+S, and a warning if you try to leave with unsaved edits.
- **Settings strips**: consistent spacing, clearer grouping, and the language/currency controls grouped with the fields they affect.
- **RTL/LTR correctness**: numbers, dates, document number and totals stay left-to-right inside Arabic text; alignment of the client box, meta box and tables flips cleanly.
- **Smoother preview**: page count, page-by-page A4 scroll and export buttons in one row; no layout jump when opening.

## Technical notes

- `src/components/documents/editor/DocEditor.tsx`: drop `[lang, currency]` from the `useEditor` dependency array; apply `editor.setOptions` for `editorProps.attributes.dir`, and update `DocField` / `ItemsTable` / `Placeholder` options through the extension manager, followed by a no-history re-dispatch. Every effect and handler guards on `editor && !editor.isDestroyed`.
- `src/components/documents/editor/Ribbon.tsx`: early-return when `!editor || editor.isDestroyed`; read active state through `useEditorState` so toolbar state stays in sync without extra renders.
- `src/components/documents/editor/extensions.tsx`: node views for `docField` and `itemsTable` guard against a destroyed editor before reading options/attributes.
- New small error boundary component wrapping `<DocEditor>` in `src/routes/_authenticated/documents.$id.tsx`.
- Same guards applied to `SimpleDocEditor.tsx`, which shares the pattern.
- No database or document-format changes; PDF export and the paginated preview keep their current output.
