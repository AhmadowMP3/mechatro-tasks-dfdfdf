import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { X, Play, Pause, MessageSquare, Link as LinkIcon, Trash2, ExternalLink, Send, Save, Star, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { StatusPill, PriorityPill, OverduePill } from "@/components/Pills";
import { Avatar } from "@/components/Avatar";
import { AssigneeStack } from "@/components/AssigneeStack";
import { formatDate, formatMinutes, isOverdue, relativeTime, toLocalDigits } from "@/lib/format";
import { driveFileType, isDriveUrl, PROJECT_COLORS } from "@/lib/ui-tokens";
import { notify } from "@/lib/activity";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { AssigneeMultiSelect } from "@/components/ui/AssigneeMultiSelect";
import { saveTaskAssignees } from "@/lib/task-assignees";

type Task = {
  id: string; project_id: string; title: string; description: string | null;
  assignee_id: string | null; priority: string; status: string; progress: number;
  due_date: string | null; completed_at: string | null; created_at: string;
  start_date: string | null;
  points: number; points_awarded_at: string | null; points_awarded_amount: number | null;
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
  const [savingLink, setSavingLink] = useState(false);
  const [dirty, setDirty] = useState<Partial<Task>>({});
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeIdsBase, setAssigneeIdsBase] = useState<string[]>([]);

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
    const { data: ta } = await supabase.from("task_assignees").select("user_id,assigned_at").eq("task_id", taskId).order("assigned_at", { ascending: true });
    const ids = (ta ?? []).map((r) => r.user_id);
    // Fall back to primary assignee if the join table is empty (legacy tasks that haven't been re-saved).
    const finalIds = ids.length > 0 ? ids : (tk.assignee_id ? [tk.assignee_id] : []);
    setAssigneeIds(finalIds);
    setAssigneeIdsBase(finalIds);
  };

  if (!task) return null;

  const merged: Task = { ...task, ...dirty };
  const projectName = project ? (lang === "ar" ? project.name_ar : project.name_en) : "";
  const assignedUsers: Profile[] = assigneeIds
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean) as Profile[];
  const assignee = users.find((u) => u.id === merged.assignee_id) ?? null;
  const canEditAll = can("manage_tasks");
  const canEditOwn = user && (merged.assignee_id === user.id || assigneeIds.includes(user.id)) && can("edit_own_task");
  const canEdit = canEditAll || canEditOwn;
  const readOnlyForMember = !canEditAll && canEditOwn;

  const openSession = sessions.find((s) => s.user_id === user?.id && !s.ended_at);
  const totalMins = sessions.reduce((sum, s) => {
    if (s.duration_minutes != null) return sum + s.duration_minutes;
    if (!s.ended_at) return sum + Math.floor((now - new Date(s.started_at).getTime()) / 60000);
    return sum;
  }, 0);

  // Validate only the fields being changed, plus keep title non-empty.
  // This lets members update status on legacy tasks (missing description/due_date/etc.)
  // and lets admins change status/priority without refilling missing legacy fields.
  const dirtyKeys = Object.keys(dirty) as (keyof Task)[];
  const nonEmpty = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null && v !== "");
  const requiredIfDirty: (keyof Task)[] = ["title", "description", "project_id", "assignee_id", "due_date", "priority"];
  const dirtyFieldsValid = requiredIfDirty.every((k) => !dirtyKeys.includes(k) || nonEmpty(merged[k]));
  const titleOk = (merged.title ?? "").trim().length > 0;
  const pointsOk = !canEditAll || merged.points_awarded_at
    ? true
    : (dirtyKeys.includes("points") || dirty.status === "done")
      ? Number(merged.points) > 0 && Number(merged.points) <= 1000
      : true;
  const editValid = titleOk && dirtyFieldsValid && pointsOk;

  const assigneesDirty = canEditAll && (
    assigneeIds.length !== assigneeIdsBase.length ||
    assigneeIds.some((id, i) => id !== assigneeIdsBase[i])
  );

  const saveChanges = async () => {
    if (Object.keys(dirty).length === 0 && !assigneesDirty) return;
    if (!editValid) { toast.error(lang === "ar" ? "يرجى ملء جميع الحقول" : "Please fill in all fields"); return; }

    if (Object.keys(dirty).length > 0) {
      const patch: Record<string, unknown> = { ...dirty };
      const approvingNow = dirty.status === "done" && task.status !== "done";
      if (approvingNow) patch.completed_at = new Date().toISOString();
      if (dirty.status && dirty.status !== "done") patch.completed_at = null;
      // Never let a manual patch overwrite the primary assignee — the join-table
      // save below owns that column.
      delete patch.assignee_id;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("tasks").update(patch as never).eq("id", taskId);
        if (error) { toast.error(error.message); return; }
      }

      if (approvingNow && (merged.points ?? 0) > 0) {
        try {
          confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ["#FFD700", "#42C2EE", "#3ECF8E", "#F0676A"] });
          setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } }), 150);
          setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } }), 300);
        } catch { /* noop */ }
        toast.success(`⭐ +${merged.points} ${t("points")}`);
      }
    }

    if (assigneesDirty) {
      const res = await saveTaskAssignees(taskId, assigneeIds, { assignedBy: user?.id ?? null });
      if (res.error) { toast.error(res.error.message); return; }
      // Notify newly added assignees.
      const added = assigneeIds.filter((id) => !assigneeIdsBase.includes(id));
      for (const uid of added) {
        if (uid !== user?.id) {
          await notify(uid, "task_assigned", `تم تكليفك بمهمة: ${task.title}`, `Assigned to task: ${task.title}`, undefined, taskId);
        }
      }
    }

    toast.success(t("saved"));
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

  const driveTypeLabel = (url: string): string => {
    switch (driveFileType(url)) {
      case "folder": return t("driveFolder");
      case "doc": return t("googleDoc");
      case "sheet": return t("googleSheet");
      case "slides": return t("googleSlides");
      default: return t("driveFile");
    }
  };
  const detectedType = linkUrl.trim() && isDriveUrl(linkUrl) ? driveTypeLabel(linkUrl) : "";

  const addLink = async () => {
    const url = linkUrl.trim();
    if (!url) { toast.error(t("urlRequired")); return; }
    if (!isDriveUrl(url)) { toast.error(t("invalidDriveUrl")); return; }
    const name = linkName.trim() || driveTypeLabel(url);
    setSavingLink(true);
    try {
      const { withRetryOnReconnect } = await import("@/lib/withRetryToast");
      const { error } = await withRetryOnReconnect(
        async () => await supabase.from("task_files").insert({
          task_id: taskId, file_name: name, drive_url: url,
          file_type: driveFileType(url), added_by: user?.id ?? null,
        }),
        { offlineMessage: t("offlineRetryToast"), retryingMessage: t("retryingToast") },
      );
      if (error) {
        const { explainSupabaseError } = await import("@/lib/permission-errors");
        toast.error(explainSupabaseError(error, { action: "create", entity: "task", user, lang }), { duration: 8000 });
        return;
      }
      toast.success(t("linkSaved"));
      setLinkName(""); setLinkUrl("");
      load();
    } finally {
      setSavingLink(false);
    }
  };

  const deleteLink = async (id: string) => { await supabase.from("task_files").delete().eq("id", id); load(); };

  const taskUrl = typeof window !== "undefined"
    ? `${window.location.origin}/tasks?task=${task.id}`
    : `/tasks?task=${task.id}`;

  const shareMessage = () => {
    const base = t("shareTemplate", {
      title: task.title,
      project: projectName || "—",
      assignee: assignee?.full_name || "—",
      due: task.due_date ? formatDate(task.due_date, lang) : "—",
      status: t(task.status as never),
    });
    return `${base}\n\n${t("shareViewLink")}: ${taskUrl}`;
  };

  const copyTaskLink = async () => {
    try {
      await navigator.clipboard.writeText(taskUrl);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("copyLink"));
    }
  };

  const overdue = isOverdue(merged.due_date, merged.status);

  return (
    <ResponsiveModal onClose={onClose} size="lg">


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
          <Field label={t("assignees")}>
            {canEditAll ? (
              <AssigneeMultiSelect
                users={users.filter((u) => u.active)}
                value={assigneeIds}
                onChange={setAssigneeIds}
                placeholder="—"
              />
            ) : assignedUsers.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <AssigneeStack users={assignedUsers} size={28} max={4} />
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {assignedUsers.map((u) => u.full_name).join(lang === "ar" ? "، " : ", ")}
                </span>
              </div>
            ) : assignee ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar id={assignee.id} name={assignee.full_name} size={28} /><span>{assignee.full_name}</span></div>
            ) : "—"}
          </Field>

          <Field label={t("priority")}>
            {canEdit ? (
              <ThemedSelect
                value={merged.priority}
                onChange={(v) => setField("priority", v)}
                options={PRIORITY_LIST.map((p) => ({ value: p, label: t(p) }))}
              />
            ) : <PriorityPill priority={merged.priority} />}
          </Field>

          <Field label={`⭐ ${t("taskPoints")}`}>
            {canEditAll && !merged.points_awarded_at ? (
              <input
                type="number" min={0} max={1000}
                value={merged.points ?? 0}
                onChange={(e) => setField("points" as never, Number(e.target.value) as never)}
                style={{ ...selectStyle, fontWeight: 800, background: "linear-gradient(135deg, rgba(255,215,0,.12), rgba(255,165,0,.08))" }}
              />
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "linear-gradient(135deg,#F5A623,#F0676A)", color: "#fff", fontWeight: 800 }}>
                <Star size={14} fill="#fff" />
                {toLocalDigits(merged.points_awarded_amount ?? merged.points ?? 0, lang)} {t("points")}
                {merged.points_awarded_at && <span style={{ fontSize: 10, opacity: .85, marginInlineStart: 4 }}>✓</span>}
              </div>
            )}
          </Field>

          <Field label={t("dueDate")}>
            {canEditAll ? (
              <input type="date" value={merged.due_date ?? ""} onChange={(e) => setField("due_date", e.target.value || null)} style={selectStyle} />
            ) : formatDate(merged.due_date, lang)}
          </Field>

          <Field label={t("status")}>
            {canEdit ? (
              <ThemedSelect
                value={merged.status}
                onChange={(v) => setField("status", v)}
                options={(canEditAll ? STATUS_LIST : MEMBER_STATUS_LIST).map((s) => ({ value: s, label: t(s) }))}
              />
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
          <button
            onClick={saveChanges}
            disabled={!editValid}
            className="brand-btn"
            style={{
              background: editValid ? "var(--grad-blue)" : "var(--surface-2)",
              color: editValid ? "#fff" : "var(--muted)",
              marginBottom: 16,
              cursor: editValid ? "pointer" : "not-allowed",
              opacity: editValid ? 1 : 0.6,
            }}
          >
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
            <div style={{ marginTop: 8, padding: 12, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  placeholder={t("driveUrl")}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                  style={{ ...selectStyle, paddingInlineEnd: detectedType ? 140 : 12 }}
                />
                {detectedType && (
                  <span
                    style={{
                      position: "absolute",
                      insetInlineEnd: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(66,194,238,.15)",
                      color: "#42C2EE",
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <LinkIcon size={12} /> {detectedType}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
                <input
                  placeholder={t("linkName")}
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                  style={{ ...selectStyle, flex: "1 1 200px" }}
                />
                <button
                  onClick={addLink}
                  disabled={!linkUrl.trim() || savingLink}
                  className="brand-btn"
                  style={{
                    background: !linkUrl.trim() || savingLink ? "var(--surface-3)" : "var(--grad-green)",
                    color: !linkUrl.trim() || savingLink ? "var(--muted)" : "#fff",
                    minWidth: 140,
                    cursor: !linkUrl.trim() || savingLink ? "not-allowed" : "pointer",
                  }}
                >
                  <Save size={16} /> {savingLink ? "…" : t("saveLink")}
                </button>
              </div>
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
            href={`https://t.me/share/url?url=${encodeURIComponent(taskUrl)}&text=${encodeURIComponent(shareMessage())}`}
            target="_blank" rel="noopener noreferrer"
            className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", textDecoration: "none", flex: 1, minWidth: 200 }}
          ><Send size={18} /> {t("shareTelegram")}</a>
          <button
            onClick={copyTaskLink}
            className="brand-btn"
            aria-label={t("copyLink")}
            title={t("copyLink")}
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          ><Copy size={16} /> {t("copyLink")}</button>
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
    </ResponsiveModal>
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
