import { supabase as rawSupabase } from "@/integrations/supabase/client";
import { sanitizeHtml, sanitizeText } from "@/lib/security/sanitize";

/**
 * Supabase client wrapper that sanitizes every value written to the database.
 *
 * Import this instead of the generated client anywhere the app performs
 * inserts/updates/upserts with user-typed content. Reads, auth, storage,
 * realtime and RPC all pass straight through unchanged.
 */

// Fields that must never be touched (opaque credentials / binary payloads).
const SKIP_KEYS = /(password|token|secret|signature|hash|_key$|^key$|payload|snapshot|_json$)/i;
const HTML_KEYS = /(_html$|^html$)/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    if (SKIP_KEYS.test(key)) return value;
    if (HTML_KEYS.test(key)) return sanitizeHtml(value);
    return sanitizeText(value, { maxLength: 200000, multiline: true });
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(key, v));
  if (value && typeof value === "object" && !(value instanceof Date)) return sanitizeRecord(value as Record<string, unknown>);
  return value;
}

function sanitizeRecord<T>(row: T): T {
  if (!row || typeof row !== "object" || Array.isArray(row) || row instanceof Date) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = sanitizeValue(k, v);
  return out as T;
}

export function sanitizePayload<T>(payload: T): T {
  if (Array.isArray(payload)) return payload.map((r) => sanitizeRecord(r)) as unknown as T;
  return sanitizeRecord(payload);
}

const WRITE_METHODS = new Set(["insert", "update", "upsert"]);

function wrapBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function" && typeof prop === "string" && WRITE_METHODS.has(prop)) {
        return (...args: unknown[]) => {
          const [payload, ...rest] = args;
          return (value as (...a: unknown[]) => unknown).call(target, sanitizePayload(payload), ...rest);
        };
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === "from") {
      return (table: string) => wrapBuilder((target as unknown as { from: (t: string) => object }).from(table));
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  },
}) as typeof rawSupabase;

export default supabase;
