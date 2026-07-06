import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { listComments, addComment, resolveComment, deleteComment, errMsg, type NoteComment } from "@/lib/notes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, X, Undo2, Send } from "lucide-react";

type Profile = { id: string; full_name: string; avatar_url: string | null };

export function CommentsPanel({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const { user, t, lang } = useApp();
  const isAr = lang === "ar";
  const [items, setItems] = useState<NoteComment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await listComments(noteId);
      setItems(rows);
      const ids = Array.from(new Set(rows.map((r) => r.author_id)));
      if (ids.length > 0) {
        const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        const map: Record<string, Profile> = {};
        (data ?? []).forEach((p) => { map[p.id] = p as Profile; });
        setProfiles(map);
      }
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [noteId]);

  const submit = async () => {
    if (!body.trim() || !user?.id) return;
    setPosting(true);
    try {
      const c = await addComment(noteId, user.id, body.trim());
      setItems((cur) => [...cur, c]);
      setBody("");
    } catch (e) { toast.error(errMsg(e)); }
    finally { setPosting(false); }
  };

  const toggleResolved = async (c: NoteComment) => {
    try {
      await resolveComment(c.id, !c.resolved);
      setItems((cur) => cur.map((x) => x.id === c.id ? { ...x, resolved: !c.resolved } : x));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const remove = async (c: NoteComment) => {
    try { await deleteComment(c.id); setItems((cur) => cur.filter((x) => x.id !== c.id)); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <aside style={{
      width: 340, flexShrink: 0,
      borderInlineStart: "1px solid var(--border)",
      background: "var(--surface)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{t("commentsSection")} · {items.length}</div>
        <button onClick={onClose} aria-label="close" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", width: 30, height: 30, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{t("noComments")}</div>
        ) : items.map((c) => {
          const p = profiles[c.author_id];
          const mine = c.author_id === user?.id;
          return (
            <div key={c.id} style={{
              padding: 10, borderRadius: 10,
              background: c.resolved ? "rgba(80,200,120,.08)" : "var(--surface-2)",
              border: "1px solid " + (c.resolved ? "rgba(80,200,120,.3)" : "var(--border)"),
              opacity: c.resolved ? 0.7 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, background: "var(--grad-blue)", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {p?.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (p?.full_name ?? "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{p?.full_name ?? "…"}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>
                  {new Date(c.created_at).toLocaleDateString(isAr ? "ar" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "var(--foreground)" }}>{c.body}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                <button onClick={() => toggleResolved(c)} title={c.resolved ? t("reopenComment") : t("resolveComment")} style={miniBtn}>
                  {c.resolved ? <Undo2 size={11} /> : <CheckCircle2 size={11} />}
                  {c.resolved ? t("reopenComment") : t("resolveComment")}
                </button>
                {mine && (
                  <button onClick={() => remove(c)} title="delete" style={{ ...miniBtn, color: "#F0676A" }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("writeComment")}
          rows={2}
          style={{
            flex: 1, resize: "none", padding: "8px 10px",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 8, color: "var(--foreground)", fontSize: 13, outline: "none",
          }}
        />
        <button onClick={submit} disabled={posting || !body.trim()} aria-label={t("addCommentAction")} style={{
          width: 40, borderRadius: 8, border: "none",
          background: "var(--grad-blue)", color: "#fff", cursor: "pointer",
          opacity: (posting || !body.trim()) ? 0.5 : 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}><Send size={16} /></button>
      </div>
    </aside>
  );
}

const miniBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--foreground)", cursor: "pointer",
  padding: "3px 8px", borderRadius: 6, fontSize: 10.5,
};
