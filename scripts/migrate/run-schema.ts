import { q } from "./pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../../supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await q(`
  create extension if not exists "uuid-ossp";
  create extension if not exists pgcrypto;
  create extension if not exists citext;
  create schema if not exists private;
`);

const failures: { file: string; error: string }[] = [];

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await q(sql);
    console.log(`ok   ${f}`);
  } catch (e) {
    const msg = (e as Error).message.replace(/\s+/g, " ").slice(0, 300);
    failures.push({ file: f, error: msg });
    console.log(`FAIL ${f} :: ${msg}`);
  }
}

const tables = await q<{ n: number }>(
  `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
);
console.log(`\nmigrations=${files.length} failed=${failures.length} tables=${tables[0]?.n}`);
