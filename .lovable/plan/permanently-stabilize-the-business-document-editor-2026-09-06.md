# Permanently stabilize the business document editor

## Confirmed diagnosis

The crash is a TipTap lifecycle race, not bad offer data. TipTap destroys an editor by setting its internal extension manager to `null`; the current page can still render toolbar/node-view code or run an update while that disposed instance is being replaced. The first fix reduced editor recreation, but the page still relies on TipTap's `useEditor` lifecycle and still reads the extension manager directly, so the same disposed instance can escape into React.

## Implementation

1. **Own one editor instance explicitly**
   - Replace the hook-managed lifecycle in both document editors with a small stable editor controller.
   - Create the editor once after mount, publish it only while usable, and clear React state before destroying it on unmount.
   - Keep content callbacks current through refs so ordinary document updates never recreate the editor.

2. **Remove internal extension-manager mutation**
   - Stop reading or changing TipTap's private extension manager when language, currency, or metadata changes.
   - Feed all live document values through the existing React context used by custom fields and item tables.
   - Update only safe public editor options such as text direction while the instance is active.

3. **Make every editor consumer teardown-safe**
   - Centralize guarded reads/actions for the ribbon, image node, item table, and simplified editor.
   - Ensure delayed uploads, pointer handlers, subscriptions, and toolbar clicks become no-ops after unmount.
   - Unsubscribe listeners without calling back into a destroyed editor.

4. **Contain and recover from any unexpected editor failure**
   - Keep the inline editor boundary so the rest of the offer page remains available.
   - Make reload create a genuinely fresh editor instance while preserving the document HTML held by the page.

5. **Verify the exact failing workflow**
   - Type content, switch Arabic to English and back repeatedly, switch themes/currency, use toolbar actions, save, preview, and export.
   - Check both the full offer editor and the simplified template/block editor.
   - Confirm type checks, the current build log, browser console, and visible desktop behavior are clean.

## Technical notes

- No database or saved-document format changes.
- Existing offer content, formatting, reusable blocks, images, tables, preview, and PDF behavior stay intact.
- The fix removes reliance on TipTap's delayed hook destruction path, which is the race documented in the library and observed in its teardown source.
