## Goal
Make the app show the same top-right creation buttons from the previous version:

- `+ New Project` on `/projects`
- `+ New Task` on `/tasks`

Only admins should see them.

## Confirmed problem
The test admin is signed in correctly, but backend requests are failing with:

`permission denied for function is_admin`

Because that admin-check function is blocked, the app cannot load the admin profile/permissions, so it hides the create buttons.

## Implementation plan
1. **Fix the backend permission bug**
   - Add a database migration granting execute access on `private.is_admin(uuid)` to authenticated users and service role.
   - Keep the function private/security-definer and do not make member permissions broader.

2. **Restore the exact button behavior**
   - Keep creation admin-only.
   - On `/projects`, show the top-right `+ New Project` button in the existing toolbar style.
   - On `/tasks`, show the top-right `+ New Task` button in the same existing style.

3. **Keep the same create flow**
   - Do not redesign the app.
   - Reuse the existing project/task creation modal/forms and existing visual language.
   - Keep filters/search/export as they are; just ensure the add button is visible for admins.

4. **Verify with the test admin**
   - Confirm `admin.test@mechatro.test` loads profile/projects/tasks without 403 errors.
   - Confirm the buttons are visible on both pages.
   - Confirm members still do not get admin-only creation access.