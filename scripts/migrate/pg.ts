/**
 * Tiny SQL runner for the target Supabase, going through its pg-meta endpoint
 * (/pg/query) so no Postgres port has to be exposed publicly.
 */
export const TARGET_URL = process.env.TARGET_URL || "https://supamecha.hub4tech.net";
export const SERVICE_KEY =
  process.env.TARGET_SERVICE_KEY ||
  (await Bun.file("/tmp/migrate/service.key").text()).trim();

export async function q<T = any>(sql: string): Promise<T[]> {
  const res = await fetch(`${TARGET_URL}/pg/query`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text.slice(0, 600)}`);
  try {
    return JSON.parse(text);
  } catch {
    return [] as T[];
  }
}
