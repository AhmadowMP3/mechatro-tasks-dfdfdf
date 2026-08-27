// Detects "this backend has not been migrated yet" errors so the document
// settings degrade gracefully instead of throwing a red toast at the user.
// PostgREST reports a missing table as PGRST205 / "schema cache" and a missing
// column as PGRST204 / 42703.

const CODES = new Set(["PGRST204", "PGRST205", "42P01", "42703"]);

export function isMissingSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code && CODES.has(e.code)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the")
  );
}
