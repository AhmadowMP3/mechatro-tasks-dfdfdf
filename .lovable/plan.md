## What I can see in the screenshot

The **Change cover / Remove cover** buttons on a note's cover image are getting clipped off the right edge — the text is cut mid-word.

## Cause

In `src/routes/_authenticated/notes.tsx` (line ~507) the buttons sit inside the cover div (which has `overflow: hidden`) and are positioned with `insetInlineEnd: 12`. When a right-side panel is open (Comments / AI) or the viewport is narrow, the buttons still render but the parent's `overflow: hidden` — plus the toolbar row's `flexWrap` reflow — pushes them past the visible edge. The buttons also have no `whiteSpace: nowrap`, so on tight widths the labels themselves can wrap and get clipped.

## Fix (small, presentation-only)

In `src/routes/_authenticated/notes.tsx`:

1. Move the cover action buttons from top-right → **bottom-right of the cover**, so they sit on the darkest part of the gradient (already there) and are visually anchored to the image.
2. Use `right: 12` + `bottom: 12` explicitly (avoid `insetInlineEnd` here — it flips in RTL and can cause overlap with side panels).
3. Wrap them in a flex row with `maxWidth: "calc(100% - 24px)"` and `flexWrap: wrap` so they always stay inside the cover box.
4. Add `whiteSpace: nowrap` to `coverBtn` so each label stays on one line.
5. Slight polish: darker pill background (`rgba(0,0,0,.65)`), `Camera` icon on "Change" and `Trash` icon on "Remove" for clarity.

No logic changes — cover upload/remove handlers, storage, and DB stay identical.

## Files

- `src/routes/_authenticated/notes.tsx` — cover buttons block (~line 506-511) + `coverBtn` style (~line 807).