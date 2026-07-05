## Problem

The red "Edge Function returned a non-2xx status code" toast on `/access-control` comes from `admin-users`. The function's server log for that failure reads:

```
admin-users error [object Object]
```

Root cause: in `supabase/functions/admin-users/index.ts` the catch block does

```ts
const msg = e instanceof Error ? e.message : String(e);
```

When a DB call fails, `throw error` throws a Supabase `PostgrestError` — a plain object, not an `Error`. `String(e)` → `"[object Object]"`. The 500 body is `{ error: "[object Object]" }`, and the client falls back to Supabase's generic "non-2xx" message, so we never see the real reason.

I verified the `list` action returns 200 with the full user list, so the page load itself works — the toast fires from a subsequent action (approve / set_role / suspend / delete). We need the actual message to diagnose it.

## Fix

1. `supabase/functions/admin-users/index.ts`
   - Replace the catch block with a serializer that extracts `message` / `code` / `details` / `hint` from Supabase errors, falls back to `JSON.stringify`, and never returns `"[object Object]"`:
     ```ts
     function errMsg(e: unknown) {
       if (e instanceof Error) return e.message;
       if (e && typeof e === "object") {
         const o = e as Record<string, unknown>;
         const parts = [o.message, o.details, o.hint, o.code].filter(Boolean);
         return parts.length ? parts.join(" — ") : JSON.stringify(o);
       }
       return String(e);
     }
     ```
   - Log the raw error too (`console.error("admin-users error", e)`) so Deno prints the object shape, not `[object Object]`.
   - Apply the same treatment in `admin-invites/index.ts` and `backup-snapshot/index.ts` so identical failures are readable there.

2. `src/routes/_authenticated/access-control.tsx`
   - In the `call()` helper, when `error.context` is present (Supabase FunctionsHttpError attaches the Response), attempt to read the JSON body and surface `payload.error` instead of the generic "non-2xx" string. Falls back to the current behavior otherwise.

## Out of scope

- Not changing any admin action logic, RLS, or approve/suspend/delete flow — only error surfacing.
- Once the real message is visible, the actual failing action can be fixed in a follow-up.
