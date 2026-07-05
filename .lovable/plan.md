## Goal

Fix the confusing Google Drive link flow in the task modal. The current "Add link" button does save the link to the database but gives no visible feedback, so users think nothing happened. Rebuild it as a clean, obvious save action with proper feedback and validation.

## Changes — `src/components/TaskDetailModal.tsx`

### 1. Better `addLink` handler

- Trim inputs first.
- If URL empty → toast "URL is required".
- If URL is not a Google Drive/Docs/Sheets/Slides URL → toast `invalidDriveUrl` (already exists).
- If name is empty → **auto-fill a smart default** based on `driveFileType(url)`:
  - `folder` → "Drive folder"
  - `doc` → "Google Doc"
  - `sheet` → "Google Sheet"
  - `slides` → "Google Slides"
  - `file` → "Drive file"
  (Localized via new i18n keys.)
- Insert row. On success: `toast.success(t("linkSaved"))`, clear inputs, refresh list.
- On DB error: surface message via `explainSupabaseError` (used elsewhere in this codebase).
- Disable the button while saving; show a small spinner state.

### 2. Better inline UI

Replace the 3-column `1fr 2fr auto` grid with a two-row card:

- Row 1: URL input (full width) with a small live-detected chip on the right showing the file type icon + label ("Google Sheet", "Drive folder", etc.) once the URL is valid.
- Row 2: Name input (left, flex 1) + **"Save link"** button (right, brand-green gradient, wider, prominent).
- Rename button label from `addLink` → `saveLink` (add new i18n key; keep old `addLink` key too).
- `onKeyDown` on both inputs: Enter submits.
- Button is disabled until URL is non-empty.

### 3. i18n additions in `src/i18n/dict.ts`

- `saveLink`: `{ ar: "حفظ الرابط", en: "Save link" }`
- `linkSaved`: `{ ar: "تم حفظ الرابط", en: "Link saved" }`
- `urlRequired`: `{ ar: "أدخل رابط", en: "URL is required" }`
- `driveFolder`: `{ ar: "مجلد درايف", en: "Drive folder" }`
- `googleDoc`: `{ ar: "مستند Google", en: "Google Doc" }`
- `googleSheet`: `{ ar: "جدول Google", en: "Google Sheet" }`
- `googleSlides`: `{ ar: "عرض Google", en: "Google Slides" }`
- `driveFile`: `{ ar: "ملف درايف", en: "Drive file" }`

## Out of scope

- No changes to the existing "Google Drive links" list rendering below the input row.
- No changes to `task_files` schema or `isDriveUrl` regex.
- No connector integration (this is just saving user-provided Drive URLs, not authenticated API access).
