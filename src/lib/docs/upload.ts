// Image handling for the document editors: everything is downscaled in the
// browser first, then uploaded to the private `doc-assets` bucket and referenced
// by a long-lived signed URL. If storage is unreachable (or the file is tiny)
// the image stays embedded inline as a data URL so nothing ever breaks.

import { supabase } from "@/integrations/supabase/client";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Anything under this stays inline — cheaper than a network round-trip. */
const INLINE_LIMIT = 120 * 1024;
const MAX_EDGE = 1600;
/** Ten years — documents keep their images for their whole life. */
const SIGNED_TTL = 60 * 60 * 24 * 3650;

function extOf(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("svg")) return "svg";
  return "jpg";
}

/** Downscale to a sane print resolution; returns the original for svg/gif. */
async function downscale(file: File): Promise<Blob> {
  if (file.type.includes("svg") || file.type.includes("gif")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1 && file.size <= INLINE_LIMIT) return file;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const type = file.type.includes("png") ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9));
  bitmap.close?.();
  return blob && blob.size < file.size ? blob : file;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export type UploadedImage = { src: string; stored: boolean };

/**
 * Prepare an image for insertion into a document body.
 * Small images are inlined; larger ones land in Cloud storage.
 */
export async function prepareImage(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("too large");

  const blob = await downscale(file);
  if (blob.size <= INLINE_LIMIT) return { src: await toDataUrl(blob), stored: false };

  const path = `body/${crypto.randomUUID()}.${extOf(blob.type || file.type)}`;
  const { error } = await supabase.storage
    .from("doc-assets")
    .upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (!error) {
    const { data } = await supabase.storage.from("doc-assets").createSignedUrl(path, SIGNED_TTL);
    if (data?.signedUrl) return { src: data.signedUrl, stored: true };
  }
  // Storage refused (offline / policy) — keep the document working.
  return { src: await toDataUrl(blob), stored: false };
}
