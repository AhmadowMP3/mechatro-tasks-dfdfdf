# Eliminate the Offer language-switch crash

## Confirmed scope

The failure occurs on the business Offer editor when changing the document from Arabic to English. That action also swaps the Arabic logo for the English logo through the shared document paper. The visible error means a disposed TipTap editor is still being accessed during the re-render; the latest source already removes TipTap's delayed `useEditor` lifecycle, so the first verification must determine whether the failing deployed page is running an older bundle or whether one teardown path remains.

## Implementation plan

1. **Reproduce the exact signed-in workflow**
   - Open a real Offer as the master administrator.
   - Switch Arabic → English → Arabic repeatedly while the logo, direction, fields, and item table update.
   - Capture the browser error stack and confirm whether it points to the ribbon, a custom field/table/image node, or `EditorContent` cleanup.

2. **Make editor ownership teardown-safe**
   - Ensure React stops rendering the editor instance before that instance is destroyed.
   - Remove any render-time dependency on TipTap's private extension manager; use one safe readiness helper for commands and callbacks only.
   - Cancel delayed image reads, pointer listeners, toolbar subscriptions, and node updates before disposal.

3. **Keep language and logo changes independent from editor creation**
   - Preserve one editor instance while switching language.
   - Update document direction, labels, field values, currency, and the Arabic/English logo in place without resetting content, cursor position, or undo history.
   - Ensure both logos can load without blanking or remounting the editor.

4. **Protect the Offer page and saved work**
   - Keep the inline recovery screen limited to the editor area.
   - Make “Try again” create a genuinely fresh editor while retaining the Offer HTML held by the page.
   - Preserve save status, preview, PDF export, and unsaved-change protection.

5. **Verify before completion**
   - Test typing, formatting, tables, images, language switching, logo switching, save, preview, and PDF export on the same Offer.
   - Repeat the language switch rapidly and after selecting an image/table.
   - Confirm no visible crash, no browser console exception, and a clean application build.

## Technical constraints

- No database or saved-document format changes.
- No redesign of the Offer page.
- Existing Arabic and English logos remain; only the crash and lifecycle behavior are changed.
