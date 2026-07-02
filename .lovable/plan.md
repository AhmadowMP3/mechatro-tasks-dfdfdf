## Root cause

The Access Control page has a shared `call()` helper at `src/routes/_authenticated/access-control.tsx:39` that hard-codes the target function:

```ts
supabase.functions.invoke("admin-users", { body });
```

Everything the Invite modal submits (`action: "create"`) is sent to **admin-users**, which has no `create` case and responds `400 unknown action: create`. supabase-js surfaces that as the generic "Edge Function returned a non-2xx status code" toast — the exact banner in the screenshot. That's why `admin-invites` shows zero log entries: the modal never reaches it.

On top of that, the modal sends `expiry: "7d"` but `admin-invites` reads `body.expires_in`, so even after routing is fixed the expiry dropdown would be ignored and always fall back to 7 days.

For **delete user**, admin-users handles the action correctly, but `public.profiles.id` has no FK to `auth.users(id)`, so `auth.admin.deleteUser` leaves an orphan profile row. Subsequent list calls then render a ghost user and any follow-up action on that row errors. Deleting the profile row alongside the auth user removes that ghost.

## Fix

1. **`src/routes/_authenticated/access-control.tsx`** — inside `InviteModal.submit`, stop using the shared `call()` helper. Invoke `admin-invites` directly and rename the field the edge function expects:

   ```ts
   const { data, error } = await supabase.functions.invoke("admin-invites", {
     body: {
       action: "create",
       role,
       expires_in: expiry,
       email: mode === "locked" ? email.trim().toLowerCase() : null,
       full_name: mode === "locked" ? fullName.trim() : null,
     },
   });
   if (error) throw new Error(error.message);
   const res = (data ?? {}) as { invite?: { token: string; expires_at: string | null }; error?: string };
   if (res.error) throw new Error(res.error);
   const invite = res.invite;
   if (!invite?.token) throw new Error("No token returned");
   const url = `${window.location.origin}/accept-invite?token=${invite.token}`;
   setGenerated({ url, expires_at: invite.expires_at ?? null });
   ```

   (Note the edge function returns `{ invite: row }`, not `{ token, expires_at }` — the current modal reads the wrong shape too.)

2. **`supabase/functions/admin-users/index.ts`** — in the `delete` case, remove the matching `profiles` row before or after `auth.admin.deleteUser` so the list no longer shows a ghost user:

   ```ts
   await admin.from("profiles").delete().eq("id", user_id);
   const { error } = await admin.auth.admin.deleteUser(user_id);
   if (error) throw error;
   ```

No schema, RLS, or invite-redemption changes are needed.

## Verification

- Open Access Control as the master admin, generate an invite link with each expiry option (24h / 7d / 30d / never) in both open and email-locked modes; confirm the URL appears, is copyable, and shows up in the Active invite links list.
- Delete the suspended member; confirm the toast is success, the row disappears, and reloading the page does not bring the row back.
