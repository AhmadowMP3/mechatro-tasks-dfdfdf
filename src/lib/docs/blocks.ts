// Reusable document blocks: named chunks of rich content (text, tables,
// images) the master admin composes once and inserts into any document.

import { supabase } from "@/lib/security/db";
import { sanitizeHtml } from "@/lib/security/sanitize";

export type DocBlock = {
  id: string;
  name_ar: string;
  name_en: string;
  html: string;
  sort: number;
};

type Row = DocBlock & { created_at?: string; updated_at?: string };

function hydrate(row: Row): DocBlock {
  return {
    id: row.id,
    name_ar: row.name_ar ?? "",
    name_en: row.name_en ?? "",
    html: sanitizeHtml(row.html ?? ""),
    sort: row.sort ?? 0,
  };
}

export function blockLabel(b: DocBlock, lang: "ar" | "en"): string {
  const primary = lang === "ar" ? b.name_ar : b.name_en;
  return primary || b.name_en || b.name_ar || (lang === "ar" ? "بدون اسم" : "Untitled");
}

export const docBlocks = {
  async list(): Promise<DocBlock[]> {
    const { data, error } = await supabase
      .from("doc_blocks")
      .select("*")
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as Row[]).map(hydrate);
  },

  async create(input: { name_ar: string; name_en: string; html: string; sort?: number }): Promise<DocBlock> {
    const { data, error } = await supabase
      .from("doc_blocks")
      .insert({
        name_ar: input.name_ar,
        name_en: input.name_en,
        html: sanitizeHtml(input.html),
        sort: input.sort ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return hydrate(data as unknown as Row);
  },

  async update(id: string, patch: Partial<Pick<DocBlock, "name_ar" | "name_en" | "html" | "sort">>): Promise<DocBlock> {
    const body = { ...patch };
    if (typeof body.html === "string") body.html = sanitizeHtml(body.html);
    const { data, error } = await supabase.from("doc_blocks").update(body).eq("id", id).select("*").single();
    if (error) throw error;
    return hydrate(data as unknown as Row);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("doc_blocks").delete().eq("id", id);
    if (error) throw error;
  },

  /** Persist a new order after a move up/down in the settings list. */
  async reorder(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase.from("doc_blocks").update({ sort: i }).eq("id", ids[i]);
      if (error) throw error;
    }
  },
};
