## Goal
Before any file export (xlsx or pdf), show a popup asking the user for the filename. The entered text becomes the file name (extension appended automatically).

## New file
**`src/components/FilenamePrompt.tsx`** — a reusable async prompt:
- `promptFilename({ defaultName, extension, title? }): Promise<string | null>`
- Renders a modal (using existing `ModalShell` styling) with a text input pre-filled with `defaultName`, a hint showing the final `.ext`, and two buttons: `t("cancel")` / `t("export")`.
- Resolves with the sanitized filename (strip illegal chars `\ / : * ? " < > |`, trim, fallback to default if empty) plus extension, or `null` if cancelled.
- Implemented via a mounted root portal + promise (imperative API so we don't refactor every call site into stateful modals).

## Wire into every export site
For each call, wrap the export in `const name = await promptFilename(...); if (!name) return;` and pass `fileName: name` (xlsx) or use `name` as the download filename (pdf).

1. **`src/routes/_authenticated/projects.index.tsx`** (line 158) — xlsx export.
2. **`src/routes/_authenticated/team.tsx`** (line 119) — xlsx export.
3. **`src/routes/_authenticated/tasks.tsx`** (line 260) — xlsx export.
4. **`src/routes/_authenticated/activity.tsx`** (line 386) — xlsx export.
5. **`src/routes/_authenticated/reports.tsx`** (line 198) — pdf download (`a.download = prepared.filename` → use prompted name).
6. **`src/routes/_authenticated/reports-history.compare.tsx`** (line 86) — pdf comparison export.

Default filenames keep today's existing patterns (e.g. `Mechatro_Projects_2026-07-05_1430`); the popup pre-fills that so a user can just hit Enter.

## i18n
Add keys to `src/i18n/dict.ts`: `filenamePromptTitle`, `filenameLabel`, `filenameHint` (ar + en).

## Out of scope
- No change to xlsx/pdf content or column logic.
- No change to who can export (permissions unchanged).
- Status change / archive logic untouched.

## Verification
- Trigger each of the 6 export entry points; confirm popup appears, default name shown, cancel aborts (no download), confirm downloads file with the exact typed name + correct extension.
- Illegal characters stripped; empty input falls back to default.
