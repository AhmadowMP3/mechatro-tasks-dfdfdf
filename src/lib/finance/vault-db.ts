/**
 * Encrypted finance data access.
 *
 * `vaultDb.from("invoices").select("*").order("issue_date")` looks exactly like
 * the Supabase client, but:
 *   - reads fetch only `{ structural columns, enc }` and decrypt in the browser
 *   - filters / ordering / limits are applied locally on the decrypted rows
 *   - writes encrypt the whole record into `enc` before it leaves the device
 *
 * Rows that have not been encrypted yet (legacy plaintext) are returned as-is,
 * so the app keeps working during the one-time migration.
 */
import { supabase as rawSupabase } from "@/integrations/supabase/client";
import { sanitizePayload } from "@/lib/security/db";
import { decryptJson, encryptJson } from "./crypto";
import { VAULT_TABLES, isVaultTable, type VaultTable } from "./tables";

/* ------------------------------------------------------------------ key ---- */

let vaultKey: CryptoKey | null = null;
const listeners = new Set<(locked: boolean) => void>();

export function setVaultKey(key: CryptoKey | null) {
  vaultKey = key;
  for (const l of listeners) l(key === null);
}

export function getVaultKey(): CryptoKey {
  if (!vaultKey) throw new Error("FINANCE_LOCKED");
  return vaultKey;
}

export function isVaultUnlocked(): boolean {
  return vaultKey !== null;
}

export function onVaultLockChange(fn: (locked: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------------------------------------------------------------- helpers -- */

type Row = Record<string, any>;
type Filter = { op: string; col: string; value: any };
type Order = { col: string; asc: boolean };

function compare(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case "eq": return v === f.value || String(v) === String(f.value);
    case "neq": return !(v === f.value || String(v) === String(f.value));
    case "in": return (f.value as any[]).some((x) => x === v || String(x) === String(v));
    case "is": return f.value === null ? v === null || v === undefined : v === f.value;
    case "not_is": return !(f.value === null ? v === null || v === undefined : v === f.value);
    case "gt": return compare(v, f.value) > 0;
    case "gte": return compare(v, f.value) >= 0;
    case "lt": return compare(v, f.value) < 0;
    case "lte": return compare(v, f.value) <= 0;
    default: return true;
  }
}

async function decryptRow(table: VaultTable, row: Row): Promise<Row> {
  if (!row?.enc) {
    const { enc: _drop, ...rest } = row ?? {};
    return rest;
  }
  const body = await decryptJson<Row>(getVaultKey(), row.enc as string);
  const keep: Row = {};
  for (const col of VAULT_TABLES[table].keep) if (col in row) keep[col] = row[col];
  return { ...body, ...keep };
}

async function encryptRow(table: VaultTable, row: Row): Promise<Row> {
  const cfg = VAULT_TABLES[table];
  const clean = sanitizePayload({ ...row }) as Row;
  delete clean.enc;
  const out: Row = { enc: await encryptJson(getVaultKey(), clean) };
  for (const col of cfg.keep) {
    // created_at/updated_at are managed by the database unless explicitly given
    if (col in clean && clean[col] !== undefined) out[col] = clean[col];
  }
  return out;
}

/* ---------------------------------------------------------------- builder -- */

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

class VaultQuery<T = any> implements PromiseLike<{ data: T | null; error: { message: string } | null }> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private singleMode: "none" | "maybe" | "one" = "none";
  private returning = false;

  constructor(
    private table: VaultTable,
    private mode: Mode,
    private payload?: Row | Row[],
    private upsertPk?: string,
  ) {}

  select(_cols?: string) { this.returning = true; return this; }
  eq(col: string, value: any) { this.filters.push({ op: "eq", col, value }); return this; }
  neq(col: string, value: any) { this.filters.push({ op: "neq", col, value }); return this; }
  in(col: string, value: any[]) { this.filters.push({ op: "in", col, value }); return this; }
  is(col: string, value: any) { this.filters.push({ op: "is", col, value }); return this; }
  not(col: string, op: string, value: any) {
    this.filters.push({ op: op === "is" ? "not_is" : "neq", col, value });
    return this;
  }
  gt(col: string, value: any) { this.filters.push({ op: "gt", col, value }); return this; }
  gte(col: string, value: any) { this.filters.push({ op: "gte", col, value }); return this; }
  lt(col: string, value: any) { this.filters.push({ op: "lt", col, value }); return this; }
  lte(col: string, value: any) { this.filters.push({ op: "lte", col, value }); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }

  /** Fetch + decrypt + apply local filters/ordering. */
  private async read(): Promise<Row[]> {
    const cfg = VAULT_TABLES[this.table];
    const { data, error } = await (rawSupabase as any).from(this.table).select("*");
    if (error) throw new Error(error.message);
    let rows = await Promise.all(((data ?? []) as Row[]).map((r) => decryptRow(this.table, r)));
    rows = rows.filter((r) => this.filters.every((f) => matches(r, f)));
    for (const o of [...this.orders].reverse()) {
      rows.sort((a, b) => (o.asc ? compare(a[o.col], b[o.col]) : compare(b[o.col], a[o.col])));
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    void cfg;
    return rows;
  }

  private async run(): Promise<{ data: any; error: { message: string } | null }> {
    const cfg = VAULT_TABLES[this.table];
    try {
      if (this.mode === "select") {
        const rows = await this.read();
        if (this.singleMode === "one") {
          if (rows.length !== 1) return { data: null, error: { message: "Expected exactly one row" } };
          return { data: rows[0], error: null };
        }
        if (this.singleMode === "maybe") return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.mode === "insert" || this.mode === "upsert") {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const encoded = await Promise.all(list.map((r) => encryptRow(this.table, r)));
        const q = (rawSupabase as any).from(this.table);
        const { data, error } =
          this.mode === "upsert"
            ? await q.upsert(encoded, { onConflict: this.upsertPk ?? cfg.pk }).select("*")
            : await q.insert(encoded).select("*");
        if (error) return { data: null, error };
        const rows = await Promise.all(((data ?? []) as Row[]).map((r) => decryptRow(this.table, r)));
        if (!this.returning) return { data: null, error: null };
        if (this.singleMode !== "none") return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.mode === "update") {
        const targets = await this.read();
        const patch = this.payload as Row;
        const results: Row[] = [];
        for (const current of targets) {
          const merged = { ...current, ...patch };
          const encoded = await encryptRow(this.table, merged);
          const { error } = await (rawSupabase as any)
            .from(this.table)
            .update(encoded)
            .eq(cfg.pk, current[cfg.pk]);
          if (error) return { data: null, error };
          results.push(merged);
        }
        if (!this.returning) return { data: null, error: null };
        if (this.singleMode !== "none") return { data: results[0] ?? null, error: null };
        return { data: results, error: null };
      }

      // delete
      const targets = await this.read();
      const ids = targets.map((r) => r[cfg.pk]).filter((v) => v !== undefined && v !== null);
      if (ids.length) {
        const { error } = await (rawSupabase as any).from(this.table).delete().in(cfg.pk, ids);
        if (error) return { data: null, error };
      }
      return { data: null, error: null };
    } catch (e: any) {
      const message =
        e?.message === "FINANCE_LOCKED"
          ? "Finance vault is locked — unlock it to continue."
          : e?.message ?? String(e);
      return { data: null, error: { message } };
    }
  }

  then<R1 = any, R2 = never>(
    onfulfilled?: ((value: { data: any; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled as any, onrejected as any);
  }
}

class VaultTableRef {
  constructor(private table: VaultTable) {}
  select(cols?: string) { const q = new VaultQuery(this.table, "select"); q.select(cols); return q; }
  insert(payload: Row | Row[]) { return new VaultQuery(this.table, "insert", payload); }
  update(payload: Row) { return new VaultQuery(this.table, "update", payload); }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    return new VaultQuery(this.table, "upsert", payload, opts?.onConflict);
  }
  delete() { return new VaultQuery(this.table, "delete"); }
}

/**
 * Drop-in replacement for the Supabase client inside the finance section.
 * Vault tables are transparently encrypted; every other table, plus auth,
 * storage and rpc, passes straight through.
 */
export const vaultDb = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === "from") {
      return (table: string) =>
        isVaultTable(table)
          ? (new VaultTableRef(table) as unknown as ReturnType<typeof rawSupabase.from>)
          : (target as any).from(table);
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  },
}) as typeof rawSupabase;

export default vaultDb;
