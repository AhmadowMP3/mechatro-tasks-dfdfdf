import { createServerFn } from "@tanstack/react-start";

// One-off helper to provision a confirmed test account. Safe to call multiple times.
export const provisionTestUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = "tester@mechatro.test";
  const password = "Mechatro@2026!";
  const full_name = "Test User";

  // Try to create; if it exists, reset the password so it's known.
  const created = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });

  if (created.error && !/already/i.test(created.error.message)) {
    throw new Error(created.error.message);
  }

  if (created.error) {
    const list = await supabaseAdmin.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw new Error("Existed but not found");
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password, email_confirm: true, user_metadata: { full_name },
    });
  }

  return { email, password };
});
