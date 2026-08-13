# End-to-End Encryption for the Finance System

Goal: every finance record becomes unreadable in the database. Only someone who types the shared finance passphrase inside the app can see anything. No server, no admin tool, and no database viewer can decrypt it — there is no recovery path.

## How it will work

1. First time you open Finance, a setup screen asks you to create the finance passphrase (twice, with a strength meter and a clear "if you lose this, everything is gone forever" warning).
2. After that, every visit to Finance shows a lock screen. You type the passphrase once per session; the key lives only in browser memory.
3. Everything you type — amounts, names, dates, statuses, invoice numbers, notes, salaries — is encrypted in the browser before it leaves your device.
4. Everything shown to you — lists, totals, charts, PDFs, Excel exports — is decrypted and calculated in the browser after unlocking.
5. Finance auto-locks after 15 minutes of inactivity, on tab close, and on sign-out. A "Lock" button is added to the finance header.

## What the database will hold afterwards

For every finance record: a row id, a creation timestamp, and one blob of ciphertext. Nothing else.

Fully hidden: amounts, currencies, customer names and contacts, invoice numbers, dates, due dates, statuses, payment methods, descriptions, notes, salaries, payroll figures, subscription details, exchange-rate notes, company/bank details in finance settings.

Honest limits — what remains visible to whoever holds the database (this is unavoidable in any design): how many finance records exist, when each row was created or last changed, which record belongs to which parent record (an invoice line belongs to invoice X), and uploaded receipt/proof files (see Files below).

## Things that must change or stop working

These are direct consequences of the server no longer understanding finance data. Each is handled in the plan:

- Automatic overdue detection and the finance reminder job run on the server, which can no longer read due dates or amounts. They will be removed; overdue status is computed in your browser and shown as a badge in the app instead.
- The database triggers that recompute invoice paid/unpaid totals will be removed; the browser recomputes and re-encrypts the invoice after each payment.
- Invoice numbering keeps a plain counter (only reveals how many invoices exist); the formatted number itself is encrypted.
- Sorting, filtering, searching and dashboard charts happen in the browser over the full decrypted set. Fine for thousands of records; noticeably slower beyond roughly 20,000.
- Share links can no longer expose finance pages.
- Backups keep working and stay encrypted — but a restored backup is only readable with the same passphrase.

## Existing data

A one-time, in-browser migration:

1. Take a full backup first (existing backup system, one click) and download it.
2. Set the passphrase.
3. Run "Encrypt existing finance data" — the browser reads every finance record, encrypts it, writes back ciphertext, and verifies each row decrypts correctly before the plaintext columns are dropped.
4. A second migration then drops the plaintext columns permanently.

## Files (receipts, payment proofs, invoice PDFs)

Uploaded files are currently stored readable. They will also be encrypted in the browser before upload and decrypted on download, so filenames become random ids and content is unreadable. Existing files get encrypted by the same one-time migration.

## Technical outline

- Crypto: WebCrypto only. AES-256-GCM per record with a fresh random 96-bit nonce. Key derived with PBKDF2-SHA256, 600k iterations, from a random 16-byte salt stored in a new `finance_vault_meta` table together with a verifier blob (used only to tell "wrong passphrase" from "corrupt data"). Key is a non-extractable `CryptoKey` held in a React context — never in localStorage, never sent anywhere.
- New module `src/lib/finance-crypto.ts` (derive, encrypt, decrypt, verifier) and `src/lib/finance-vault.ts` (typed encrypted repository: `list`, `get`, `create`, `update`, `remove` per finance entity, transparently encrypting/decrypting).
- Schema migration per finance table (`customers`, `invoices`, `invoice_items`, `invoice_payments`, `expenses`, `expense_categories`, `income_entries`, `subscriptions_income`, `subscriptions_expense`, `payroll_periods`, `payroll_entries`, `member_salary_settings`, `fx_rates`, `financial_settings`): add `enc text`, keep `id`, parent FK, `created_at`, `updated_at`; drop every other column in the follow-up migration. RLS stays master-admin/finance-admin only as a second layer.
- Triggers removed: `recompute_invoice_paid`, finance activity-log triggers (they copy titles/amounts into `activity_log` in clear text). Finance events will be logged as type-only entries with no details.
- `finance-hooks.ts` switches from Supabase queries to the vault repository; all aggregation moves into existing helper functions in `src/lib/finance.ts`, which already compute totals client-side.
- New `FinanceLockGate` wrapping the `/finance` route subtree, plus `FinanceKeyProvider`, `UnlockScreen`, `SetupWizard`, and a `MigrateExisting` panel in finance settings.
- PDF and Excel exports already run in the browser and need no change beyond receiving decrypted data.
- Reminder endpoint `src/routes/api/public/hooks/finance-reminders.ts` and its schedule are removed.

## Order of work

1. Crypto core + key provider + unlock/setup UI (no data change yet).
2. Migration A: add `enc` columns and `finance_vault_meta`; drop finance triggers.
3. Vault repository + switch all finance pages to it (dual-read: plaintext if not yet encrypted).
4. In-browser encryption of existing records + verification.
5. Migration B: drop all plaintext finance columns, remove the reminder job.
6. Encrypt finance file uploads.
