# Template content: default body + reusable blocks

Add a fourth section to the document template settings page (next to Header, Footer, Type defaults) where the master admin composes real document content — text, tables and images — with a live A4 preview.

## What you get

**1. "محتوى المستند" / "Document content" section (per type)**

A simplified Word-style editor. Whatever is written here is preloaded into every new document of that type (quotation, RFQ, offer, invoice, proforma, PO), so a new document opens already filled with your standard wording instead of a blank page.

Toolbar (simplified, not the full ribbon):
- Bold / italic / underline, heading vs body text, alignment, bullet & numbered lists
- Insert table (rows/cols picker) with add/remove row & column and delete-table
- Insert image (upload or paste/drag) with drag-to-resize
- Insert smart field (number, date, client, totals) and the smart items table
- Clear formatting, undo/redo

**2. Reusable blocks library (shared across all types)**

Save any selection or the whole section as a named block ("شروط الدفع", "Bank details", "Company profile table"…). Saved blocks appear:
- In this settings section, as a list you can insert, rename, reorder or delete
- In the document editor ribbon under a new "Insert block" menu, so any document can pull them in

Each block stores its own rich HTML and works in both Arabic and English documents (RTL/LTR follow the document language).

**3. Images**

Uploads go to a private-to-app Cloud storage bucket (`doc-assets`) and are referenced by URL — small pasted/dragged images stay embedded inline as a fallback so nothing ever breaks offline. Images downscale automatically before upload, keep aspect ratio, and are resizable in the editor.

**4. Live A4 preview**

The existing preview sheet on the right renders the section's content inside the page, under the header and above the footer, in the selected language and light/dark paper — exactly as it will print, paginate and export to PDF/Word.

## Technical notes

- Migration: add `body jsonb` (`{ html }`) to `public.doc_templates`; create `public.doc_blocks` (id, name_ar, name_en, html, sort, timestamps) with GRANTs and a master-admin-only RLS policy matching `doc_templates_master`, plus read access for authenticated users so the editor's insert menu works. Create the `doc-assets` storage bucket with master-admin write and authenticated read policies.
- `src/lib/docs/types.ts` + `defaults.ts`: extend `DocTemplate` with `body`; `api.ts` hydrate/save the new column.
- New `src/components/documents/editor/SimpleDocEditor.tsx`: TipTap instance reusing the existing `DocField`, `ItemsTable`, image and table extensions with a trimmed toolbar; shared with the blocks editor.
- New `src/lib/docs/blocks.ts` (CRUD) and `src/lib/docs/upload.ts` (image downscale + storage upload with inline fallback).
- `doc-templates.tsx`: fourth `<Section>`; preview passes `resolveDocHtml(body.html, ctx)` into `DocPaper` so pagination and the riyal glyph behave like the real sheet.
- `docs-api.ts` `create()`: seed `model.html` from the type's template body instead of `starterBodyHtml()` when the body is non-empty.
- `DocEditor.tsx` ribbon: "Insert block" dropdown listing `doc_blocks`, inserting sanitized HTML at the cursor.
- All inserted HTML passes through the existing `sanitizeHtml` allowlist (tables, images with data/https URLs already permitted).
