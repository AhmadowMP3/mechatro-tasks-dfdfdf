import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  listNotes, listFolders, listTags, listNoteTagLinks, createNote, updateNote, deleteNote,
  createFolder, renameFolder, deleteFolder, createTag, setNoteTags, htmlToPlain, countWords, preview,
  listAttachments, uploadAttachment, deleteAttachment, signedAttachmentUrl, errMsg,
  NOTE_COLORS, colorPalette,
  type Note, type NoteFolder, type NoteTag, type NoteColor, type NoteAttachment,
} from "@/lib/notes";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { ShareNoteModal } from "@/components/notes/ShareNoteModal";
import { PromptHost, openPrompt, openConfirm } from "@/components/notes/PromptDialog";
import { exportNoteToPdf } from "@/lib/notes-pdf";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import {
  Plus, Search, Pin, PinOff, Trash2, Share2, FileDown, Folder as FolderIcon,
  FolderPlus, Palette, Tag as TagIcon, X, Paperclip, Image as ImageIcon,
  StickyNote, Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/notes")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase.from("profiles").select("role,is_master_admin").eq("id", data.user.id).maybeSingle();
    const ok = prof?.is_master_admin || prof?.role === "admin";
    if (!ok) throw redirect({ to: "/" });
  },
  component: NotesPage,
});

type FilterKey = "all" | "pinned" | "shared" | `folder:${string}`;



function NotesPage() {
  const { user, lang, t } = useApp();
  const isAr = lang === "ar";
  const userId = user?.id ?? "";

  // Data
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [tagLinks, setTagLinks] = useState<{ note_id: string; tag_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & UI
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [colorMenu, setColorMenu] = useState(false);
  const [tagMenu, setTagMenu] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [attachUrls, setAttachUrls] = useState<Record<string, string>>({});
  const imageFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showList, setShowList] = useState(true); // mobile toggle

  // Autosave tracking
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const draftRef = useRef<{ title: string; html: string; text: string } | null>(null);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);
  const isOwner = selectedNote?.owner_id === userId;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [n, f, tg] = await Promise.all([listNotes(), listFolders(), listTags()]);
      setNotes(n);
      setFolders(f);
      setTags(tg);
      const links = await listNoteTagLinks(n.map((x) => x.id));
      setTagLinks(links);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Load attachments when note changes
  useEffect(() => {
    if (!selectedId) { setAttachments([]); setAttachUrls({}); return; }
    (async () => {
      try {
        const a = await listAttachments(selectedId);
        setAttachments(a);
        const urls: Record<string, string> = {};
        for (const att of a) {
          const u = await signedAttachmentUrl(att.file_path);
          if (u) urls[att.id] = u;
        }
        setAttachUrls(urls);
      } catch {
        setAttachments([]);
      }
    })();
  }, [selectedId]);

  // Autosave (debounced)
  useEffect(() => {
    if (!dirty || !selectedId || !isOwner) return;
    const t = setTimeout(async () => {
      const d = draftRef.current;
      if (!d) return;
      setSaving(true);
      try {
        await updateNote(selectedId, { title: d.title, content_html: d.html, content_text: d.text });
        setNotes((cur) => cur.map((n) => n.id === selectedId ? { ...n, title: d.title, content_html: d.html, content_text: d.text, updated_at: new Date().toISOString() } : n));
        setSavedAt(new Date());
        setDirty(false);
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [dirty, selectedId, isOwner]);

  const onCreate = async () => {
    if (!userId) return;
    try {
      const n = await createNote(userId);
      setNotes((cur) => [n, ...cur]);
      setSelectedId(n.id);
      setShowList(false);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onDelete = async () => {
    if (!selectedNote || !isOwner) return;
    if (!window.confirm(t("confirmDeleteNote"))) return;
    try {
      await deleteNote(selectedNote.id);
      setNotes((cur) => cur.filter((n) => n.id !== selectedNote.id));
      setSelectedId(null);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onTogglePin = async () => {
    if (!selectedNote || !isOwner) return;
    try {
      const nv = !selectedNote.is_pinned;
      await updateNote(selectedNote.id, { is_pinned: nv });
      setNotes((cur) => cur.map((n) => n.id === selectedNote.id ? { ...n, is_pinned: nv } : n));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onSetColor = async (color: NoteColor) => {
    if (!selectedNote || !isOwner) return;
    try {
      await updateNote(selectedNote.id, { color });
      setNotes((cur) => cur.map((n) => n.id === selectedNote.id ? { ...n, color } : n));
      setColorMenu(false);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onSetFolder = async (folderId: string | null) => {
    if (!selectedNote || !isOwner) return;
    try {
      await updateNote(selectedNote.id, { folder_id: folderId });
      setNotes((cur) => cur.map((n) => n.id === selectedNote.id ? { ...n, folder_id: folderId } : n));
      setFolderMenu(false);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onCreateFolder = async () => {
    const name = await openPrompt({ title: t("newFolder"), placeholder: t("newFolder") });
    if (!name?.trim() || !userId) return;
    try {
      const f = await createFolder(userId, name.trim());
      setFolders((cur) => [...cur, f].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onRenameFolder = async (f: NoteFolder) => {
    const name = await openPrompt({ title: t("renameFolder"), defaultValue: f.name });
    if (!name?.trim()) return;
    try {
      await renameFolder(f.id, name.trim());
      setFolders((cur) => cur.map((x) => x.id === f.id ? { ...x, name: name.trim() } : x));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onDeleteFolder = async (f: NoteFolder) => {
    const ok = await openConfirm(t("deleteFolder") + "؟", { destructive: true });
    if (!ok) return;
    try {
      await deleteFolder(f.id);
      setFolders((cur) => cur.filter((x) => x.id !== f.id));
      setNotes((cur) => cur.map((n) => n.folder_id === f.id ? { ...n, folder_id: null } : n));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const noteTagIds = useMemo(() => new Set(tagLinks.filter((l) => l.note_id === selectedId).map((l) => l.tag_id)), [tagLinks, selectedId]);

  const onToggleTag = async (tag: NoteTag) => {
    if (!selectedNote || !isOwner) return;
    const has = noteTagIds.has(tag.id);
    const next = has ? Array.from(noteTagIds).filter((x) => x !== tag.id) : [...Array.from(noteTagIds), tag.id];
    try {
      await setNoteTags(selectedNote.id, next);
      setTagLinks((cur) => [
        ...cur.filter((l) => l.note_id !== selectedNote.id),
        ...next.map((tag_id) => ({ note_id: selectedNote.id, tag_id })),
      ]);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onCreateTag = async () => {
    const name = await openPrompt({ title: t("newTag"), placeholder: t("newTag") });
    if (!name?.trim() || !userId) return;
    try {
      const tag = await createTag(userId, name.trim());
      setTags((cur) => [...cur, tag].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onUploadImage = async (file: File) => {
    if (!selectedNote || !isOwner || !userId) return;
    try {
      const att = await uploadAttachment(userId, selectedNote.id, file);
      setAttachments((cur) => [...cur, att]);
      const url = await signedAttachmentUrl(att.file_path);
      if (url && editor) {
        setAttachUrls((cur) => ({ ...cur, [att.id]: url }));
        editor.chain().focus().setImage({ src: url, alt: att.file_name }).run();
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onUploadFile = async (file: File) => {
    if (!selectedNote || !isOwner || !userId) return;
    try {
      const att = await uploadAttachment(userId, selectedNote.id, file);
      setAttachments((cur) => [...cur, att]);
      const url = await signedAttachmentUrl(att.file_path);
      if (url) setAttachUrls((cur) => ({ ...cur, [att.id]: url }));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onDeleteAttachment = async (att: NoteAttachment) => {
    if (!isOwner) return;
    try {
      await deleteAttachment(att);
      setAttachments((cur) => cur.filter((a) => a.id !== att.id));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const onExportPdf = async () => {
    if (!selectedNote) return;
    try {
      const author = user?.full_name ?? "";
      const folder = folders.find((f) => f.id === selectedNote.folder_id)?.name ?? null;
      const noteTags = tags.filter((tag) => noteTagIds.has(tag.id));
      await exportNoteToPdf({ note: selectedNote, authorName: author, folderName: folder, tags: noteTags, lang });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let list = notes;
    if (filter === "pinned") list = list.filter((n) => n.is_pinned);
    else if (filter === "shared") list = list.filter((n) => n.owner_id !== userId);
    else if (filter.startsWith("folder:")) {
      const fid = filter.slice(7);
      list = list.filter((n) => n.folder_id === fid);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(q) || n.content_text.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [notes, filter, search, userId]);

  const currentNoteTags = tags.filter((tag) => noteTagIds.has(tag.id));
  const palette = selectedNote ? colorPalette(selectedNote.color) : { bg: "var(--surface-2)", border: "var(--border)" };

  return (
    <div style={{ display: "flex", height: "calc(100dvh - 56px)", background: "var(--background)" }}>
      {/* LEFT PANE — LIST */}
      <aside style={{
        width: 320, flexShrink: 0,
        display: (showList ? "flex" : "none"),
        flexDirection: "column",
        borderInlineEnd: "1px solid var(--border)",
        background: "var(--surface)",
      }} className="notes-list-pane">
        <div style={{ padding: "14px 14px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <StickyNote size={20} /> {t("notes")}
          </div>
          <button onClick={onCreate} aria-label={t("newNote")} title={t("newNote")} style={{
            width: 36, height: 36, borderRadius: 10, background: "var(--grad-blue)",
            border: "none", color: "#fff", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(59,130,246,.4)",
          }}>
            <Plus size={18} />
          </button>
        </div>

        <div style={{ padding: "0 14px 10px", position: "relative" }}>
          <Search size={14} style={{ position: "absolute", top: 11, insetInlineStart: 24, color: "var(--muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchNotes")}
            style={{
              width: "100%", padding: "8px 12px 8px 34px",
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: 10, color: "var(--foreground)", fontSize: 13,
              outline: "none",
              paddingInlineStart: 34, paddingInlineEnd: 12,
            }}
          />
        </div>

        {/* FILTERS */}
        <div style={{ padding: "0 10px 8px" }}>
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} icon={<StickyNote size={14} />} label={t("allNotes")} count={notes.length} />
          <FilterButton active={filter === "pinned"} onClick={() => setFilter("pinned")} icon={<Pin size={14} />} label={t("pinnedNotes")} count={notes.filter((n) => n.is_pinned).length} />
          <FilterButton active={filter === "shared"} onClick={() => setFilter("shared")} icon={<Users size={14} />} label={t("sharedWithMe")} count={notes.filter((n) => n.owner_id !== userId).length} />
        </div>

        {/* FOLDERS */}
        <div style={{ padding: "6px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>
            {t("folders")}
          </div>
          <button onClick={onCreateFolder} aria-label={t("newFolder")} title={t("newFolder")} style={{
            background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4,
          }}>
            <FolderPlus size={14} />
          </button>
        </div>
        <div style={{ padding: "0 10px 8px" }}>
          {folders.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => setFilter(`folder:${f.id}`)}
                style={{
                  flex: 1, textAlign: isAr ? "right" : "left",
                  padding: "6px 10px", background: filter === `folder:${f.id}` ? "rgba(59,130,246,.12)" : "transparent",
                  border: "none", borderRadius: 8, color: "var(--foreground)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                }}
              >
                <FolderIcon size={13} /> <span style={{ flex: 1, textAlign: isAr ? "right" : "left" }}>{f.name}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{notes.filter((n) => n.folder_id === f.id).length}</span>
              </button>
              <button onClick={() => onRenameFolder(f)} aria-label={t("renameFolder")} title={t("renameFolder")} style={iconBtn}>✎</button>
              <button onClick={() => onDeleteFolder(f)} aria-label={t("deleteFolder")} title={t("deleteFolder")} style={iconBtn}>✕</button>
            </div>
          ))}
        </div>

        {/* NOTES LIST */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 20px" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>…</div>
          ) : filteredNotes.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              {search.trim() ? (isAr ? "لا نتائج" : "No matches") : t("noNotesYet")}
            </div>
          ) : filteredNotes.map((n) => {
            const active = n.id === selectedId;
            const p = colorPalette(n.color);
            const shared = n.owner_id !== userId;
            return (
              <button
                key={n.id}
                onClick={() => { setSelectedId(n.id); setShowList(false); }}
                style={{
                  width: "100%", textAlign: isAr ? "right" : "left",
                  padding: "10px 12px", marginBottom: 4, borderRadius: 10,
                  background: active ? "var(--grad-blue)" : p.bg,
                  border: "1px solid " + (active ? "transparent" : p.border),
                  color: active ? "#fff" : "var(--foreground)",
                  cursor: "pointer", display: "block",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {n.is_pinned && <Pin size={11} style={{ transform: "rotate(45deg)", flexShrink: 0 }} />}
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.title || t("untitledNote")}
                  </span>
                  {shared && <Users size={11} style={{ opacity: 0.7 }} />}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview(n.content_text || "", 60) || (isAr ? "فارغة" : "Empty")}
                </div>
                <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 4 }}>
                  {new Date(n.updated_at).toLocaleDateString(isAr ? "ar" : "en-GB", { day: "2-digit", month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* RIGHT PANE — EDITOR */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: palette.bg, transition: "background .2s" }}>
        {!selectedNote ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--muted)" }}>
            <StickyNote size={48} strokeWidth={1.4} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t("selectOrCreateNote")}</div>
            <button onClick={onCreate} style={{
              padding: "10px 20px", background: "var(--grad-blue)", color: "#fff",
              border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              <Plus size={16} /> {t("newNote")}
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setShowList(true)} className="notes-back-btn" style={{
                background: "transparent", border: "1px solid var(--border)", borderRadius: 8,
                padding: "6px 10px", color: "var(--foreground)", cursor: "pointer", fontSize: 12,
              }}>← {isAr ? "القائمة" : "List"}</button>

              <input
                value={selectedNote.title}
                readOnly={!isOwner}
                onChange={(e) => {
                  const v = e.target.value;
                  setNotes((cur) => cur.map((n) => n.id === selectedNote.id ? { ...n, title: v } : n));
                  draftRef.current = {
                    title: v,
                    html: draftRef.current?.html ?? selectedNote.content_html,
                    text: draftRef.current?.text ?? selectedNote.content_text,
                  };
                  setDirty(true);
                }}
                placeholder={t("untitledNote")}
                style={{
                  flex: 1, minWidth: 200, background: "transparent", border: "none",
                  fontSize: 18, fontWeight: 800, color: "var(--foreground)", outline: "none",
                  padding: "4px 0",
                }}
              />

              {!isOwner && <span style={{
                fontSize: 10.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
                background: "rgba(212,175,55,.15)", color: "#D4AF37", border: "1px solid rgba(212,175,55,.35)",
              }}>{t("readOnlyBadge")}</span>}

              {isOwner && (
                <>
                  <ToolButton onClick={onTogglePin} title={selectedNote.is_pinned ? t("unpinNote") : t("pinNote")}>
                    {selectedNote.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </ToolButton>
                  <div style={{ position: "relative" }}>
                    <ToolButton onClick={() => { setColorMenu((s) => !s); setTagMenu(false); setFolderMenu(false); }} title={t("noteColor")}>
                      <Palette size={16} />
                    </ToolButton>
                    {colorMenu && (
                      <Popover onClose={() => setColorMenu(false)}>
                        <div style={{ display: "flex", gap: 6, padding: 8 }}>
                          {NOTE_COLORS.map((c) => (
                            <button key={c.key} onClick={() => onSetColor(c.key)} aria-label={t(c.label as never)} title={t(c.label as never)}
                              style={{
                                width: 24, height: 24, borderRadius: 999,
                                background: c.bg, border: "2px solid " + (selectedNote.color === c.key ? "#3B82F6" : c.border),
                                cursor: "pointer",
                              }}
                            />
                          ))}
                        </div>
                      </Popover>
                    )}
                  </div>
                  <div style={{ position: "relative" }}>
                    <ToolButton onClick={() => { setFolderMenu((s) => !s); setColorMenu(false); setTagMenu(false); }} title={t("folders")}>
                      <FolderIcon size={16} />
                    </ToolButton>
                    {folderMenu && (
                      <Popover onClose={() => setFolderMenu(false)}>
                        <div style={{ padding: 6, minWidth: 180 }}>
                          <MenuItem active={selectedNote.folder_id === null} onClick={() => onSetFolder(null)}>{t("noFolder")}</MenuItem>
                          {folders.map((f) => (
                            <MenuItem key={f.id} active={selectedNote.folder_id === f.id} onClick={() => onSetFolder(f.id)}>{f.name}</MenuItem>
                          ))}
                        </div>
                      </Popover>
                    )}
                  </div>
                  <div style={{ position: "relative" }}>
                    <ToolButton onClick={() => { setTagMenu((s) => !s); setColorMenu(false); setFolderMenu(false); }} title={t("tags")}>
                      <TagIcon size={16} />
                    </ToolButton>
                    {tagMenu && (
                      <Popover onClose={() => setTagMenu(false)}>
                        <div style={{ padding: 6, minWidth: 200 }}>
                          {tags.map((tag) => (
                            <MenuItem key={tag.id} active={noteTagIds.has(tag.id)} onClick={() => onToggleTag(tag)}>
                              # {tag.name}
                            </MenuItem>
                          ))}
                          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                          <MenuItem onClick={onCreateTag}><Plus size={12} style={{ display: "inline", marginInlineEnd: 4 }} /> {t("newTag")}</MenuItem>
                        </div>
                      </Popover>
                    )}
                  </div>
                  <ToolButton onClick={() => setShareOpen(true)} title={t("shareNote")}>
                    <Share2 size={16} />
                  </ToolButton>
                </>
              )}

              <ToolButton onClick={onExportPdf} title={t("exportNotePdf")}>
                <FileDown size={16} />
              </ToolButton>

              {isOwner && (
                <ToolButton onClick={onDelete} title={t("deleteNote")} danger>
                  <Trash2 size={16} />
                </ToolButton>
              )}
            </div>

            {/* Tags row */}
            {currentNoteTags.length > 0 && (
              <div style={{ padding: "6px 20px", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid var(--border)" }}>
                {currentNoteTags.map((tag) => (
                  <span key={tag.id} style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                    background: "rgba(59,130,246,.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,.3)",
                  }}>#{tag.name}</span>
                ))}
              </div>
            )}

            {/* Editor */}
            <NoteEditor
              content={selectedNote.content_html}
              editable={isOwner}
              onEditor={setEditor}
              onInsertImageClick={() => imageFileRef.current?.click()}
              onChange={(html, text) => {
                draftRef.current = { title: selectedNote.title, html, text };
                setDirty(true);
              }}
            />

            {/* Attachments */}
            {attachments.length > 0 && (
              <div style={{ padding: "8px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", marginBottom: 6, letterSpacing: ".1em", textTransform: "uppercase" }}>
                  {t("attachments")} ({attachments.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {attachments.map((a) => {
                    const url = attachUrls[a.id];
                    const isImg = a.mime_type?.startsWith("image/");
                    return (
                      <div key={a.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--border)",
                        borderRadius: 8, fontSize: 12,
                      }}>
                        {isImg ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--foreground)", textDecoration: "none", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</a>
                        {isOwner && (
                          <button onClick={() => onDeleteAttachment(a)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding: "8px 20px", borderTop: "1px solid var(--border)", background: "var(--surface)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 11.5, color: "var(--muted)", gap: 8, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span>{countWords(selectedNote.content_text)} {t("words")}</span>
                <span>{selectedNote.content_text.length} {t("characters")}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {isOwner && (
                  <>
                    <button onClick={() => fileRef.current?.click()} style={miniBtn}>
                      <Paperclip size={11} /> {t("attachFile")}
                    </button>
                    <input ref={imageFileRef} type="file" accept="image/*" hidden onChange={(e) => {
                      const f = e.target.files?.[0]; if (f) void onUploadImage(f);
                      e.target.value = "";
                    }} />
                    <input ref={fileRef} type="file" hidden onChange={(e) => {
                      const f = e.target.files?.[0]; if (f) void onUploadFile(f);
                      e.target.value = "";
                    }} />
                  </>
                )}
                <span>
                  {saving ? t("saving") : savedAt ? t("savedJustNow") : `${t("lastEdited")}: ${new Date(selectedNote.updated_at).toLocaleTimeString(isAr ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {shareOpen && selectedNote && <ShareNoteModal noteId={selectedNote.id} onClose={() => setShareOpen(false)} />}

      <style>{`
        @media (max-width: 768px) {
          .notes-list-pane { width: 100% !important; }
          .notes-back-btn { display: inline-flex !important; }
        }
        @media (min-width: 769px) {
          .notes-back-btn { display: none !important; }
          .notes-list-pane { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

function FilterButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  const { lang } = useApp();
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "8px 10px", marginBottom: 2,
      background: active ? "rgba(59,130,246,.15)" : "transparent",
      border: "1px solid " + (active ? "rgba(59,130,246,.3)" : "transparent"),
      borderRadius: 8, color: "var(--foreground)", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600,
      textAlign: lang === "ar" ? "right" : "left",
    }}>
      {icon}
      <span style={{ flex: 1, textAlign: lang === "ar" ? "right" : "left" }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{count}</span>
    </button>
  );
}

function ToolButton({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: 34, height: 34, borderRadius: 8, background: "transparent",
      border: "1px solid var(--border)",
      color: danger ? "#F0676A" : "var(--foreground)",
      cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {children}
    </button>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-popover-content]")) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div data-popover-content style={{
      position: "absolute", top: "100%", insetInlineEnd: 0, marginTop: 4,
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,.3)", zIndex: 20, minWidth: 160,
    }}>
      {children}
    </div>
  );
}

function MenuItem({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "7px 10px", background: active ? "rgba(59,130,246,.15)" : "transparent",
      border: "none", borderRadius: 6, color: "var(--foreground)", cursor: "pointer",
      display: "block", textAlign: "start", fontSize: 13,
    }}>
      {children}
    </button>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent", border: "none", color: "var(--muted)",
  cursor: "pointer", padding: "4px 6px", fontSize: 11, borderRadius: 4,
};

const miniBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--foreground)", cursor: "pointer",
  padding: "4px 8px", borderRadius: 6, fontSize: 11,
};
