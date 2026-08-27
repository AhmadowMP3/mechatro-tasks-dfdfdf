# Import a Word file and let AI fill the document

The admin writes a document in Word, uploads the `.docx` on the Documents page, and the system converts it into a real branded document: the Word content lands inside our A4 sheet (header, footer, logo, QR all stay from the template), and the AI reads the file to detect the document type and fill the fields — client, numbers, dates, currency, title. Nothing is saved until the admin reviews the result and presses Approve.

## The flow

```text
[ Upload .docx ]  ->  [ Convert to rich content ]  ->  [ AI reads and extracts ]
        |                                                        |
        v                                                        v
                     [ Review screen: branded preview + editable fields ]
                                        |
                              Approve -> document created and opened in the editor
```

1. **Upload** — a new "Import from Word" button next to "New document" on the Documents page. Accepts `.docx` (and `.doc` rejected with a clear message), max 20 MB, master admin only.
2. **Convert** — the Word file is turned into rich content in the browser: paragraphs, headings, bold/italic/underline, lists, tables and embedded images are all preserved and become editable content in our Word-style editor. Images are resized to a safe width so documents stay light.
3. **AI analysis** — the text is sent to the AI, which returns:
   - the detected document type (Quotation / RFQ / Offer / Invoice / Proforma / Purchase Order) with a confidence note,
   - document title, document/reference number, issue date, validity date, currency,
   - client details: name (AR and EN), attention person, phone, email, address, tax number, reference.
4. **Review screen** — a two-pane review: the live branded A4 preview on one side, the extracted fields on the other. Every field is editable, the document type is a dropdown pre-set to the AI's guess, and each AI-filled field is marked so the admin sees what the AI decided. A short "what I found / what I could not find" list sits on top.
5. **Approve** — creates the document with our normal numbering, saves the imported body and the confirmed fields, and opens it in the existing Word-style editor. Cancel discards everything; nothing is written before approval.

## Details

- Header, footer, logo placement, theme, fonts and the QR block always come from the template — the Word file never overrides the letterhead.
- Arabic files keep Montserrat Arabic and RTL; language is auto-detected from the content and shown as an editable choice in the review screen.
- Word-specific junk (page headers/footers, page numbers, empty paragraphs, embedded fonts) is stripped so it does not fight our letterhead.
- All imported content is sanitized with the existing injection protection before it reaches the editor or the database.
- If the AI is unavailable or the file is unreadable, the import still works: content is imported and the fields are simply left empty for manual entry.

## Technical notes

- New `src/lib/docs/import-docx.ts`: browser-side `.docx` -> HTML using `mammoth` (pure JS, no server binaries), image handling via data URLs with a max-width downscale, then `sanitizeHtml` and a cleanup pass that maps Word styles onto our editor's marks/nodes and drops empty/decorative nodes.
- New `src/lib/docs/import-ai.functions.ts`: a `createServerFn` guarded by `requireSupabaseAuth`, calling Lovable AI (`google/gemini-2.5-flash`) with a strict extraction contract and a Zod-validated JSON schema — extraction only, no rewriting, no chat. Input is the plain text of the file, truncated and passed through `sanitizeForPrompt`.
- New `src/components/documents/ImportDocxDialog.tsx`: upload -> progress -> review (`DocPaper` preview + field form) -> approve, wired into `src/routes/_authenticated/documents.index.tsx`.
- On approve, reuse `businessDocs.create` so numbering, template resolution and revision logic stay unchanged; the imported HTML is written to `model.html` (version 2 model, no new schema or migration needed).
- Adds one dependency: `mammoth`.
