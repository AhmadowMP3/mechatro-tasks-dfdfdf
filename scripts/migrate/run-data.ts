import { q } from "./pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const tables = readFileSync(join(import.meta.dir, "tables.txt"), "utf8")
  .split("\n")
  .map((t) => t.trim())
  .filter(Boolean);

function sourceRows(table: string): any[] {
  const r = spawnSync(
    "psql",
    ["-tAc", `select coalesce(json_agg(t), '[]'::json) from public."${table}" t`],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout.trim() || "[]");
}

function dollarQuote(payload: string): string {
  let tag = "mig";
  while (payload.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${payload}$${tag}$`;
}

const CHUNK = 200;
const report: string[] = [];

for (const t of tables) {
  let rows: any[];
  try {
    rows = sourceRows(t);
  } catch (e) {
    report.push(`${t.padEnd(26)} SKIP (source: ${(e as Error).message.split("\n")[0]})`);
    continue;
  }

  await q(`set session_replication_role = replica; truncate table public."${t}" cascade;`);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const payload = dollarQuote(JSON.stringify(chunk));
    try {
      await q(
        `set session_replication_role = replica;
         insert into public."${t}"
         select * from jsonb_populate_recordset(null::public."${t}", ${payload}::jsonb);`,
      );
      inserted += chunk.length;
    } catch (e) {
      report.push(`${t.padEnd(26)} ERROR ${(e as Error).message.replace(/\s+/g, " ").slice(0, 200)}`);
      break;
    }
  }

  const dst = await q<{ n: number }>(`select count(*)::int as n from public."${t}"`);
  const n = dst[0]?.n ?? 0;
  report.push(
    `${t.padEnd(26)} src=${String(rows.length).padEnd(6)} dst=${String(n).padEnd(6)} ${
      n === rows.length ? "OK" : "MISMATCH"
    }`,
  );
  console.log(report[report.length - 1]);
}

console.log("\n=== summary ===\n" + report.join("\n"));
