## Goal

When sharing a task to WhatsApp or Telegram, append a deep link to the task so recipients can open it directly. Today the WhatsApp share sends text only, and Telegram uses `location.href` (which points to whatever page happens to be open, not the task).

## Changes

### 1. Deep-link URL — `?task=<id>`

Since tasks are viewed in a modal (no dedicated `/tasks/$id` route), use a query-param deep link:

```
${window.location.origin}/tasks?task=<task-id>
```

### 2. Auto-open modal from `?task=<id>`

In `src/routes/_authenticated/tasks.tsx`: on mount / when the search param changes, if `task` is present, set the selected task id so `TaskDetailModal` opens automatically. When the modal closes, clear the query param (via `navigate({ search: {} })`) so the back button behaves correctly.

Also apply the same auto-open behavior on `src/routes/_authenticated/projects.$id.tsx` for tasks that belong to that project (so a link opened while viewing a project also opens the modal).

### 3. Update the share message + links — `src/components/TaskDetailModal.tsx`

- Add a new i18n key `shareViewLink` (`View task:` / `عرض المهمة:`) and include the deep link at the end of the shared text.
- Build `taskUrl = ${origin}/tasks?task=${task.id}`.
- WhatsApp link: `https://wa.me/?text=<message + \n\n + taskUrl>` (WhatsApp shows the URL inline, becomes a preview).
- Telegram link: `https://t.me/share/url?url=<taskUrl>&text=<message>` (Telegram uses the `url` param as the shared link and prepends `text` as caption).
- Add a small "Copy link" button next to the two share buttons for convenience (icon + `navigator.clipboard.writeText(taskUrl)` + toast).

### 4. i18n additions (`src/i18n/dict.ts`)

- `shareViewLink`: `{ ar: "عرض المهمة", en: "View task" }`
- `copyLink`: `{ ar: "نسخ الرابط", en: "Copy link" }`
- `linkCopied`: `{ ar: "تم نسخ الرابط", en: "Link copied" }`

## Out of scope

- No new dedicated `/tasks/$id` route (query param keeps existing modal UX intact).
- No changes to sharing from `TaskCard` (still opens the modal first).
- No changes to auth/RLS — recipients still need permission to see the task once they follow the link.
