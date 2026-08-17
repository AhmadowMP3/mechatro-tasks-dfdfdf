/**
 * Recreate the auth accounts on the target Supabase with the SAME user ids as
 * the current backend, so every profile / task / note row keeps pointing at the
 * right person.
 *
 * Password hashes cannot be exported from the managed backend, so each account
 * is created with a temporary password (TEMP_PASSWORD, default below). Users
 * change it from the app after first sign-in.
 *
 * Usage:
 *   TARGET_URL=https://... TARGET_SERVICE_KEY=... bun scripts/migrate/03-users.ts
 */
const TARGET_URL = process.env.TARGET_URL!;
const KEY = process.env.TARGET_SERVICE_KEY!;
const TEMP_PASSWORD = process.env.TEMP_PASSWORD || "Mechatro#2026";

if (!TARGET_URL || !KEY) throw new Error("set TARGET_URL and TARGET_SERVICE_KEY");

type Profile = { id: string; email: string | null; full_name: string };

const profiles: Profile[] = JSON.parse(
  await Bun.file(process.env.PROFILES_JSON || "/tmp/migrate/profiles.json").text(),
);

let created = 0;
let skipped = 0;

for (const p of profiles) {
  if (!p.email) {
    console.log(`skip ${p.full_name} (no email — profile-only member)`);
    skipped++;
    continue;
  }
  const res = await fetch(`${TARGET_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: p.id,
      email: p.email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
    }),
  });
  const body = await res.text();
  if (res.ok) {
    created++;
    console.log(`created ${p.email}`);
  } else {
    console.log(`FAILED ${p.email} [${res.status}] ${body.slice(0, 200)}`);
  }
}

console.log(`\ncreated=${created} skipped=${skipped}`);
