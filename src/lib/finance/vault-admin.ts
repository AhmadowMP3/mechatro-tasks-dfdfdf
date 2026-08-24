/**
 * Vault administration: diagnostics, passphrase recovery attempts, rekey
 * (change the passphrase without losing data) and destructive reset.
 *
 * Everything happens in the browser with the derived key — the passphrase is
 * never sent anywhere.
 */
import { supabase } from "@/integrations/supabase/client";
import { checkVerifier, decryptJson, deriveVaultKey, encryptJson, KDF_ITERATIONS, makeVerifier, randomSaltB64 } from "./crypto";
import { VAULT_TABLES, VAULT_TABLE_NAMES, type VaultTable } from "./tables";

export type TableCounts = { table: VaultTable; total: number; encrypted: number };

export async function countVaultRows(): Promise<TableCounts[]> {
  const out: TableCounts[] = [];
  for (const table of VAULT_TABLE_NAMES) {
    const totalRes = await (supabase as any).from(table).select("*", { count: "exact", head: true });
    const encRes = await (supabase as any)
      .from(table)
      .select("*", { count: "exact", head: true })
      .not("enc", "is", null);
    out.push({ table, total: totalRes.count ?? 0, encrypted: encRes.count ?? 0 });
  }
  return out;
}

export function totalEncrypted(counts: TableCounts[]): number {
  return counts.reduce((s, c) => s + c.encrypted, 0);
}

/* ------------------------------------------------- passphrase variants ----- */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const AR_EXT_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function latinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = AR_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_EXT_DIGITS.indexOf(d));
  });
}

export type PassVariant = { label: { ar: string; en: string }; value: string };

/** Plausible variants of what the user typed, in order of likelihood. */
export function passphraseVariants(input: string): PassVariant[] {
  const seen = new Set<string>();
  const list: PassVariant[] = [];
  const add = (label: PassVariant["label"], value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    list.push({ label, value });
  };

  add({ ar: "كما كُتبت", en: "As typed" }, input);
  add({ ar: "بدون مسافات طرفية", en: "Trimmed" }, input.trim());
  add({ ar: "بدون أي مسافات", en: "No spaces" }, input.replace(/\s+/g, ""));
  add({ ar: "تطبيع NFC", en: "NFC normalised" }, input.trim().normalize("NFC"));
  add({ ar: "تطبيع NFD", en: "NFD normalised" }, input.trim().normalize("NFD"));
  add({ ar: "أرقام لاتينية", en: "Latin digits" }, latinDigits(input.trim()));
  add({ ar: "بدون تشكيل", en: "Diacritics removed" }, input.trim().replace(/[\u064B-\u0652\u0670]/g, ""));
  add({ ar: "أحرف صغيرة", en: "Lowercased" }, input.trim().toLowerCase());
  return list;
}

export type VaultMetaRow = {
  kdf_salt: string;
  kdf_iterations: number;
  verifier: string;
  encrypted_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type VariantResult = { variant: PassVariant; key: CryptoKey } | null;

/** Try every variant against the stored verifier; returns the one that works. */
export async function findWorkingVariant(meta: VaultMetaRow, input: string): Promise<VariantResult> {
  for (const variant of passphraseVariants(input)) {
    const key = await deriveVaultKey(variant.value, meta.kdf_salt, meta.kdf_iterations ?? KDF_ITERATIONS);
    if (await checkVerifier(key, meta.verifier)) return { variant, key };
  }
  return null;
}

/**
 * As a last resort, try to open a real encrypted row directly. Useful when the
 * `verifier` blob itself was damaged (e.g. mangled during a server migration)
 * while the data rows are still intact.
 */
export async function findVariantByData(meta: VaultMetaRow, input: string): Promise<VariantResult> {
  let sample: string | null = null;
  for (const table of VAULT_TABLE_NAMES) {
    const { data } = await (supabase as any).from(table).select("enc").not("enc", "is", null).limit(1);
    const row = (data ?? [])[0];
    if (row?.enc) {
      sample = row.enc as string;
      break;
    }
  }
  if (!sample) return null;
  for (const variant of passphraseVariants(input)) {
    const key = await deriveVaultKey(variant.value, meta.kdf_salt, meta.kdf_iterations ?? KDF_ITERATIONS);
    try {
      await decryptJson(key, sample);
      return { variant, key };
    } catch {
      /* wrong key, keep trying */
    }
  }
  return null;
}

/* ----------------------------------------------------------------- rekey --- */

export type RekeyProgress = { table: VaultTable; done: number; total: number };

/**
 * Re-encrypt every vault row from `oldKey` to a key derived from `newPass`.
 * The verifier/salt are only replaced once every row succeeded, so a failure
 * leaves the old passphrase fully working.
 */
export async function rekeyVault(
  oldKey: CryptoKey,
  newPass: string,
  onProgress?: (p: RekeyProgress) => void,
): Promise<{ rows: number; salt: string; iterations: number; key: CryptoKey }> {
  const salt = randomSaltB64();
  const newKey = await deriveVaultKey(newPass, salt, KDF_ITERATIONS);
  let rows = 0;

  for (const table of VAULT_TABLE_NAMES) {
    const cfg = VAULT_TABLES[table];
    const { data, error } = await (supabase as any)
      .from(table)
      .select(`${cfg.pk}, enc`)
      .not("enc", "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
    const list = (data ?? []) as Record<string, any>[];
    let done = 0;
    onProgress?.({ table, done, total: list.length });

    for (const row of list) {
      const body = await decryptJson(oldKey, row.enc as string);
      const enc = await encryptJson(newKey, body);
      // Verify before writing.
      await decryptJson(newKey, enc);
      const { error: upErr } = await (supabase as any)
        .from(table)
        .update({ enc })
        .eq(cfg.pk, row[cfg.pk]);
      if (upErr) throw new Error(`${table}: ${upErr.message}`);
      done++;
      rows++;
      onProgress?.({ table, done, total: list.length });
    }
  }

  const verifier = await makeVerifier(newKey);
  const { error: metaErr } = await supabase
    .from("finance_vault_meta")
    .upsert({ id: true, kdf_salt: salt, kdf_iterations: KDF_ITERATIONS, verifier }, { onConflict: "id" });
  if (metaErr) throw new Error(metaErr.message);

  return { rows, salt, iterations: KDF_ITERATIONS, key: newKey };
}

/* ----------------------------------------------------------------- reset --- */

/** Destructive: forget the passphrase. Optionally discard encrypted rows too. */
export async function resetVault(opts: { wipeEncrypted: boolean }): Promise<{ removed: number }> {
  let removed = 0;
  if (opts.wipeEncrypted) {
    for (const table of VAULT_TABLE_NAMES) {
      const cfg = VAULT_TABLES[table];
      const { data } = await (supabase as any).from(table).select(cfg.pk).not("enc", "is", null);
      const ids = ((data ?? []) as Record<string, any>[]).map((r) => r[cfg.pk]);
      if (!ids.length) continue;
      if (table === "financial_settings") {
        await (supabase as any).from(table).update({ enc: null }).in(cfg.pk, ids);
      } else {
        const { error } = await (supabase as any).from(table).delete().in(cfg.pk, ids);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      removed += ids.length;
    }
  }
  const { error } = await supabase.from("finance_vault_meta").delete().eq("id", true);
  if (error) throw new Error(error.message);
  return { removed };
}
