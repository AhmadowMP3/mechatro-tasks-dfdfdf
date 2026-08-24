import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearUnlocked,
  digestsMatch,
  hashPassword,
  isUnlockedFor,
  KDF_ITERATIONS,
  markUnlocked,
  randomSaltB64,
} from "./lock";

export type VaultStatus = "loading" | "not_set" | "locked" | "unlocked" | "error";

type LockMeta = {
  kdf_salt: string;
  kdf_iterations: number;
  verifier: string;
};

type VaultContextValue = {
  status: VaultStatus;
  error: string | null;
  /** First-time setup of the finance password. */
  setup: (password: string) => Promise<void>;
  /** Unlock the finance section for this sign-in. */
  unlock: (password: string) => Promise<boolean>;
  /** Change the password (requires the current one). */
  changePassword: (current: string, next: string) => Promise<boolean>;
  /** Master-admin escape hatch: forget the password so a new one can be set. No data is lost. */
  resetPassword: () => Promise<void>;
  lock: () => void;
  refresh: () => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function FinanceVaultProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [meta, setMeta] = useState<LockMeta | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Identify the current sign-in so the unlock lasts exactly one session.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setSessionId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const loadMeta = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("finance_vault_meta")
      .select("kdf_salt, kdf_iterations, verifier")
      .eq("id", true)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setStatus("error");
      return null;
    }
    const m = (data as LockMeta | null) ?? null;
    setMeta(m);
    setMetaLoaded(true);
    return m;
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // Resolve the visible status once the stored password record is known.
  useEffect(() => {
    if (!metaLoaded) return;
    setStatus((prev) => {
      if (prev === "error") return prev;
      if (!meta) return "not_set";
      if (prev === "unlocked") return "unlocked";
      return isUnlockedFor(sessionId) ? "unlocked" : "locked";
    });
  }, [meta, metaLoaded, sessionId]);


  const lock = useCallback(() => {
    clearUnlocked();
    setStatus((prev) => (prev === "unlocked" ? "locked" : prev));
  }, []);

  // Forget the unlock when the user signs out.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearUnlocked();
        setSessionId(null);
        setStatus((prev) => (prev === "unlocked" ? "locked" : prev));
      } else if (session?.user?.id) {
        setSessionId(session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const persist = useCallback(async (password: string) => {
    const salt = randomSaltB64();
    const verifier = await hashPassword(password, salt, KDF_ITERATIONS);
    const { error: err } = await supabase
      .from("finance_vault_meta")
      .upsert({ id: true, kdf_salt: salt, kdf_iterations: KDF_ITERATIONS, verifier }, { onConflict: "id" });
    if (err) throw new Error(err.message);
    return { kdf_salt: salt, kdf_iterations: KDF_ITERATIONS, verifier };
  }, []);

  const setup = useCallback(
    async (password: string) => {
      const m = await persist(password);
      setMeta(m);
      if (sessionId) markUnlocked(sessionId);
      setStatus("unlocked");
    },
    [persist, sessionId],
  );

  const verify = useCallback(
    async (password: string, m: LockMeta) => {
      const digest = await hashPassword(password, m.kdf_salt, m.kdf_iterations ?? KDF_ITERATIONS);
      return digestsMatch(digest, m.verifier);
    },
    [],
  );

  const unlock = useCallback(
    async (password: string) => {
      const m = meta ?? (await loadMeta());
      if (!m) return false;
      if (!(await verify(password, m))) return false;
      if (sessionId) markUnlocked(sessionId);
      setStatus("unlocked");
      return true;
    },
    [meta, loadMeta, verify, sessionId],
  );

  const changePassword = useCallback(
    async (current: string, next: string) => {
      const m = meta ?? (await loadMeta());
      if (!m) return false;
      if (!(await verify(current, m))) return false;
      const updated = await persist(next);
      setMeta(updated);
      if (sessionId) markUnlocked(sessionId);
      setStatus("unlocked");
      return true;
    },
    [meta, loadMeta, verify, persist, sessionId],
  );

  const resetPassword = useCallback(async () => {
    const { error: err } = await supabase.from("finance_vault_meta").delete().eq("id", true);
    if (err) throw new Error(err.message);
    clearUnlocked();
    setMeta(null);
    setStatus("not_set");
  }, []);

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      error,
      setup,
      unlock,
      changePassword,
      resetPassword,
      lock,
      refresh: async () => {
        await loadMeta();
      },
    }),
    [status, error, setup, unlock, changePassword, resetPassword, lock, loadMeta],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useFinanceVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useFinanceVault must be used inside FinanceVaultProvider");
  return ctx;
}
