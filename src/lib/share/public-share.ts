// Public read-only share links + QR codes for every PDF the system generates.
//
// Flow: before printing/rendering a PDF we reserve a share row (stable token
// per document), build a QR image of its public URL, stamp that QR on the
// bottom-left of the LAST page, then store the rendered HTML snapshot so the
// public /v/{token} page shows exactly the same A4 document, read-only.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/lib/security/db";

export type ShareKind =
  | "business_doc"
  | "member_report"
  | "team_report"
  | "comparison_report"
  | "finance_report"
  | "finance_invoice"
  | "by_member_report";

export type ShareTarget = {
  kind: ShareKind;
  /** Stable id of the source record — reuses the same token/QR across exports. */
  refId?: string | null;
  title?: string;
  lang?: "ar" | "en";
  theme?: string;
};

export type PreparedShare = {
  token: string;
  url: string;
  qrDataUrl: string;
};

const db = () => supabase as any;

function makeToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 26);
}

export function shareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/v/${token}`;
}

export async function makeQrDataUrl(url: string): Promise<string> {
  const QR = await import("qrcode");
  return QR.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#081320", light: "#FFFFFF" },
  });
}

/** Find an existing (non-revoked) share for a record. */
async function findShare(kind: ShareKind, refId: string): Promise<{ token: string } | null> {
  const { data, error } = await db()
    .from("public_shares")
    .select("token")
    .eq("kind", kind)
    .eq("ref_id", refId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return { token: data[0].token as string };
}

/**
 * Reserve (or reuse) the public share for a document and build its QR image.
 * Never throws — exports must succeed even if the link cannot be created.
 */
export async function prepareShare(target: ShareTarget): Promise<PreparedShare | null> {
  try {
    const refId = target.refId ?? null;
    let token: string | null = null;

    if (refId) {
      const existing = await findShare(target.kind, refId);
      if (existing) token = existing.token;
    }

    if (!token) {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (!uid) return null;
      const fresh = makeToken();
      const { error } = await db().from("public_shares").insert({
        kind: target.kind,
        ref_id: refId,
        token: fresh,
        title: target.title ?? null,
        lang: target.lang ?? "ar",
        theme: target.theme ?? "dark",
        created_by: uid,
        payload: {},
      });
      if (error) return null;
      token = fresh;
    }

    const url = shareUrl(token);
    const qrDataUrl = await makeQrDataUrl(url);
    return { token, url, qrDataUrl };
  } catch (e) {
    console.warn("prepareShare failed:", e);
    return null;
  }
}

/** Store the rendered A4 snapshot for the public viewer. */
export async function saveSharePayload(
  token: string,
  payload: { html: string; css?: string; width?: number; pageHeight?: number; background?: string; color?: string; title?: string },
): Promise<void> {
  try {
    await db()
      .from("public_shares")
      .update({ payload, updated_at: new Date().toISOString() })
      .eq("token", token);
  } catch (e) {
    console.warn("saveSharePayload failed:", e);
  }
}

/** Revoke every active link for a record (printed QRs stop working). */
export async function revokeShares(kind: ShareKind, refId: string): Promise<void> {
  await db()
    .from("public_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("kind", kind)
    .eq("ref_id", refId)
    .is("revoked_at", null);
}

/** Existing public link for a record, if any (used by the "Read link" button). */
export async function getShareUrl(kind: ShareKind, refId: string): Promise<string | null> {
  const existing = await findShare(kind, refId);
  return existing ? shareUrl(existing.token) : null;
}

export type PublicShareRow = {
  token: string;
  kind: string;
  title: string | null;
  lang: string;
  theme: string;
  payload: { html?: string; css?: string; width?: number; pageHeight?: number; background?: string; color?: string; title?: string };
  created_at: string;
};

/** Anonymous read of one share by token (security-definer RPC). */
export async function fetchPublicShare(token: string): Promise<PublicShareRow | null> {
  const { data, error } = await db().rpc("get_public_share", { p_token: token });
  if (error || !data?.length) return null;
  return data[0] as PublicShareRow;
}
