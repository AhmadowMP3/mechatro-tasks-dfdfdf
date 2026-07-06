import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  listNotes, listFolders, listTags, listNoteTagLinks, createNote, updateNote, deleteNote,
  createFolder, renameFolder, deleteFolder, createTag, setNoteTags,
  listAttachments, uploadAttachment, deleteAttachment, signedAttachmentUrl,
  uploadCover, errMsg, countWords, preview, colorPalette,
  type Note, type NoteFolder, type NoteTag, type NoteAttachment,
} from "@/lib/notes";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { ShareNoteModal } from "@/components/notes/ShareNoteModal";
import { PromptHost, openPrompt, openConfirm } from "@/components/notes/PromptDialog";
import { TemplatesPopup } from "@/components/notes/TemplatesPopup";
import { AiMenu } from "@/components/notes/AiMenu";
import { CommentsPanel } from "@/components/notes/CommentsPanel";
import { HomeDashboard } from "@/components/notes/HomeDashboard";
import { exportNoteToPdf } from "@/lib/notes-pdf";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import {
  Plus, Search, Pin, PinOff, Trash2, Share2, FileDown, Folder as FolderIcon,
  FolderPlus, Tag as TagIcon, X, StickyNote, Users, Star, ImagePlus,
  Smile, MessageSquare, Sparkles, ArrowLeft, MoreHorizontal, Camera,
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

type FilterKey = "all" | "favorites" | "pinned" | "shared" | `folder:${string}` | `tag:${string}`;

const QUICK_EMOJIS = ["📝", "💡", "🚀", "⭐", "📌", "🎯", "🔥", "📊", "✅", "💬", "📁", "🧠"];

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
  const [tagMenu, setTagMenu] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [emojiMenu, setEmojiMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [attachUrls, setAttachUrls] = useState<Record<string, string>>({});
  const imageFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      } catch { setAttachments([]); }
    })();
  }, [selectedId]);

  // Autosave (debounced)
  useEffect(() => {
    if (!dirty || !selectedId || !isOwner) return;
    const timer = setTimeout(async () => {
      const d = draftRef.current;
      if (!d) return;
      setSaving(true);
      try {
        await updateNote(selectedId, { title: d.title, content_html: d.html, content_text: d.text });
        setNotes((cur) => cur.map((n) => n.id === selectedId ? { ...n, title: d.title, content_html: d.html, content_text: d.text, updated_at: new Date().toISOString() } : n));
        setSavedAt(new Date());
        setDirty(false);
      } catch (e) { toast.error(errMsg(e)); }
      finally { setSaving(false); }
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, selectedId, isOwner]);

  const patchNote = (id: string, patch: Partial<Note>) => {
    setNotes((cur) => cur.map((n) => n.id === id ? { ...n, ...patch } : n));
  };

  const onCreate = async () => {
    if (!userId) return;
    try {
      const n = await createNote(userId);
      setNotes((cur) => [n, ...cur]);
      setSelectedId(n.id);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onDelete = async () => {
    if (!selectedNote || !isOwner) return;
    const ok = await openConfirm(t("confirmDeleteNote"), { destructive: true });
    if (!ok) return;
    try {
      await deleteNote(selectedNote.id);
      setNotes((cur) => cur.filter((n) => n.id !== selectedNote.id));
      setSelectedId(null);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onTogglePin = async () => {
    if (!selectedNote || !isOwner) return;
    try {
      const nv = !selectedNote.is_pinned;
      await updateNote(selectedNote.id, { is_pinned: nv });
      patchNote(selectedNote.id, { is_pinned: nv });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onToggleFavorite = async () => {
    if (!selectedNote || !isOwner) return;
    try {
      const nv = !selectedNote.is_favorite;
      await updateNote(selectedNote.id, { is_favorite: nv });
      patchNote(selectedNote.id, { is_favorite: nv });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onSetEmoji = async (emoji: string | null) => {
    if (!selectedNote || !isOwner) return;
    try {
      await updateNote(selectedNote.id, { emoji });
      patchNote(selectedNote.id, { emoji });
      setEmojiMenu(false);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onSetFolder = async (folderId: string | null) => {
    if (!selectedNote || !isOwner) return;
    try {
      await updateNote(selectedNote.id, { folder_id: folderId });
      patchNote(selectedNote.id, { folder_id: folderId });
      setFolderMenu(false);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onCreateFolder = async () => {
    const name = await openPrompt({ title: t("newFolder"), placeholder: t("newFolder") });
    if (!name?.trim() || !userId) return;
    try {
      const f = await createFolder(userId, name.trim());
      setFolders((cur) => [...cur, f].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onRenameFolder = async (f: NoteFolder) => {
    const name = await openPrompt({ title: t("renameFolder"), defaultValue: f.name });
    if (!name?.trim()) return;
    try {
      await renameFolder(f.id, name.trim());
      setFolders((cur) => cur.map((x) => x.id === f.id ? { ...x, name: name.trim() } : x));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onDeleteFolder = async (f: NoteFolder) => {
    const ok = await openConfirm(t("deleteFolder") + "؟", { destructive: true });
    if (!ok) return;
    try {
      await deleteFolder(f.id);
      setFolders((cur) => cur.filter((x) => x.id !== f.id));
      setNotes((cur) => cur.map((n) => n.folder_id === f.id ? { ...n, folder_id: null } : n));
    } catch (e) { toast.error(errMsg(e)); }
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
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onCreateTag = async () => {
    const name = await openPrompt({ title: t("newTag"), placeholder: t("newTag") });
    if (!name?.trim() || !userId) return;
    try {
      const tag = await createTag(userId, name.trim());
      setTags((cur) => [...cur, tag].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { toast.error(errMsg(e)); }
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
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onUploadCover = async (file: File) => {
    if (!selectedNote || !isOwner || !userId) return;
    try {
      const url = await uploadCover(userId, selectedNote.id, file);
      await updateNote(selectedNote.id, { cover_url: url });
      patchNote(selectedNote.id, { cover_url: url });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onRemoveCover = async () => {
    if (!selectedNote || !isOwner) return;
    try {
      await updateNote(selectedNote.id, { cover_url: null });
      patchNote(selectedNote.id, { cover_url: null });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onDeleteAttachment = async (att: NoteAttachment) => {
    if (!isOwner) return;
    try {
      await deleteAttachment(att);
      setAttachments((cur) => cur.filter((a) => a.id !== att.id));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onExportPdf = async () => {
    if (!selectedNote) return;
    try {
      const author = user?.full_name ?? "";
      const folder = folders.find((f) => f.id === selectedNote.folder_id)?.name ?? null;
      const noteTags = tags.filter((tag) => noteTagIds.has(tag.id));
      await exportNoteToPdf({ note: selectedNote, authorName: author, folderName: folder, tags: noteTags, lang });
    } catch (e) { toast.error(errMsg(e)); }
  };

  // Filter and sort
  const filteredNotes = useMemo(() => {
    let list = notes;
    if (filter === "favorites") list = list.filter((n) => n.is_favorite);
    else if (filter === "pinned") list = list.filter((n) => n.is_pinned);
    else if (filter === "shared") list = list.filter((n) => n.owner_id !== userId);
    else if (filter.startsWith("folder:")) {
      const fid = filter.slice(7);
      list = list.filter((n) => n.folder_id === fid);
    } else if (filter.startsWith("tag:")) {
      const tid = filter.slice(4);
      const set = new Set(tagLinks.filter((l) => l.tag_id === tid).map((l) => l.note_id));
      list = list.filter((n) => set.has(n.id));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) =>
        n.title.toLowerCase().includes(q)
        || n.content_text.toLowerCase().includes(q)
        || (n.emoji ?? "").includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [notes, filter, search, userId, tagLinks]);

  const currentNoteTags = tags.filter((tag) => noteTagIds.has(tag.id));
  const palette = selectedNote ? colorPalette(selectedNote.color) : { bg: "var(--background)", border: "var(--border)" };

  return (
    <div style={{ display: "flex", height: "calc(100dvh - 56px)", background: "var(--background)" }}>
      {/* ─────────── SIDEBAR ─────────── */}
      <aside style={{
        width: sidebarOpen ? 260 : 0,
        flexShrink: 0,
        display: sidebarOpen ? "flex" : "none",
        flexDirection: "column",
        borderInlineEnd: "1px solid var(--border)",
        background: "var(--surface)",
      }} className="notes-sidebar">
        <div style={{ padding: "14px 14px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <StickyNote size={18} /> {t("notes")}
          </div>
          <button
            onClick={onCreate}
            aria-label={t("newNote")}
            title={t("newNote")}
            style={{
              width: 34, height: 34, borderRadius: 10, background: "var(--grad-blue)",
              border: "none", color: "#fff", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(24,159,209,.4)",
            }}
          >
            <Plus size={18} />
          </button>
        </div>

        <div style={{ padding: "0 12px 10px", position: "relative" }}>
          <Search size={13} style={{ position: "absolute", top: 10, insetInlineStart: 22, color: "var(--muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchNotes")}
            style={{
              width: "100%", padding: "7px 10px",
              paddingInlineStart: 32, paddingInlineEnd: 10,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: 10, color: "var(--foreground)", fontSize: 12.5, outline: "none",
            }}
          />
        </div>

        <div style={{ padding: "0 10px 6px" }}>
          <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} icon={<StickyNote size={13} />} label={t("allNotesHeader")} count={notes.length} />
          <FilterBtn active={filter === "favorites"} onClick={() => setFilter("favorites")} icon={<Star size={13} />} label={t("favorites")} count={notes.filter((n) => n.is_favorite).length} />
          <FilterBtn active={filter === "pinned"} onClick={() => setFilter("pinned")} icon={<Pin size={13} />} label={t("pinnedSection")} count={notes.filter((n) => n.is_pinned).length} />
          <FilterBtn active={filter === "shared"} onClick={() => setFilter("shared")} icon={<Users size={13} />} label={t("sharedWithMe")} count={notes.filter((n) => n.owner_id !== userId).length} />
        </div>

        {/* Folders */}
        <div style={{ padding: "6px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={sectionLabel}>{t("folders")}</div>
          <button onClick={onCreateFolder} aria-label={t("newFolder")} title={t("newFolder")} style={sidebarIconBtn}>
            <FolderPlus size={13} />
          </button>
        </div>
        <div style={{ padding: "0 8px 8px" }}>
          {folders.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => setFilter(`folder:${f.id}`)}
                style={{
                  flex: 1, textAlign: isAr ? "right" : "left",
                  padding: "6px 8px",
                  background: filter === `folder:${f.id}` ? "rgba(24,159,209,.14)" : "transparent",
                  border: "none", borderRadius: 8, color: "var(--foreground)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
                }}
              >
                <FolderIcon size={12} /> <span style={{ flex: 1 }}>{f.name}</span>
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{notes.filter((n) => n.folder_id === f.id).length}</span>
              </button>
              <button onClick={() => onRenameFolder(f)} aria-label={t("renameFolder")} title={t("renameFolder")} style={sidebarIconBtn}>✎</button>
              <button onClick={() => onDeleteFolder(f)} aria-label={t("deleteFolder")} title={t("deleteFolder")} style={sidebarIconBtn}>✕</button>
            </div>
          ))}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <>
            <div style={{ padding: "6px 12px 4px" }}>
              <div style={sectionLabel}>{t("tags")}</div>
            </div>
            <div style={{ padding: "0 10px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
              {tags.map((tag) => {
                const active = filter === `tag:${tag.id}`;
                return (
                  <button
                    key={tag.id}
                    onClick={() => setFilter(active ? "all" : `tag:${tag.id}`)}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                      background: active ? "#189FD1" : "rgba(24,159,209,.14)",
                      color: active ? "#fff" : "#189FD1",
                      border: "1px solid rgba(24,159,209,.35)", cursor: "pointer",
                    }}
                  >#{tag.name}</button>
                );
              })}
            </div>
          </>
        )}

        {/* Notes list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 20px" }}>
          <div style={{ ...sectionLabel, padding: "2px 6px 6px" }}>{filter === "all" ? t("allNotesHeader") : ""}</div>
          {loading ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>…</div>
          ) : filteredNotes.length === 0 ? (
            <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
              {search.trim() ? (isAr ? "لا نتائج" : "No matches") : t("noNotesYet")}
            </div>
          ) : filteredNotes.map((n) => {
            const active = n.id === selectedId;
            const shared = n.owner_id !== userId;
            return (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                style={{
                  width: "100%", textAlign: isAr ? "right" : "left",
                  padding: "8px 10px", marginBottom: 2, borderRadius: 8,
                  background: active ? "rgba(24,159,209,.18)" : "transparent",
                  border: "1px solid " + (active ? "rgba(24,159,209,.4)" : "transparent"),
                  color: "var(--foreground)", cursor: "pointer", display: "block",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {n.emoji ? (
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{n.emoji}</span>
                  ) : (
                    <StickyNote size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                  )}
                  {n.is_favorite && <Star size={10} fill="#D4AF37" color="#D4AF37" style={{ flexShrink: 0 }} />}
                  {n.is_pinned && <Pin size={10} style={{ transform: "rotate(45deg)", flexShrink: 0, color: "#189FD1" }} />}
                  <span style={{ fontWeight: 600, fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.title || t("untitledNote")}
                  </span>
                  {shared && <Users size={10} style={{ opacity: 0.6, flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2, paddingInlineStart: 18 }}>
                  {preview(n.content_text || "", 60) || (isAr ? "فارغة" : "Empty")}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ─────────── MAIN ─────────── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: palette.bg, transition: "background .2s" }}>
        {!selectedNote ? (
          <HomeDashboard
            notes={notes}
            onOpen={(id) => setSelectedId(id)}
            onCreate={onCreate}
            onTemplates={async () => {
              if (!userId) return;
              const n = await createNote(userId);
              setNotes((cur) => [n, ...cur]);
              setSelectedId(n.id);
              // Templates popup opens after selection re-render; open now
              setTemplatesOpen(true);
            }}
          />
        ) : (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              {/* Cover */}
              {selectedNote.cover_url && (
                <div style={{
                  height: 160, position: "relative", overflow: "hidden",
                  backgroundImage: `url(${selectedNote.cover_url})`,
                  backgroundSize: "cover", backgroundPosition: "center",
                }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(15,23,42,.6) 100%)" }} />
                  {isOwner && (
                    <div style={{
                      position: "absolute", bottom: 12, right: 12,
                      display: "flex", gap: 6, flexWrap: "wrap",
                      justifyContent: "flex-end",
                      maxWidth: "calc(100% - 24px)",
                    }}>
                      <button onClick={() => coverFileRef.current?.click()} style={coverBtn}>
                        <Camera size={12} /> {t("changeCover")}
                      </button>
                      <button onClick={onRemoveCover} style={coverBtn}>
                        <Trash2 size={12} /> {t("removeCover")}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar row */}
              <div style={{
                padding: "10px 20px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                borderBottom: "1px solid var(--border)", background: "var(--surface)",
              }}>
                <button onClick={() => setSidebarOpen((s) => !s)} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} style={iconToolBtn}>
                  <ArrowLeft size={15} style={{ transform: sidebarOpen ? undefined : "rotate(180deg)" }} />
                </button>

                {/* Emoji */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => { if (isOwner) setEmojiMenu((s) => !s); }}
                    title={selectedNote.emoji ? t("changeEmoji") : t("addEmoji")}
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      color: "var(--foreground)", cursor: isOwner ? "pointer" : "default",
                      fontSize: 18, lineHeight: 1,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {selectedNote.emoji ?? <Smile size={16} />}
                  </button>
                  {emojiMenu && (
                    <Popover onClose={() => setEmojiMenu(false)}>
                      <div style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(6, 30px)", gap: 4 }}>
                        {QUICK_EMOJIS.map((emoji) => (
                          <button key={emoji} onClick={() => onSetEmoji(emoji)} style={{
                            width: 30, height: 30, background: "transparent", border: "1px solid transparent",
                            borderRadius: 6, cursor: "pointer", fontSize: 18,
                          }}>{emoji}</button>
                        ))}
                        {selectedNote.emoji && (
                          <button onClick={() => onSetEmoji(null)} style={{
                            gridColumn: "1 / -1", padding: "6px 8px", fontSize: 11,
                            background: "transparent", border: "1px solid var(--border)",
                            borderRadius: 6, cursor: "pointer", color: "var(--muted)",
                          }}>{t("removeEmoji")}</button>
                        )}
                      </div>
                    </Popover>
                  )}
                </div>

                {/* Title */}
                <input
                  value={selectedNote.title}
                  readOnly={!isOwner}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchNote(selectedNote.id, { title: v });
                    draftRef.current = {
                      title: v,
                      html: draftRef.current?.html ?? selectedNote.content_html,
                      text: draftRef.current?.text ?? selectedNote.content_text,
                    };
                    setDirty(true);
                  }}
                  placeholder={t("untitledNote")}
                  style={{
                    flex: 1, minWidth: 180, background: "transparent", border: "none",
                    fontSize: 20, fontWeight: 800, color: "var(--foreground)", outline: "none",
                    padding: "4px 0",
                  }}
                />

                {!isOwner && <span style={roBadge}>{t("readOnlyBadge")}</span>}

                {isOwner && (
                  <>
                    <button onClick={onToggleFavorite} title={selectedNote.is_favorite ? t("unfavoriteNote") : t("favoriteNote")} style={{ ...iconToolBtn, color: selectedNote.is_favorite ? "#D4AF37" : "var(--foreground)" }}>
                      <Star size={15} fill={selectedNote.is_favorite ? "#D4AF37" : "none"} />
                    </button>
                    <button onClick={onTogglePin} title={selectedNote.is_pinned ? t("unpinNote") : t("pinNote")} style={{ ...iconToolBtn, color: selectedNote.is_pinned ? "#189FD1" : "var(--foreground)" }}>
                      {selectedNote.is_pinned ? <PinOff size={15} /> : <Pin size={15} />}
                    </button>

                    {!selectedNote.cover_url && (
                      <button onClick={() => coverFileRef.current?.click()} title={t("addCover")} style={iconToolBtn}>
                        <ImagePlus size={15} />
                      </button>
                    )}
                    <button onClick={() => setTemplatesOpen(true)} title={t("templatesTitle")} style={iconToolBtn}>
                      <Sparkles size={15} />
                    </button>

                    <AiMenu editor={editor} />

                    <button onClick={() => setCommentsOpen((c) => !c)} title={t("commentsSection")} style={{ ...iconToolBtn, background: commentsOpen ? "rgba(24,159,209,.18)" : "var(--surface-2)" }}>
                      <MessageSquare size={15} />
                    </button>

                    <div style={{ position: "relative" }}>
                      <button onClick={() => setMoreMenu((s) => !s)} title="More" style={iconToolBtn}>
                        <MoreHorizontal size={15} />
                      </button>
                      {moreMenu && (
                        <Popover onClose={() => setMoreMenu(false)}>
                          <div style={{ padding: 6, minWidth: 200 }}>
                            <button onClick={() => { setFolderMenu(true); setMoreMenu(false); }} style={menuItem}><FolderIcon size={13} /> {t("folders")}</button>
                            <button onClick={() => { setTagMenu(true); setMoreMenu(false); }} style={menuItem}><TagIcon size={13} /> {t("tags")}</button>
                            <button onClick={() => { setShareOpen(true); setMoreMenu(false); }} style={menuItem}><Share2 size={13} /> {t("shareNote")}</button>
                            <button onClick={() => { onExportPdf(); setMoreMenu(false); }} style={menuItem}><FileDown size={13} /> {t("exportNotePdf")}</button>
                            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                            <button onClick={() => { onDelete(); setMoreMenu(false); }} style={{ ...menuItem, color: "#F0676A" }}><Trash2 size={13} /> {t("deleteNote")}</button>
                          </div>
                        </Popover>
                      )}
                    </div>
                  </>
                )}

                {!isOwner && (
                  <button onClick={onExportPdf} title={t("exportNotePdf")} style={iconToolBtn}><FileDown size={15} /></button>
                )}

                {/* Hidden folder / tag popovers positioned near title */}
                {folderMenu && (
                  <div style={{ position: "absolute", top: 46, insetInlineEnd: 20, zIndex: 25 }}>
                    <Popover onClose={() => setFolderMenu(false)}>
                      <div style={{ padding: 6, minWidth: 200 }}>
                        <MenuItem active={selectedNote.folder_id === null} onClick={() => onSetFolder(null)}>{t("noFolder")}</MenuItem>
                        {folders.map((f) => (
                          <MenuItem key={f.id} active={selectedNote.folder_id === f.id} onClick={() => onSetFolder(f.id)}>{f.name}</MenuItem>
                        ))}
                      </div>
                    </Popover>
                  </div>
                )}
                {tagMenu && (
                  <div style={{ position: "absolute", top: 46, insetInlineEnd: 20, zIndex: 25 }}>
                    <Popover onClose={() => setTagMenu(false)}>
                      <div style={{ padding: 6, minWidth: 220 }}>
                        {tags.map((tag) => (
                          <MenuItem key={tag.id} active={noteTagIds.has(tag.id)} onClick={() => onToggleTag(tag)}>#{tag.name}</MenuItem>
                        ))}
                        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                        <MenuItem onClick={onCreateTag}><Plus size={12} style={{ display: "inline", marginInlineEnd: 4 }} /> {t("newTag")}</MenuItem>
                      </div>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Tags row */}
              {currentNoteTags.length > 0 && (
                <div style={{ padding: "6px 20px", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid var(--border)" }}>
                  {currentNoteTags.map((tag) => (
                    <span key={tag.id} style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                      background: "rgba(24,159,209,.14)", color: "#189FD1", border: "1px solid rgba(24,159,209,.3)",
                    }}>#{tag.name}</span>
                  ))}
                </div>
              )}

              {/* Editor */}
              <NoteEditor
                noteId={selectedNote.id}
                content={selectedNote.content_html}
                editable={isOwner}
                onEditor={setEditor}
                onInsertImageClick={() => imageFileRef.current?.click()}
                onChange={(html, text) => {
                  draftRef.current = { title: selectedNote.title, html, text };
                  setDirty(true);
                }}
              />

              {/* Hidden inputs */}
              <input ref={imageFileRef} type="file" accept="image/*" hidden onChange={(e) => {
                const f = e.target.files?.[0]; if (f) void onUploadImage(f);
                e.target.value = "";
              }} />
              <input ref={coverFileRef} type="file" accept="image/*" hidden onChange={(e) => {
                const f = e.target.files?.[0]; if (f) void onUploadCover(f);
                e.target.value = "";
              }} />

              {/* Footer */}
              <div style={{
                padding: "8px 20px", borderTop: "1px solid var(--border)", background: "var(--surface)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 11, color: "var(--muted)", gap: 8, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <span>{countWords(selectedNote.content_text)} {t("words")}</span>
                  <span>{selectedNote.content_text.length} {t("characters")}</span>
                  {attachments.length > 0 && <span>{attachments.length} {t("attachments")}</span>}
                </div>
                <div>
                  {saving ? t("saving") : savedAt ? t("savedJustNow") : `${t("lastEdited")}: ${new Date(selectedNote.updated_at).toLocaleTimeString(isAr ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                </div>
              </div>
            </div>

            {commentsOpen && <CommentsPanel noteId={selectedNote.id} onClose={() => setCommentsOpen(false)} />}
          </div>
        )}
      </main>

      {shareOpen && selectedNote && <ShareNoteModal noteId={selectedNote.id} onClose={() => setShareOpen(false)} />}
      {templatesOpen && editor && <TemplatesPopup editor={editor} onClose={() => setTemplatesOpen(false)} />}
      <PromptHost />

      <style>{`
        @media (max-width: 768px) {
          .notes-sidebar { position: absolute; z-index: 30; height: 100%; }
        }
      `}</style>

      {/* Cleanup unused imports */}
      <span hidden><X /></span>
    </div>
  );
}

function FilterBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  const { lang } = useApp();
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "6px 10px", marginBottom: 1,
      background: active ? "rgba(24,159,209,.15)" : "transparent",
      border: "1px solid " + (active ? "rgba(24,159,209,.3)" : "transparent"),
      borderRadius: 8, color: "var(--foreground)", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600,
      textAlign: lang === "ar" ? "right" : "left",
    }}>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 500 }}>{count}</span>
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
      boxShadow: "0 12px 32px rgba(0,0,0,.4)", zIndex: 30, minWidth: 180,
    }}>
      {children}
    </div>
  );
}

function MenuItem({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "7px 10px",
      background: active ? "rgba(24,159,209,.15)" : "transparent",
      border: "none", borderRadius: 6, color: "var(--foreground)", cursor: "pointer",
      display: "block", textAlign: "start", fontSize: 13,
    }}>
      {children}
    </button>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, color: "var(--muted)",
  letterSpacing: ".12em", textTransform: "uppercase",
};

const sidebarIconBtn: React.CSSProperties = {
  background: "transparent", border: "none", color: "var(--muted)",
  cursor: "pointer", padding: "3px 5px", fontSize: 11, borderRadius: 4,
};

const iconToolBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--foreground)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

const roBadge: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
  background: "rgba(212,175,55,.15)", color: "#D4AF37",
  border: "1px solid rgba(212,175,55,.35)",
};

const coverBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8,
  background: "rgba(0,0,0,.65)", color: "#fff",
  border: "1px solid rgba(255,255,255,.25)", cursor: "pointer", backdropFilter: "blur(6px)",
  display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
};

const menuItem: React.CSSProperties = {
  width: "100%", padding: "7px 10px", background: "transparent",
  border: "none", borderRadius: 6, color: "var(--foreground)", cursor: "pointer",
  display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, textAlign: "start",
};
