// CRUD for business documents (Quotation / RFQ / Offer / Invoice / Proforma /
// Purchase Order). Master-admin only at the database level.

import { supabase } from "@/lib/security/db";
import type { Json } from "@/integrations/supabase/types";
import { mergeClient, mergeModel, defaultModel, emptyClient, type DocClient, type DocModel } from "./model";
import { starterBodyHtml } from "./rich";
import { mergeFooter, mergeHeader } from "./defaults";
import { docTemplates } from "./api";
import type { DocFooter, DocHeader, DocLang, DocStatus, DocTheme, DocType } from "./types";

export type BusinessDoc = {
  id: string;
  doc_type: DocType;
  number: string;
  revision: number;
  title: string;
  client: DocClient;
  lang: DocLang;
  theme: DocTheme;
  currency: string;
  model: DocModel;
  header_override: DocHeader | null;
  footer_override: DocFooter | null;
  status: DocStatus;
  issue_date: string;
  valid_until: string | null;
  created_at?: string;
  updated_at?: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function hydrate(row: any): BusinessDoc {
  return {
    id: row.id,
    doc_type: row.doc_type,
    number: row.number,
    revision: row.revision,
    title: row.title ?? "",
    client: mergeClient(row.client),
    lang: (row.lang === "en" ? "en" : "ar") as DocLang,
    theme: (row.theme === "dark" ? "dark" : "light") as DocTheme,
    currency: row.currency ?? "USD",
    model: mergeModel(row.model),
    header_override: row.header_override ? mergeHeader(row.doc_type, row.header_override) : null,
    footer_override: row.footer_override ? mergeFooter(row.doc_type, row.footer_override) : null,
    status: row.status,
    issue_date: row.issue_date,
    valid_until: row.valid_until ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export const businessDocs = {
  async list(filter?: { type?: DocType | "all"; q?: string }): Promise<BusinessDoc[]> {
    let query = supabase.from("business_docs").select("*").order("created_at", { ascending: false });
    if (filter?.type && filter.type !== "all") query = query.eq("doc_type", filter.type);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map(hydrate);
    const q = (filter?.q ?? "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      [d.number, d.title, d.client.nameAr, d.client.nameEn].some((s) => (s ?? "").toLowerCase().includes(q)),
    );
  },

  async get(id: string): Promise<BusinessDoc> {
    const { data, error } = await supabase.from("business_docs").select("*").eq("id", id).single();
    if (error) throw error;
    return hydrate(data);
  },

  /** Create a document seeded from its type template (number from the DB). */
  async create(type: DocType): Promise<BusinessDoc> {
    const tpl = await docTemplates.ensure(type);
    const { data: number, error: numErr } = await supabase.rpc("next_doc_number", { _type: type });
    if (numErr) throw numErr;

    const validity = tpl.defaults.validityDays;
    const payload = {
      doc_type: type,
      number: number as unknown as string,
      revision: 1,
      title: tpl.header.titleAr || tpl.header.titleEn || type,
      client: emptyClient() as unknown as Json,
      lang: tpl.defaults.lang,
      theme: tpl.defaults.theme,
      currency: tpl.defaults.currency,
      model: { ...defaultModel(), showClientBox: false, html: (tpl.body?.html?.trim() ? tpl.body.html : starterBodyHtml()) } as unknown as Json,
      status: "draft" as DocStatus,
      issue_date: today(),
      valid_until: validity > 0 ? addDays(validity) : null,
    };
    const { data, error } = await supabase.from("business_docs").insert(payload).select("*").single();
    if (error) throw error;
    return hydrate(data);
  },

  async save(doc: BusinessDoc): Promise<BusinessDoc> {
    const { data, error } = await supabase
      .from("business_docs")
      .update({
        title: doc.title,
        client: doc.client as unknown as Json,
        lang: doc.lang,
        theme: doc.theme,
        currency: doc.currency,
        model: doc.model as unknown as Json,
        header_override: (doc.header_override ?? null) as unknown as Json,
        footer_override: (doc.footer_override ?? null) as unknown as Json,
        status: doc.status,
        issue_date: doc.issue_date,
        valid_until: doc.valid_until,
      })
      .eq("id", doc.id)
      .select("*")
      .single();
    if (error) throw error;
    return hydrate(data);
  },

  /** Snapshot the current content, then bump the revision (…-R02, -R03 …). */
  async newRevision(doc: BusinessDoc): Promise<BusinessDoc> {
    const { error: snapErr } = await supabase.from("business_doc_revisions").insert({
      doc_id: doc.id,
      revision: doc.revision,
      number: doc.number,
      model: doc.model as unknown as Json,
      header_override: (doc.header_override ?? null) as unknown as Json,
      footer_override: (doc.footer_override ?? null) as unknown as Json,
    });
    if (snapErr) throw snapErr;

    const next = doc.revision + 1;
    const number = doc.number.replace(/-R\d+$/i, "") + `-R${String(next).padStart(2, "0")}`;
    const { data, error } = await supabase
      .from("business_docs")
      .update({ revision: next, number })
      .eq("id", doc.id)
      .select("*")
      .single();
    if (error) throw error;
    return hydrate(data);
  },

  async setStatus(id: string, status: DocStatus): Promise<void> {
    const { error } = await supabase.from("business_docs").update({ status }).eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("business_docs").delete().eq("id", id);
    if (error) throw error;
  },

  /** Duplicate a document as a fresh draft with a brand-new number. */
  async duplicate(doc: BusinessDoc): Promise<BusinessDoc> {
    const { data: number, error: numErr } = await supabase.rpc("next_doc_number", { _type: doc.doc_type });
    if (numErr) throw numErr;
    const { data, error } = await supabase
      .from("business_docs")
      .insert({
        doc_type: doc.doc_type,
        number: number as unknown as string,
        revision: 1,
        title: doc.title,
        client: doc.client as unknown as Json,
        lang: doc.lang,
        theme: doc.theme,
        currency: doc.currency,
        model: doc.model as unknown as Json,
        header_override: (doc.header_override ?? null) as unknown as Json,
        footer_override: (doc.footer_override ?? null) as unknown as Json,
        status: "draft" as DocStatus,
        issue_date: today(),
        valid_until: doc.valid_until,
      })
      .select("*")
      .single();
    if (error) throw error;
    return hydrate(data);
  },
};

export const DOC_STATUS_LABELS: Record<DocStatus, { ar: string; en: string; color: string }> = {
  draft: { ar: "مسودة", en: "Draft", color: "#94A3B8" },
  sent: { ar: "مُرسل", en: "Sent", color: "#42C2EE" },
  accepted: { ar: "مقبول", en: "Accepted", color: "#22C55E" },
  rejected: { ar: "مرفوض", en: "Rejected", color: "#EF4444" },
  void: { ar: "ملغى", en: "Void", color: "#F59E0B" },
};
