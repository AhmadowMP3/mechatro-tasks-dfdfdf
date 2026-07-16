# Backup download + external restore

## 1. Force download to device (no browser tab)

`src/routes/_authenticated/settings.tsx` → `download()` currently does `window.open(signedUrl, "_blank")`, which opens the JSON in the browser.

Replace with a true file download:
- Call `supabase.storage.from("backups").download(b.name)` to get a `Blob`.
- Create an object URL, build a hidden `<a href download={b.name}>`, click it, then revoke the URL.
- Toast on success/failure. Same behavior on desktop and mobile.

## 2. New button: "Restore from file" (استعادة من ملف)

Placed in the backups section header next to **Backup now** (master admin only, matching existing gating).

Flow when clicked:
1. Open a hidden `<input type="file" accept="application/json">`.
2. Read file as text, `JSON.parse` it.
3. **Validate** the file is a real Mechatro backup before allowing restore:
   - Filename matches `/^backup-.*\.json$/i` (soft check, warn only).
   - Parsed value is a plain object (not array/null).
   - Every top-level key is one of the known `TABLES` from the edge function (`app_config`, `profiles`, `projects`, `references`, `league_seasons`, `invites`, `share_links`, `tasks`, `task_files`, `task_comments`, `work_sessions`, `season_scores`, `user_badges`, `member_reports`, `activity_log`, `notifications`).
   - At least one of those keys is present, and every value is an array.
   - If any check fails → toast error `invalidBackupFile` and stop.
4. Show the same destructive `RestoreDialog` confirmation already used for cloud backups, adapted to accept an external file source (label: filename).
5. On confirm:
   - Upload the file to the `backups` bucket under a temp name `external-restore-<timestamp>.json`.
   - Invoke `backup-snapshot` with `{ restore: true, file: "<temp name>" }` — reuses the existing, already-tested server restore path.
   - After restore, delete the temp upload from the bucket so it doesn't clutter the list.
   - Refetch backup list; success toast.

No edge-function changes needed — the current restore handler already accepts any file in the `backups` bucket and validates JSON server-side.

## 3. i18n

Add EN/AR keys in `src/lib/dict.ts`:
- `restoreFromFile` — "Restore from file" / "استعادة من ملف"
- `invalidBackupFile` — "This file is not a valid Mechatro backup" / "هذا الملف ليس نسخة احتياطية صالحة لموكاترو"
- `restoringFromFile` — "Restoring from uploaded file…" / "جارٍ الاستعادة من الملف…"

## Files touched

- `src/routes/_authenticated/settings.tsx` — rewrite `download`, add `restoreFromFile` handler + file input + button, extend `RestoreDialog` to accept `{ name, source: "cloud" | "external", tempFile?: string }`.
- `src/lib/dict.ts` — 3 new keys.

## Out of scope

Edge function stays as-is. Backup list, deletion, approval flow, and cron unchanged.
