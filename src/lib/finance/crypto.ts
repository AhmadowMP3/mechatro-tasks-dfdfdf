/**
 * End-to-end encryption primitives for the finance vault.
 *
 * Nothing in this file ever sends the passphrase or the derived key anywhere:
 * the key is a non-extractable WebCrypto CryptoKey that only exists in the
 * browser tab's memory. The database only ever receives ciphertext.
 */

export const KDF_ITERATIONS = 600_000;
const ENC_PREFIX = "v1:";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSaltB64(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Derive the AES-256-GCM vault key from the shared finance passphrase. */
export async function deriveVaultKey(
  passphrase: string,
  saltB64: string,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64) as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: the key can never be read back out of the browser
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource);
  const cipher = new Uint8Array(buf);
  const joined = new Uint8Array(iv.length + cipher.length);
  joined.set(iv, 0);
  joined.set(cipher, iv.length);
  return ENC_PREFIX + toB64(joined);
}

export async function decryptBytes(key: CryptoKey, payload: string): Promise<Uint8Array> {
  if (!payload.startsWith(ENC_PREFIX)) throw new Error("Unrecognised ciphertext format");
  const joined = fromB64(payload.slice(ENC_PREFIX.length));
  const iv = joined.slice(0, 12);
  const cipher = joined.slice(12);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher as BufferSource);
  return new Uint8Array(buf);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  return encryptBytes(key, enc.encode(JSON.stringify(value)));
}

export async function decryptJson<T = Record<string, unknown>>(key: CryptoKey, payload: string): Promise<T> {
  return JSON.parse(dec.decode(await decryptBytes(key, payload))) as T;
}

/** Encrypt a known marker so we can tell "wrong passphrase" from "corrupt data". */
const VERIFIER_PLAINTEXT = "mechatro-finance-vault-v1";

export async function makeVerifier(key: CryptoKey): Promise<string> {
  return encryptJson(key, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(key: CryptoKey, verifier: string): Promise<boolean> {
  try {
    return (await decryptJson<string>(key, verifier)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Encrypt a File/Blob for storage upload. Returns an opaque Blob. */
export async function encryptFile(key: CryptoKey, file: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const payload = await encryptBytes(key, bytes);
  return new Blob([payload], { type: "application/octet-stream" });
}

/** Decrypt a downloaded Blob back into its original bytes. */
export async function decryptFile(key: CryptoKey, blob: Blob, mimeType?: string | null): Promise<Blob> {
  const payload = await blob.text();
  const bytes = await decryptBytes(key, payload);
  return new Blob([bytes as BlobPart], { type: mimeType || "application/octet-stream" });
}

/** Rough passphrase strength score (0-4) used by the setup screen. */
export function passphraseStrength(value: string): number {
  let score = 0;
  if (value.length >= 10) score++;
  if (value.length >= 16) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^\w\s]/.test(value)) score++;
  return Math.min(4, score);
}
