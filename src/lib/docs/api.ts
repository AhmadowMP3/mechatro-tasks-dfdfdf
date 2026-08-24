// Template CRUD for the business documents system. Master-admin only at the
// database level (RLS), so every call here assumes an authenticated master.

import { supabase } from "@/lib/security/db";
import { mergeDefaults, mergeFooter, mergeHeader, defaultDefaults, defaultFooter, defaultHeader } from "./defaults";
import type { DocTemplate, DocType } from "./types";

type Row = {
  id: string;
  doc_type: DocType;
  name: string;
  is_default: boolean;
  header: unknown;
  footer: unknown;
  defaults: unknown;
  created_at?: string;
  updated_at?: string;
};

function hydrate(row: Row): DocTemplate {
  return {
    id: row.id,
    doc_type: row.doc_type,
    name: row.name,
    is_default: row.is_default,
    header: mergeHeader(row.doc_type, row.header),
    footer: mergeFooter(row.doc_type, row.footer),
    defaults: mergeDefaults(row.doc_type, row.defaults),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const docTemplates = {
  /** Load the default template for a type, creating it on first use. */
  async ensure(type: DocType): Promise<DocTemplate> {
    const { data, error } = await supabase
      .from("doc_templates")
      .select("*")
      .eq("doc_type", type)
      .eq("is_default", true)
      .maybeSingle();
    if (error) throw error;
    if (data) return hydrate(data as unknown as Row);

    const seed = {
      doc_type: type,
      name: "default",
      is_default: true,
      header: defaultHeader(type) as unknown as Record<string, unknown>,
      footer: defaultFooter(type) as unknown as Record<string, unknown>,
      defaults: defaultDefaults(type) as unknown as Record<string, unknown>,
    };
    const { data: created, error: insErr } = await supabase
      .from("doc_templates")
      .insert(seed)
      .select("*")
      .single();
    if (insErr) throw insErr;
    return hydrate(created as unknown as Row);
  },

  async save(tpl: DocTemplate): Promise<DocTemplate> {
    const { data, error } = await supabase
      .from("doc_templates")
      .update({
        name: tpl.name,
        header: tpl.header as unknown as Record<string, unknown>,
        footer: tpl.footer as unknown as Record<string, unknown>,
        defaults: tpl.defaults as unknown as Record<string, unknown>,
      })
      .eq("id", tpl.id)
      .select("*")
      .single();
    if (error) throw error;
    return hydrate(data as unknown as Row);
  },

  /** Copy one type's header/footer onto every other type (keeps titles). */
  async applyToAll(source: DocTemplate): Promise<void> {
    const { data, error } = await supabase.from("doc_templates").select("*").eq("is_default", true);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Row[];
    for (const row of rows) {
      if (row.doc_type === source.doc_type) continue;
      const existing = hydrate(row);
      const header = {
        ...source.header,
        titleAr: existing.header.titleAr,
        titleEn: existing.header.titleEn,
      };
      const { error: upErr } = await supabase
        .from("doc_templates")
        .update({
          header: header as unknown as Record<string, unknown>,
          footer: source.footer as unknown as Record<string, unknown>,
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
    }
  },
};
