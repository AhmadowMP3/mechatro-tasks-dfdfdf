/**
 * One-time migration: encrypt every existing finance record in place.
 *
 * Runs entirely in the browser with the unlocked vault key. Each row is read,
 * encrypted into `enc`, and its plaintext columns are blanked where the schema
 * allows. Attachments are re-uploaded as encrypted blobs.
 */
import { supabase } from "@/integrations/supabase/client";
import { encryptJson } from "./crypto";
import { migrateFileToEncrypted, parseFileRef } from "./files";
import { VAULT_TABLES, VAULT_TABLE_NAMES, type VaultTable } from "./tables";
import { getVaultKey } from "./vault-db";

export type MigrationProgress = {
  table: VaultTable | "attachments";
  done: number;
  total: number;
};

const ATTACHMENT_FIELDS: Partial<Record<VaultTable, { bucket: string; field: string }[]>> = {
  expenses: [{ bucket: "receipts", field: "receipt_path" }],
  invoice_payments: [{ bucket: "receipts", field: "proof_path" }],
};

async function nullablePlainColumns(table: VaultTable, row: Record<string, any>): Promise<Record<string, null>> {
  const keep = new Set([...VAULT_TABLES[table].keep, "enc"]);
  const blanked: Record<string, null> = {};
  for (const col of Object.keys(row)) if (!keep.has(col)) blanked[col] = null;
  return blanked;
}

export async function runVaultMigration(onProgress?: (p: MigrationProgress) => void): Promise<void> {
  const key = getVaultKey();

  for (const table of VAULT_TABLE_NAMES) {
    const cfg = VAULT_TABLES[table];
    const { data, error } = await (supabase as any).from(table).select("*").is("enc", null);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, any>[];
    let done = 0;
    onProgress?.({ table, done, total: rows.length });

    for (const row of rows) {
      const body: Record<string, any> = { ...row };
      delete body.enc;

      // Encrypt attachments first so the stored reference is already the new one.
      for (const att of ATTACHMENT_FIELDS[table] ?? []) {
        const current = body[att.field];
        if (current && !parseFileRef(current)?.path.endsWith(".bin")) {
          const ref = await migrateFileToEncrypted(att.bucket, current).catch(() => null);
          if (ref) body[att.field] = ref;
        }
      }

      const enc = await encryptJson(key, body);
      const blanked = await nullablePlainColumns(table, row);
      const { error: upErr } = await (supabase as any)
        .from(table)
        .update({ enc, ...blanked })
        .eq(cfg.pk, row[cfg.pk]);
      if (upErr) throw new Error(`${table}: ${upErr.message}`);
      done++;
      onProgress?.({ table, done, total: rows.length });
    }
  }
}

/** Count rows still stored as plaintext, per table. */
export async function countUnencrypted(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of VAULT_TABLE_NAMES) {
    const { count } = await (supabase as any).from(table).select("*", { count: "exact", head: true }).is("enc", null);
    if (count) out[table] = count;
  }
  return out;
}
