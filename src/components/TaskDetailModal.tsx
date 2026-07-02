import { useEffect, useState } from "react";
import { X, Play, Pause, MessageSquare, Link as LinkIcon, Trash2, ExternalLink, Send, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { StatusPill, PriorityPill, OverduePill } from "@/components/Pills";
import { Avatar } from "@/components/Avatar";
import { formatDate, formatMinutes, isOverdue, relativeTime, toLocalDigits } from "@/lib/format";
import { driveFileType, isDriveUrl, PROJECT_COLORS } from "@/lib/ui-tokens";
import { notify } from "@/lib/activity";
import { toast } from "sonner";

type Task = {
  id: string; project_id: string; title: string; description: string | null;
  assignee_id: string | null; priority: string; status: string; progress: number;
  due_date: string | null; completed_at: string | null; created_at: string;
  start_date: string | null;
};


const STATUS_LIST = ["todo", "in_progress", "paused", "in_review", "done"] as const;
const MEMBER_STATUS_LIST = ["todo", "in_progress", "paused", "in_review"] as const;
const PRIORITY_LIST = ["low", "normal", "high", "urgent"] as const;

export function TaskDetailModal({ taskId, onClose, onChanged }: { taskId: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang, user, users, can } = useApp();
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<{ id: string; name_ar: string; name_en: string; color: string } | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; body: string; author_id: string | null; created_at: string }>>([]);
  const [files, setFiles] = useState<Array<{ id: string; file_name: string; drive_url: string; file_type: string | null }>>([]);
  const [sessions, setSessions] = useState<Array<{ id: string; user_id: string; started_at: string; ended_at: string | null; duration_minutes: number | null }>>([]);
  const [now, setNow] = useState(Date.now());
  const [newComment, setNewComment] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [dirty, setDirty] = useState<Partial<Task>>({});

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { load(); }, [taskId]);

  const load = async () => {
    const { data: tk } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
    if (!tk) return;
    setTask(tk as Task);
    setDirty({});
    const { data: pr } = await supabase.from("projects").select("id,name_ar,name_en,color").eq("id", tk.project_id).maybeSingle();
    if (pr) setProject(pr);
    const { data: cm } = await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at");
    setComments(cm ?? []);
    const { data: fl } = await supabase.from("task_files").select("*").eq("task_id", taskId).order("created_at");
    setFiles(fl ?? []);
    const { data: ws } = await supabase.from("work_sessions").select("*").eq("task_id", taskId).order("started_at");
    setSessions(ws ?? []);
  };

  if (!task) return null;

  const merged: Task = { ...task, ...dirty };
  const projectName = project ? (lang === "ar" ? project.name_ar : project.name_en) : "";
  const assignee = users.find((u) => u.id === merged.assignee_id) ?? null;
  const canEditAll = can("manage_tasks");
  const canEditOwn = user && merged.assignee_id === user.id && can("edit_own_task");
  const canEdit = canEditAll || canEditOwn;
  const readOnlyForMember = !canEditAll && canEditOwn;

  const openSession = sessions.find((s) => s.user_id === user?.id && !s.ended_at);
  const totalMins = sessions.reduce((sum, s) => {
    if (s.duration_minutes != null) return sum + s.duration_minutes;
    if (!s.ended_at) return sum + Math.floor((now - new Date(s.started_at).getTime()) / 60000);
    return sum;
  }, 0);

  const saveChanges = async () => {
    if (Object.keys(dirty).length === 0) return;
    const patch: Record<string, unknown> = { ...dirty };
    if (dirty.status === "done" && task.status !== "done") patch.completed_at = new Date().toISOString();
    if (dirty.status && dirty.status !== "done") patch.completed_at = null;
    const { error } = await supabase.from("tasks").update(patch as never).eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));

    if (dirty.assignee_id && dirty.assignee_id !== task.assignee_id) {
      await notify(dirty.assignee_id as string, "task_assigned", `تم تكليفك بمهمة: ${task.title}`, `Assigned to task: ${task.title}`, undefined, taskId);
    }
    setDirty({});
    onChanged();
    load();
  };

  const setField = <K extends keyof Task>(k: K, v: Task[K]) => setDirty((d) => ({ ...d, [k]: v }));

  const toggleTimer = async () => {
    if (!user) return;
    if (openSession) {
      const durMin = Math.max(1, Math.floor((now - new Date(openSession.started_at).getTime()) / 60000));
      await supabase.from("work_sessions").update({ ended_at: new Date().toISOString(), duration_minutes: durMin }).eq("id", openSession.id);
      toast.success(t("pauseWork"));
    } else {
      await supabase.from("work_sessions").insert({ task_id: taskId, user_id: user.id });
      if (merged.status === "todo" || merged.status === "paused") {
        await supabase.from("tasks").update({ status: "in_progress" }).eq("id", taskId);
      }
      toast.success(t("startWork"));
    }
    load();
    onChanged();
  };

  const addComment = async () => {
    if (!newComment.trim() || !user) return;
    await supabase.from("task_comments").insert({ task_id: taskId, author_id: user.id, body: newComment.trim() });
    if (task.assignee_id && task.assignee_id !== user.id) {
      await notify(task.assignee_id, "task_comment", `تعليق جديد على: ${task.title}`, `New comment on: ${task.title}`, newComment.trim(), taskId);
    }
    
    setNewComment("");
    load();
  };

  const addLink = async () => {
    if (!isDriveUrl(linkUrl)) { toast.error(t("invalidDriveUrl")); return; }
    if (!linkName.trim()) return;
    await supabase.from("task_files").insert({
      task_id: taskId, file_name: linkName.trim(), drive_url: linkUrl.trim(),
      file_type: driveFileType(linkUrl), added_by: user?.id ?? null,
    });
    
    setLinkName(""); setLinkUrl("");
    load();
  };

  const deleteLink = async (id: string) => { await supabase.from("task_files").delete().eq("id", id); load(); };

  const shareMessage = () => t("shareTemplate", {
    title: task.title,
    project: projectName || "—",
    assignee: assignee?.full_name || "—",
    due: task.due_date ? formatDate(task.due_date, lang) : "—",
    status: t(task.status as never),
  });

  const overdue = isOverdue(merged.due_date, merged.status);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 12, overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="brand-card" style={{ maxWidth: 820, width: "100%", padding: "clamp(16px, 3vw, 24px)", marginTop: 12, marginBottom: 12, maxHeight: "calc(100dvh - 24px)", overflowY: "auto" }}>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            {project && (
              <span style={{
                display: "inline-block", padding: "4px 12px", borderRadius: 999,
                background: PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue,
                color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 8,
              }}>{projectName}</span>
            )}
            {canEdit ? (
              <input
                value={merged.title}
                onChange={(e) => setField("title", e.target.value)}
                style={{ display: "block", width: "100%", fontSize: 22, fontWeight: 800, background: "transparent", color: "var(--foreground)", border: "none", borderBottom: "1px solid var(--border)", padding: "4px 0", outline: "none" }}
              />
            ) : (
              <h2 style={{ margin: 0, fontSize: 22 }}>{merged.title}</h2>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <StatusPill status={merged.status} />
              <PriorityPill priority={merged.priority} />
              {overdue && <OverduePill />}
              {merged.start_date && (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {t("startedAgo")} {relativeTime(merged.start_date, lang)}
                </span>
              )}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>· {t("dueDate")}: {formatDate(merged.due_date, lang)}</span>
            </div>

          </div>
          <button onClick={onClose} aria-label="close" style={{ width: 44, height: 44, borderRadius: 10, background: "var(--surface-2)", color: "var(--foreground)", cursor: "pointer", border: "1px solid var(--border)" }}><X size={20} style={{ margin: "auto" }} /></button>
        </div>

        {readOnlyForMember && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{/* member sees limited fields */}</div>}

        {/* Fields grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 16 }}>
          <Field label={t("assignee")}>
            {canEditAll ? (
              <select value={merged.assignee_id ?? ""} onChange={(e) => setField("assignee_id", e.target.value || null)} style={selectStyle}>
                <option value="">—</option>
                {users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            ) : assignee ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar id={assignee.id} name={assignee.full_name} size={28} /><span>{assignee.full_name}</span></div>
            ) : "—"}
          </Field>

          <Field label={t("priority")}>
            {canEdit ? (
              <select value={merged.priority} onChange={(e) => setField("priority", e.target.value)} style={selectStyle}>
                {PRIORITY_LIST.map((p) => <option key={p} value={p}>{t(p)}</option>)}
              </select>
            ) : <PriorityPill priority={merged.priority} />}
          </Field>

          <Field label={t("dueDate")}>
            {canEditAll ? (
              <input type="date" value={merged.due_date ?? ""} onChange={(e) => setField("due_date", e.target.value || null)} style={selectStyle} />
            ) : formatDate(merged.due_date, lang)}
          </Field>

          <Field label={t("status")}>
            {canEdit ? (
              <select value={merged.status} onChange={(e) => setField("status", e.target.value)} style={selectStyle}>
                {(canEditAll ? STATUS_LIST : MEMBER_STATUS_LIST).map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            ) : <StatusPill status={merged.status} />}
            {readOnlyForMember && merged.status !== "in_review" && merged.status !== "done" && (
              <button
                type="button"
                onClick={() => setField("status", "in_review")}
                style={{ marginTop: 8, width: "100%", padding: "8px 12px", borderRadius: 10, background: "linear-gradient(135deg,#A855F7,#C084FC)", color: "#fff", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                ✓ {t("submitForReview")}
              </button>
            )}
            {canEditAll && merged.status === "in_review" && (
              <button
                type="button"
                onClick={() => setField("status", "done")}
                style={{ marginTop: 8, width: "100%", padding: "8px 12px", borderRadius: 10, background: "var(--grad-green)", color: "#fff", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                ✓ {t("approveDone")}
              </button>
            )}
          </Field>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>{t("progress")}: {toLocalDigits(merged.progress, lang)}%</label>
          <input
            type="range" min={0} max={100} step={5} value={merged.progress}
            disabled={!canEdit}
            onChange={(e) => setField("progress", Number(e.target.value))}
            style={{ width: "100%", accentColor: "#189FD1" }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>{t("description")}</label>
          {canEdit ? (
            <textarea value={merged.description ?? ""} onChange={(e) => setField("description", e.target.value)}
              style={{ ...selectStyle, minHeight: 80, resize: "vertical" }} />
          ) : <div style={{ color: "var(--muted)" }}>{merged.description || "—"}</div>}
        </div>

        {/* Save button */}
        {canEdit && Object.keys(dirty).length > 0 && (
          <button onClick={saveChanges} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", marginBottom: 16 }}>
            <Save size={18} /> {t("save")}
          </button>
        )}

        {/* Timer */}
        {canEditOwn || canEditAll ? (
          <div className="brand-card" style={{ padding: 16, marginBottom: 16, background: "var(--surface-2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>{t("totalLogged")}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#42C2EE" }}>{formatMinutes(totalMins, lang)}</div>
              </div>
              <button onClick={toggleTimer} className="brand-btn" style={{
                background: openSession ? "var(--grad-orange)" : "var(--grad-green)", color: "#fff",
              }}>
                {openSession ? <><Pause size={18} /> {t("pauseWork")}</> : <><Play size={18} /> {t("startWork")}</>}
              </button>
            </div>
          </div>
        ) : null}

        {/* Drive links */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, marginBottom: 8 }}>
            <LinkIcon size={18} color="#42C2EE" /> {t("driveLinks")}
          </h3>
          {files.map((f) => (
            <div key={f.id} className="brand-card" style={{ padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)" }}>
              <span style={{ fontSize: 20 }}>{fileEmoji(f.file_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{f.file_name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.drive_url}</div>
              </div>
              <a href={f.drive_url} target="_blank" rel="noopener noreferrer" className="brand-btn-sm" style={{ background: "var(--grad-blue)", color: "#fff", textDecoration: "none" }}><ExternalLink size={16} /> {t("open")}</a>
              {canEdit && <button onClick={() => deleteLink(f.id)} aria-label={t("delete")} style={{ width: 44, height: 44, borderRadius: 10, background: "transparent", color: "#F0676A", cursor: "pointer", border: "1px solid var(--border)" }}><Trash2 size={16} style={{ margin: "auto" }} /></button>}
            </div>
          ))}
          {canEdit && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, marginTop: 8 }}>
              <input placeholder={t("linkName")} value={linkName} onChange={(e) => setLinkName(e.target.value)} style={selectStyle} />
              <input placeholder={t("driveUrl")} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={selectStyle} />
              <button onClick={addLink} className="brand-btn-sm" style={{ background: "var(--grad-blue)", color: "#fff" }}>{t("addLink")}</button>
            </div>
          )}
        </div>

        {/* Share buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareMessage())}`}
            target="_blank" rel="noopener noreferrer"
            className="brand-btn" style={{ background: "var(--grad-green)", color: "#fff", textDecoration: "none", flex: 1, minWidth: 200 }}
          ><Send size={18} /> {t("shareWhatsapp")}</a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(shareMessage())}`}
            target="_blank" rel="noopener noreferrer"
            className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", textDecoration: "none", flex: 1, minWidth: 200 }}
          ><Send size={18} /> {t("shareTelegram")}</a>
        </div>

        {/* Comments */}
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, marginBottom: 8 }}>
            <MessageSquare size={18} color="#FF9255" /> {t("comments")}
          </h3>
          {comments.map((c) => {
            const author = users.find((u) => u.id === c.author_id);
            return (
              <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                {author && <Avatar id={author.id} name={author.full_name} size={32} />}
                <div className="brand-card" style={{ padding: 10, background: "var(--surface-2)", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, marginBottom: 4 }}>
                    <b>{author?.full_name || "—"}</b>
                    <span style={{ color: "var(--muted)" }}>{relativeTime(c.created_at, lang)}</span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
                </div>
              </div>
            );
          })}
          {can("comment") && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input placeholder={t("addComment")} value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} style={{ ...selectStyle, flex: 1 }} />
              <button onClick={addComment} className="brand-btn-sm" style={{ background: "var(--grad-blue)", color: "#fff" }}>{t("post")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fileEmoji(type: string | null): string {
  switch (type) {
    case "doc": return "📄";
    case "sheet": return "📊";
    case "slides": return "🖼️";
    case "folder": return "📁";
    default: return "📎";
  }
}

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 };
const selectStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", minHeight: 44,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  borderRadius: 10, color: "var(--foreground)", fontSize: 14, outline: "none",
  fontFamily: "inherit",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={fieldLabel}>{label}</div>{children}</div>;
}
