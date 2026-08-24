/**
 * Finance access lock — a password gate, not encryption.
 *
 * Finance data is stored normally in the database. This module only stores a
 * PBKDF2 hash of the finance password (in `finance_vault_meta`) so the app can
 * ask for it once per sign-in before opening the finance section.
 */

export const KDF_ITERATIONS = 310_000;

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function randomSaltB64(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/** PBKDF2-SHA256 hash of the password, base64 encoded. */
export async function hashPassword(
  password: string,
  saltB64: string,
  iterations: number = KDF_ITERATIONS,
): Promise<string> {
  const material = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    256,
  );
  return toB64(new Uint8Array(bits));
}

/** Constant-time-ish comparison of two base64 digests. */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function passwordStrength(value: string): number {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^\w\s]/.test(value)) score++;
  return Math.min(4, score);
}

/* ------------------------------------------------- "unlocked" session flag -- */

const FLAG_KEY = "finance-unlocked";

export function markUnlocked(sessionId: string) {
  try {
    sessionStorage.setItem(FLAG_KEY, sessionId);
  } catch {
    /* storage disabled — the lock simply asks again */
  }
}

export function clearUnlocked() {
  try {
    sessionStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
}

export function isUnlockedFor(sessionId: string | null): boolean {
  if (!sessionId) return false;
  try {
    return sessionStorage.getItem(FLAG_KEY) === sessionId;
  } catch {
    return false;
  }
}
