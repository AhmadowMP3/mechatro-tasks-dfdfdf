import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The Word engine: a Gotenberg container (LibreOffice + Chromium) running next
 * to the app. It is reached only from the server, never from the browser.
 *
 *   GOTENBERG_URL       e.g. http://gotenberg:3000 (required)
 *   GOTENBERG_USERNAME  optional basic-auth user
 *   GOTENBERG_PASSWORD  optional basic-auth password
 */

/** ~20 MB of .docx once base64-encoded. */
const MAX_DOCX_BASE64 = 28 * 1024 * 1024;
/** Letterhead HTML carries the font and logo inline as data URLs. */
const MAX_HTML_CHARS = 12 * 1024 * 1024;
const ENGINE_TIMEOUT_MS = 120_000;

/** A4 in inches, as Chromium expects it. */
const A4_INCHES = { width: "8.2677", height: "11.6929" } as const;

type AuthedContext = {
  supabase: { from: (t: "profiles") => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string;
};

async function assertMasterAdmin(context: AuthedContext): Promise<void> {
  const { data: me } = await context.supabase
    .from("profiles").select("id, is_master_admin").eq("id", context.userId).maybeSingle();
  if (!me?.is_master_admin) throw new Error("master admin only");
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function callEngine(route: string, form: FormData): Promise<Uint8Array> {
  const base = (process.env["GOTENBERG_URL"] ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("word_engine_not_configured");

  const headers: Record<string, string> = {};
  const user = process.env["GOTENBERG_USERNAME"];
  const pass = process.env["GOTENBERG_PASSWORD"];
  if (user && pass) headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;

  let res: Response;
  try {
    res = await fetch(`${base}${route}`, {
      method: "POST",
      body: form,
      headers,
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
    });
  } catch (e) {
    console.error("[word-engine] unreachable", e);
    throw new Error("word_engine_unreachable");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`[word-engine] ${route} failed ${res.status}: ${detail}`);
    throw new Error(`word_engine_failed_${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Render a prepared .docx with LibreOffice, exactly as Word lays it out. */
export const convertDocxToPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { docxBase64: string }) => {
    const docxBase64 = String(input?.docxBase64 ?? "");
    if (!docxBase64 || docxBase64.length > MAX_DOCX_BASE64) throw new Error("bad_docx");
    return { docxBase64 };
  })
  .handler(async ({ data, context }) => {
    await assertMasterAdmin(context as unknown as AuthedContext);
    const form = new FormData();
    form.append(
      "files",
      new Blob([base64ToBytes(data.docxBase64)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "document.docx",
    );
    const pdf = await callEngine("/forms/libreoffice/convert", form);
    return { pdfBase64: bytesToBase64(pdf) };
  });

/** Render the letterhead pages (header, footer, number) with Chromium. */
export const renderLetterheadPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { html: string }) => {
    const html = String(input?.html ?? "");
    if (!html || html.length > MAX_HTML_CHARS) throw new Error("bad_html");
    return { html };
  })
  .handler(async ({ data, context }) => {
    await assertMasterAdmin(context as unknown as AuthedContext);
    const form = new FormData();
    form.append("files", new Blob([data.html], { type: "text/html" }), "index.html");
    form.append("paperWidth", A4_INCHES.width);
    form.append("paperHeight", A4_INCHES.height);
    for (const side of ["marginTop", "marginBottom", "marginLeft", "marginRight"]) form.append(side, "0");
    form.append("printBackground", "true");
    // The body area must stay see-through: the Word page sits underneath.
    form.append("omitBackground", "true");
    form.append("preferCssPageSize", "true");
    const pdf = await callEngine("/forms/chromium/convert/html", form);
    return { pdfBase64: bytesToBase64(pdf) };
  });
