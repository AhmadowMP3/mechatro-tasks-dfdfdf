/**
 * Encrypted file storage for finance attachments (expense receipts, payment
 * proofs). Files are encrypted in the browser before upload, so the storage
 * bucket only ever holds opaque blobs under random names.
 */
import { supabase } from "@/integrations/supabase/client";
import { decryptFile, encryptFile } from "./crypto";
import { getVaultKey } from "./vault-db";

export type EncryptedFileRef = {
  path: string;
  name: string;
  type: string;
  size: number;
};

/** Upload a file encrypted; returns a JSON string to store inside the record. */
export async function uploadEncryptedFile(bucket: string, file: File): Promise<string> {
  const key = getVaultKey();
  const blob = await encryptFile(key, file);
  const path = `${crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: false,
    contentType: "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  const ref: EncryptedFileRef = { path, name: file.name, type: file.type, size: file.size };
  return JSON.stringify(ref);
}

export function parseFileRef(value: string | null | undefined): EncryptedFileRef | null {
  if (!value) return null;
  if (value.trim().startsWith("{")) {
    try {
      return JSON.parse(value) as EncryptedFileRef;
    } catch {
      return null;
    }
  }
  // Legacy plaintext upload: a bare storage path.
  return { path: value, name: value.split("/").pop() ?? "file", type: "", size: 0 };
}

/** Download + decrypt an attachment and hand back an object URL. */
export async function openEncryptedFile(bucket: string, value: string): Promise<{ url: string; name: string }> {
  const ref = parseFileRef(value);
  if (!ref) throw new Error("Missing attachment");
  const { data, error } = await supabase.storage.from(bucket).download(ref.path);
  if (error || !data) throw new Error(error?.message ?? "Download failed");
  const isEncrypted = ref.path.endsWith(".bin");
  const blob = isEncrypted ? await decryptFile(getVaultKey(), data, ref.type) : data;
  return { url: URL.createObjectURL(blob), name: ref.name };
}

/** Re-upload an existing plaintext attachment as an encrypted blob. */
export async function migrateFileToEncrypted(bucket: string, plainPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).download(plainPath);
  if (error || !data) return null;
  const name = plainPath.split("/").pop() ?? "file";
  const file = new File([data], name, { type: data.type || "application/octet-stream" });
  const ref = await uploadEncryptedFile(bucket, file);
  await supabase.storage.from(bucket).remove([plainPath]);
  return ref;
}
