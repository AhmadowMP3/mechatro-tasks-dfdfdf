# High-accuracy Word import with AI

Two things are wrong today: on your server the AI never runs at all, and even when it runs it only fills a few header fields — it never reads the items table.

## 1. Make the AI actually run on your server

The import calls a server function that reads `LOVABLE_API_KEY` at runtime. That variable exists in the Lovable preview but is not set on your Coolify deployment, so the function returns "AI is not configured".

- Add the key as a runtime environment variable on the app resource in Coolify (`LOVABLE_API_KEY`), then redeploy. I will show you the exact value and steps in chat; nothing secret goes into the repository.
- Document it in `DEPLOY.md` and in `docker-compose.yml` as a required runtime variable.
- Replace the vague "AI is not configured" message with a precise one that states the server is missing the AI key and that header fields can still be filled manually.
- Add a tiny health check the settings page can call, so the admin sees "AI: connected / not configured" instead of discovering it only mid-import.

## 2. Much higher extraction accuracy

Currently only the plain text of the Word file is sent, so tables collapse into loose lines and the model guesses.

- Send a structured digest instead of raw text: heading/paragraph lines plus every table rendered as clean rows with their headers, so the model sees real columns.
- Upgrade the model to the current generation (Gemini 3.7 Flash) with a stricter, deterministic extraction contract and the correct gateway auth header.
- Extract the full items table: for every row — item no., Arabic and English description, quantity, unit, unit price, and line total — exactly as written. Nothing is translated or invented; empty cells stay empty.
- Keep header extraction (type, number, dates, currency, client name/attn/phone/email/address/reference) and improve date parsing (day-first) and currency detection from the SAR symbol/glyph as well as codes.
- Two-pass verification: after the first extraction, a short second call re-checks each value against the source text and drops anything it cannot find literally. Values that fail the check are returned as "unconfirmed" rather than silently wrong.
- Handle long documents by chunking the digest and merging results, so multi-page quotations no longer lose their tail.

## 3. Review UI

- Show the extracted items in an editable table inside the import dialog, next to the existing field review, with a confidence badge and an "unconfirmed" mark on anything the verification pass could not confirm.
- Add "Insert items into document" so the rows are written into the document's real items table (with your Riyal glyph for SAR) instead of just as pasted Word content.
- If the AI is unavailable, the dialog still imports the Word content and lets you fill fields manually — no red error wall.

## Technical notes

- `src/lib/docs/import-docx.ts`: add a `digest` builder (headings + tables as rows) alongside the existing HTML/text output.
- `src/lib/docs/import-ai.functions.ts`: new model, `Lovable-API-Key` header, extended tool schema with `items[]`, chunking, verification pass, explicit error mapping for 401/402/429.
- `src/components/documents/ImportDocxDialog.tsx`: items review table, confidence badges, insert-into-document action.
- `DEPLOY.md` + `docker-compose.yml`: document `LOVABLE_API_KEY` as required at runtime.
- No database changes.
