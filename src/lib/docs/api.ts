// Template CRUD for the business documents system. Master-admin only at the
// database level (RLS), so every call here assumes an authenticated master.

import { supabase } from "@/lib/security/db";
import type { Json } from "@/integrations/supabase/types";
import { mergeDefaults, mergeFooter, mergeHeader, mergeBody, defaultBody, defaultDefaults, defaultFooter, defaultHeader } from "./defaults";
import type { DocTemplate, DocType } from "./types";

type Row = {
  id: string;
  doc_type: DocType;
  name: string;
  is_default: boolean;
  header: unknown;
  footer: unknown;
  defaults: unknown;
  body?: unknown;
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
    body: mergeBody(row.body),
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
      header: defaultHeader(type) as unknown as Json,
      footer: defaultFooter(type) as unknown as Json,
      defaults: defaultDefaults(type) as unknown as Json,
    };
    let { data: created, error: insErr } = await supabase
      .from("doc_templates")
      .insert({ ...seed, body: defaultBody() as unknown as Json })
      .select("*")
      .single();
    if (insErr && isMissingSchema(insErr)) {
      ({ data: created, error: insErr } = await supabase.from("doc_templates").insert(seed).select("*").single());
    }
    if (insErr) throw insErr;
    return hydrate(created as unknown as Row);
  },

  async save(tpl: DocTemplate): Promise<DocTemplate> {
    const base = {
      name: tpl.name,
      header: tpl.header as unknown as Json,
      footer: tpl.footer as unknown as Json,
      defaults: tpl.defaults as unknown as Json,
    };
    const run = (patch: Record<string, unknown>) =>
      supabase.from("doc_templates").update(patch).eq("id", tpl.id).select("*").single();

    let { data, error } = await run({ ...base, body: tpl.body as unknown as Json });
    // Backend still missing the `body` column (self-hosted not migrated yet):
    // keep header/footer edits working instead of failing the whole save.
    if (error && isMissingSchema(error)) ({ data, error } = await run(base));
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
          header: header as unknown as Json,
          footer: source.footer as unknown as Json,
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
    }
  },
};
