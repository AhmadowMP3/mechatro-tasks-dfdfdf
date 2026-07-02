## Auto-capture project start date

The New Project modal currently exposes a manual "Start date" picker (the empty `mm/dd/yyyy` field in the screenshot). Tasks already auto-capture their start moment on create — projects should behave the same.

### Changes (frontend only, `src/routes/_authenticated/projects.tsx`)

1. Remove `start_date` from the `form` state and remove the "Start date" `<Field>` input from the modal.
2. On submit, set `start_date: new Date().toISOString()` automatically so every new project stamps the real-time creation moment.
3. Keep the "Due date" field as-is (still admin-picked).

No database or RLS changes; the `projects.start_date` column already exists and accepts timestamps.