// Types + helpers for the admin notes system.
// Uses casted supabase queries because the generated types file has not yet
// been regenerated with the new tables.

import { supabase } from "@/integrations/supabase/client";

export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const anyE = e as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown };
    if (typeof anyE.message === "string") return anyE.message;
    if (typeof anyE.error_description === "string") return anyE.error_description;
    if (typeof anyE.details === "string") return anyE.details;
    if (typeof anyE.hint === "string") return anyE.hint;
    try { return JSON.stringify(e); } catch { return "Unknown error"; }
  }
  return String(e);
}

export type NoteColor = "default" | "yellow" | "pink" | "blue" | "green" | "orange" | "purple";

export const NOTE_COLORS: { key: NoteColor; bg: string; border: string; label: string }[] = [
  { key: "default", bg: "var(--surface-2)", border: "var(--border)", label: "colorDefault" },
  { key: "yellow", bg: "#3D3520", border: "#8B7A3C", label: "colorYellow" },
  { key: "pink",   bg: "#3D2130", border: "#B85A7F", label: "colorPink" },
  { key: "blue",   bg: "#1E2E44", border: "#3B82F6", label: "colorBlue" },
  { key: "green",  bg: "#1F3A2C", border: "#50C878", label: "colorGreen" },
  { key: "orange", bg: "#3D2A18", border: "#E58234", label: "colorOrange" },
  { key: "purple", bg: "#2C1F3D", border: "#8B5CF6", label: "colorPurple" },
];

export function colorPalette(color: NoteColor): { bg: string; border: string } {
  const c = NOTE_COLORS.find((c) => c.key === color) ?? NOTE_COLORS[0];
  return { bg: c.bg, border: c.border };
}

export type Note = {
  id: string;
  owner_id: string;
  title: string;
  content_html: string;
  content_text: string;
  folder_id: string | null;
  color: NoteColor;
  is_pinned: boolean;
  is_favorite: boolean;
  emoji: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteComment = {
  id: string;
  note_id: string;
  author_id: string;
  body: string;
  resolved: boolean;
  created_at: string;
};

export type NoteFolder = {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type NoteTag = {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type NoteShare = {
  note_id: string;
  shared_with_user_id: string;
  created_at: string;
};

export type NoteAttachment = {
  id: string;
  note_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
};

// Cast helpers around supabase - the generated types file lacks these tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function listNotes(): Promise<Note[]> {
  const { data, error } = await db.from("notes").select("*").order("is_pinned", { ascending: false }).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function getNote(id: string): Promise<Note | null> {
  const { data, error } = await db.from("notes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Note | null;
}

export async function createNote(ownerId: string): Promise<Note> {
  const { data, error } = await db.from("notes").insert({ owner_id: ownerId, title: "", content_html: "", content_text: "", color: "default", is_pinned: false }).select("*").single();
  if (error) throw error;
  return data as Note;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  const { error } = await db.from("notes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export async function listFolders(): Promise<NoteFolder[]> {
  const { data, error } = await db.from("note_folders").select("*").order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as NoteFolder[];
}

export async function createFolder(ownerId: string, name: string): Promise<NoteFolder> {
  const { data, error } = await db.from("note_folders").insert({ owner_id: ownerId, name }).select("*").single();
  if (error) throw error;
  return data as NoteFolder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await db.from("note_folders").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await db.from("note_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function listTags(): Promise<NoteTag[]> {
  const { data, error } = await db.from("note_tags").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as NoteTag[];
}

export async function createTag(ownerId: string, name: string, color = "blue"): Promise<NoteTag> {
  const { data, error } = await db.from("note_tags").insert({ owner_id: ownerId, name, color }).select("*").single();
  if (error) throw error;
  return data as NoteTag;
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await db.from("note_tags").delete().eq("id", id);
  if (error) throw error;
}

export async function listNoteTagLinks(noteIds: string[]): Promise<{ note_id: string; tag_id: string }[]> {
  if (noteIds.length === 0) return [];
  const { data, error } = await db.from("note_tag_links").select("note_id,tag_id").in("note_id", noteIds);
  if (error) throw error;
  return (data ?? []) as { note_id: string; tag_id: string }[];
}

export async function setNoteTags(noteId: string, tagIds: string[]): Promise<void> {
  const { error: delErr } = await db.from("note_tag_links").delete().eq("note_id", noteId);
  if (delErr) throw delErr;
  if (tagIds.length > 0) {
    const rows = tagIds.map((tag_id) => ({ note_id: noteId, tag_id }));
    const { error } = await db.from("note_tag_links").insert(rows);
    if (error) throw error;
  }
}

export async function listShares(noteId: string): Promise<NoteShare[]> {
  const { data, error } = await db.from("note_shares").select("*").eq("note_id", noteId);
  if (error) throw error;
  return (data ?? []) as NoteShare[];
}

export async function setNoteShares(noteId: string, userIds: string[]): Promise<void> {
  const { error: delErr } = await db.from("note_shares").delete().eq("note_id", noteId);
  if (delErr) throw delErr;
  if (userIds.length > 0) {
    const rows = userIds.map((u) => ({ note_id: noteId, shared_with_user_id: u }));
    const { error } = await db.from("note_shares").insert(rows);
    if (error) throw error;
  }
}

export async function listAttachments(noteId: string): Promise<NoteAttachment[]> {
  const { data, error } = await db.from("note_attachments").select("*").eq("note_id", noteId).order("created_at");
  if (error) throw error;
  return (data ?? []) as NoteAttachment[];
}

export async function uploadAttachment(ownerId: string, noteId: string, file: File): Promise<NoteAttachment> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${ownerId}/${noteId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("note-attachments").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data, error } = await db.from("note_attachments").insert({
    note_id: noteId,
    file_path: path,
    file_name: file.name,
    mime_type: file.type,
    size: file.size,
  }).select("*").single();
  if (error) throw error;
  return data as NoteAttachment;
}

export async function deleteAttachment(att: NoteAttachment): Promise<void> {
  await supabase.storage.from("note-attachments").remove([att.file_path]);
  const { error } = await db.from("note_attachments").delete().eq("id", att.id);
  if (error) throw error;
}

export async function signedAttachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("note-attachments").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Strip HTML tags to build a plain-text search index. */
export function htmlToPlain(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function preview(text: string, len = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len) + "…" : t;
}

// ─── Comments ────────────────────────────────────────────────
export async function listComments(noteId: string): Promise<NoteComment[]> {
  const { data, error } = await db.from("note_comments").select("*").eq("note_id", noteId).order("created_at");
  if (error) throw error;
  return (data ?? []) as NoteComment[];
}
export async function addComment(noteId: string, authorId: string, body: string): Promise<NoteComment> {
  const { data, error } = await db.from("note_comments").insert({ note_id: noteId, author_id: authorId, body }).select("*").single();
  if (error) throw error;
  return data as NoteComment;
}
export async function resolveComment(id: string, resolved: boolean): Promise<void> {
  const { error } = await db.from("note_comments").update({ resolved }).eq("id", id);
  if (error) throw error;
}
export async function deleteComment(id: string): Promise<void> {
  const { error } = await db.from("note_comments").delete().eq("id", id);
  if (error) throw error;
}

// ─── Cover image ─────────────────────────────────────────────
export async function uploadCover(ownerId: string, noteId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${ownerId}/${noteId}/cover-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("note-attachments").upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) throw upErr;
  const { data } = await supabase.storage.from("note-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? "";
}

