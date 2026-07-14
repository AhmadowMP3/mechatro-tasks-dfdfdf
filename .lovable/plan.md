## Problem

Clicking "تنزيل PDF" toasts **"Print root missing"**. The iframe fires its initial `load` event for `about:blank` *before* the `srcdoc` HTML finishes loading, so we look for `#print-root` in an empty document and bail.

## Fix

In `src/lib/pdf/print-document.ts`, replace the srcdoc + single `load` listener with a robust write flow:

1. Append the iframe.
2. Open its document with `contentDocument.open()`, write the full HTML scaffold, `close()`.
3. Poll (up to ~2 s) for `#print-root` to appear before mounting React.
4. Keep the rest (font/image wait, `focus()` + `print()`, cleanup) the same.

Also add a small safety fallback: if `open/write` isn't allowed for some reason, keep the srcdoc path but poll for `#print-root` there too.

## Scope

- Edit only `src/lib/pdf/print-document.ts`.
- No component, route, or dependency changes.
