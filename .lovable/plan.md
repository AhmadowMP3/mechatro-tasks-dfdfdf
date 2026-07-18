## Issues on New Invoice page

1. **Unclear error toast — shows "[object Object]"**
   The save handler does `toast.error(e instanceof Error ? e.message : String(e))`. When Supabase returns a `PostgrestError` object (not an `Error` instance), `String(e)` becomes `"[object Object]"`. This hides the real reason (RLS, missing field, FK, etc.).

2. **Date inputs use the browser-native `<input type="date">`**
   They render in the OS style (light popup, non-Arabic, doesn't match dark theme). The project already has a themed `DatePickerField` component used elsewhere.

## Plan

**File: `src/routes/_authenticated/finance.invoices.$id.tsx`**

- Replace generic error handling in the save/void/delete/record-payment handlers with `explainSupabaseError(err, { action, entity: "invoice", user, lang })` from `@/lib/permission-errors`, falling back to the error's `.message` for non-Postgrest failures. This surfaces messages like "Create invoice denied by security policy (RLS). Your current role: …" instead of `[object Object]`.
- Import `useApp` (already used) to pass `user` + `lang` to the explainer.

- Swap the two native date inputs (Issue date, Due date) and the payment "Paid at" date input for the themed `<DatePickerField />` component so they match the site's dark UI (same styling used in tasks/reports). Keep the same ISO `YYYY-MM-DD` string state — no logic change.

- Also apply the same error-explainer to `finance.invoices.index.tsx` if any raw error toast exists there (spot-check only; skip if none).

## Out of scope
No schema, no policy, no business-logic changes. Purely UI polish + clearer error surfacing on the invoice editor.