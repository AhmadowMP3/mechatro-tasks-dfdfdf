import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkVerifier, deriveVaultKey, KDF_ITERATIONS, makeVerifier, randomSaltB64 } from "./crypto";
import { setVaultKey } from "./vault-db";
import { findVariantByData, findWorkingVariant, rekeyVault, resetVault, type RekeyProgress } from "./vault-admin";

export type VaultStatus = "loading" | "not_set" | "locked" | "unlocked" | "error";

type VaultMeta = {
  kdf_salt: string;
  kdf_iterations: number;
  verifier: string;
  encrypted_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type VaultContextValue = {
  status: VaultStatus;
  meta: VaultMeta | null;
  /** True once the one-time encryption of existing records has completed. */
  migrated: boolean;
  error: string | null;
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  /** Tries common variants of the typed passphrase; returns the one that worked. */
  recover: (passphrase: string) => Promise<{ ar: string; en: string } | null>;
  /** Change the passphrase, re-encrypting every record. Vault must be unlocked. */
  rekey: (newPassphrase: string, onProgress?: (p: RekeyProgress) => void) => Promise<number>;
  /** Destructive: forget the passphrase (and optionally the encrypted rows). */
  reset: (opts: { wipeEncrypted: boolean }) => Promise<number>;
  lock: () => void;
  markMigrated: () => Promise<void>;
  refresh: () => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

const IDLE_LOCK_MS = 15 * 60 * 1000;


export function FinanceVaultProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMeta = useCallback(async () => {
    const { data, error: err } = await supabase.from("finance_vault_meta").select("*").eq("id", true).maybeSingle();
    if (err) {
      setError(err.message);
      setStatus("error");
      return null;
    }
    const m = (data as VaultMeta | null) ?? null;
    setMeta(m);
    setStatus((prev) => (prev === "unlocked" ? "unlocked" : m ? "locked" : "not_set"));
    return m;
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const lock = useCallback(() => {
    setVaultKey(null);
    setStatus((prev) => (prev === "unlocked" ? "locked" : prev));
  }, []);

  // Auto-lock on idle, on tab close and when the tab is hidden for a long time.
  useEffect(() => {
    if (status !== "unlocked") return;
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(lock, IDLE_LOCK_MS);
    };
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    window.addEventListener("beforeunload", lock);
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      window.removeEventListener("beforeunload", lock);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [status, lock]);

  // Lock whenever the user signs out.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") lock();
    });
    return () => sub.subscription.unsubscribe();
  }, [lock]);

  const setup = useCallback(async (passphrase: string) => {
    const salt = randomSaltB64();
    const key = await deriveVaultKey(passphrase, salt, KDF_ITERATIONS);
    const verifier = await makeVerifier(key);
    const { error: err } = await supabase
      .from("finance_vault_meta")
      .upsert({ id: true, kdf_salt: salt, kdf_iterations: KDF_ITERATIONS, verifier }, { onConflict: "id" });
    if (err) throw new Error(err.message);
    setVaultKey(key);
    setMeta({ kdf_salt: salt, kdf_iterations: KDF_ITERATIONS, verifier, encrypted_at: null });
    setStatus("unlocked");
  }, []);

  const unlock = useCallback(
    async (passphrase: string) => {
      const m = meta ?? (await loadMeta());
      if (!m) return false;
      const key = await deriveVaultKey(passphrase, m.kdf_salt, m.kdf_iterations ?? KDF_ITERATIONS);
      if (!(await checkVerifier(key, m.verifier))) return false;
      setVaultKey(key);
      setStatus("unlocked");
      return true;
    },
    [meta, loadMeta],
  );

  const markMigrated = useCallback(async () => {
    const stamp = new Date().toISOString();
    await supabase.from("finance_vault_meta").update({ encrypted_at: stamp }).eq("id", true);
    setMeta((m) => (m ? { ...m, encrypted_at: stamp } : m));
  }, []);

  const recover = useCallback(
    async (passphrase: string) => {
      const m = meta ?? (await loadMeta());
      if (!m) return null;
      const hit = (await findWorkingVariant(m, passphrase)) ?? (await findVariantByData(m, passphrase));
      if (!hit) return null;
      keyRef.current = hit.key;
      setVaultKey(hit.key);
      setStatus("unlocked");
      return hit.variant.label;
    },
    [meta, loadMeta],
  );

  const rekey = useCallback(
    async (newPassphrase: string, onProgress?: (p: RekeyProgress) => void) => {
      const current = keyRef.current;
      if (!current) throw new Error("Unlock the vault first");
      const res = await rekeyVault(current, newPassphrase, onProgress);
      keyRef.current = res.key;
      setVaultKey(res.key);
      await loadMeta();
      return res.rows;
    },
    [loadMeta],
  );

  const reset = useCallback(
    async (opts: { wipeEncrypted: boolean }) => {
      const res = await resetVault(opts);
      keyRef.current = null;
      setVaultKey(null);
      setMeta(null);
      setStatus("not_set");
      return res.removed;
    },
    [],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      meta,
      migrated: Boolean(meta?.encrypted_at),
      error,
      setup,
      unlock,
      recover,
      rekey,
      reset,
      lock,
      markMigrated,
      refresh: async () => {
        await loadMeta();
      },
    }),
    [status, meta, error, setup, unlock, recover, rekey, reset, lock, markMigrated, loadMeta],
  );


  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useFinanceVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useFinanceVault must be used inside FinanceVaultProvider");
  return ctx;
}
