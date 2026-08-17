import { q, TARGET_URL, SERVICE_KEY } from "./pg";

/** Known bootstrap passwords (same as the current backend). */
const PASSWORDS: Record<string, string> = {
  ghiath: "Ghiath!Master2026",
  "ahmad.hajkhalaf": "Ahmad!Tech2026",
  anas: "Anas!Admin2026",
  rawida: "Rawida!Member2026",
  hasan: "Hasan!Member2026",
  abdullah: "Abdullah!Member2026",
};

type P = { id: string; email: string; username: string; full_name: string };
const profiles: P[] = JSON.parse(await Bun.file("/tmp/migrate/profiles.json").text());

// Reset any partial state from the schema replay.
await q(`
  alter table public.profiles enable trigger user;
  alter table public.tasks enable trigger user;
  set session_replication_role = replica;
  truncate table public.profiles cascade;
  delete from auth.identities;
  delete from auth.users;
`);

for (const p of profiles) {
  const password = PASSWORDS[p.username] ?? "Mechatro#2026";
  const res = await fetch(`${TARGET_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: p.id,
      email: p.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
    }),
  });
  console.log(`${res.ok ? "created" : `FAILED ${res.status} ${(await res.text()).slice(0, 200)}`} ${p.email}`);
}

const n = await q<{ n: number }>(`select count(*)::int as n from auth.users`);
console.log(`auth users on target: ${n[0]?.n}`);
