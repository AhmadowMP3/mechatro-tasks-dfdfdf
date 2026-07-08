import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { NewTaskModal } from "@/components/NewTaskModal";
import { formatDate, toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { useBulkSelection, BulkCheckbox } from "@/lib/bulk-selection";
import { BulkAssigneeModal } from "@/components/tasks/BulkAssigneeModal";

export const Route = createFileRoute("/_authenticated/projects/$id")({ component: ProjectDetail });

function ProjectDetail() {
  const { id } = Route.useParams();
  const { t, lang, users, isAdmin, user } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tid = new URLSearchParams(window.location.search).get("task");
    if (tid) setSelected(tid);
  }, []);
  const closeTaskModal = () => {
    setSelected(null);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("task")) {
        params.delete("task");
        const qs = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    }
  };
  const [newOpen, setNewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [pr, tk] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("tasks").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      ]);
      const taskIds = (tk.data ?? []).map((t) => t.id);
      let assigneesByTask: Record<string, string[]> = {};
      if (taskIds.length > 0) {
        const { data: ta } = await supabase
          .from("task_assignees").select("task_id,user_id,assigned_at")
          .in("task_id", taskIds)
          .order("assigned_at", { ascending: true });
        for (const row of ta ?? []) (assigneesByTask[row.task_id] ||= []).push(row.user_id);
      }
      return { project: pr.data, tasks: tk.data ?? [], assigneesByTask };
    },
  });

  const tasksForSelection = data?.tasks ?? [];
  const { isSelected, toggle, ids: selectedIds, clear: clearSelection } = useBulkSelection({
    pageId: `project:${id}`,
    items: tasksForSelection as Array<{ id: string }>,
    deps: [tasksForSelection.length, isAdmin, lang],
    buildBar: isAdmin
      ? (sel) => ({
          count: sel.length,
          totalLabel: lang === "ar"
            ? `${sel.length} مهمة محددة`
            : `${sel.length} task${sel.length === 1 ? "" : "s"} selected`,
          actions: [
            {
              id: "assign",
              label: lang === "ar" ? "تعيين إلى…" : "Assign to…",
              icon: <Users size={14} />,
              onRun: () => setBulkAssignOpen(true),
            },
          ],
        })
      : () => null,
  });
  const bulkMode = selectedIds.length > 0;

  if (!data?.project) return <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>…</div>;
  const p = data.project;
  const total = data.tasks.length;
  const done = data.tasks.filter((t) => t.status === "done").length;
  const progress = total ? Math.round((done / total) * 100) : 0;


  return (
    <div>
      <Link to="/projects" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", textDecoration: "none", marginBottom: 12, minHeight: 44 }}>
        <ArrowRight size={16} style={{ transform: lang === "ar" ? "none" : "scaleX(-1)" }} /> {t("projects")}
      </Link>

      <div className="brand-card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: 8, background: PROJECT_COLORS[p.color] ?? PROJECT_COLORS.blue }} />
        <div style={{ padding: 24 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>{lang === "ar" ? p.name_ar : p.name_en}</h1>
          {p.description && <p style={{ color: "var(--muted)", marginTop: 8 }}>{p.description}</p>}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, fontSize: 13, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {t("status")}:{" "}
              {isAdmin ? (
                <div style={{ minWidth: 150 }}>
                  <ThemedSelect
                    value={p.status}
                    onChange={async (v) => {
                      const next = v as "active" | "on_hold" | "done" | "archived";
                      const patch: { status: typeof next; archived?: boolean } = { status: next };
                      if (next === "archived") patch.archived = true;
                      else if (p.archived) patch.archived = false;
                      const { error } = await supabase.from("projects").update(patch).eq("id", p.id);
                      if (error) {
                        const { explainSupabaseError } = await import("@/lib/permission-errors");
                        toast.error(explainSupabaseError(error, { action: "update", entity: "project", user, lang }), { duration: 8000 });
                        return;
                      }
                      toast.success(t("saved"));
                      refetch();
                      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
                    }}
                    style={{ minHeight: 36, borderRadius: 999, fontSize: 13, fontWeight: 700 }}
                    options={(["active", "on_hold", "done", "archived"] as const).map((s) => ({
                      value: s, label: t(s as never),
                    }))}
                  />
                </div>
              ) : (
                <b>{t(p.status as never)}</b>
              )}
            </span>
            <span>{t("dueDate")}: <b>{formatDate(p.due_date, lang)}</b></span>
            <span>{t("progress")}: <b>{toLocalDigits(progress, lang)}%</b> ({toLocalDigits(done, lang)}/{toLocalDigits(total, lang)})</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 20 }}>{t("tasks")}</h2>
        {isAdmin && (
          <>
            <button onClick={() => setNewOpen(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
              <Plus size={18} /> {t("addTaskHere")}
            </button>
            <button
              onClick={() => { setConfirmText(""); setDeleteOpen(true); }}
              className="brand-btn"
              aria-label={t("deleteProject")}
              title={t("deleteProject")}
              style={{ background: "var(--surface-2)", color: "#ff6b6b", border: "1px solid var(--border)" }}
            >
              <Trash2 size={16} /> {t("deleteProject")}
            </button>
          </>
        )}
      </div>

      {data.tasks.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noTasks")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 300px), 1fr))", gap: 14 }}>
          {data.tasks.map((tk) => {
            const checked = isSelected(tk.id);
            return (
              <div
                key={tk.id}
                style={{
                  position: "relative",
                  borderRadius: 16,
                  outline: checked ? "2px solid var(--primary, #189FD1)" : "none",
                  outlineOffset: 2,
                  transition: "outline .12s",
                }}
                onClick={(e) => { if (bulkMode && isAdmin) { e.stopPropagation(); toggle(tk.id); } }}
              >
                {isAdmin && (
                  <div
                    onClick={(e) => { e.stopPropagation(); toggle(tk.id); }}
                    style={{
                      position: "absolute", top: 10, insetInlineStart: 10, zIndex: 5,
                      opacity: checked || bulkMode ? 1 : 0, transition: "opacity .12s",
                    }}
                  >
                    <BulkCheckbox checked={checked} onChange={() => toggle(tk.id)} label={lang === "ar" ? "تحديد" : "Select"} />
                  </div>
                )}
                <div style={{ pointerEvents: bulkMode ? "none" : "auto" }}>
                  <TaskCard task={tk} project={p}
                    assignee={users.find((u) => u.id === tk.assignee_id) ?? null}
                    assignees={(data.assigneesByTask[tk.id] ?? []).map((uid) => users.find((u) => u.id === uid)).filter(Boolean) as never}
                    onClick={() => setSelected(tk.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bulkAssignOpen && (
        <BulkAssigneeModal
          taskIds={selectedIds}
          users={users}
          onClose={() => setBulkAssignOpen(false)}
          onDone={() => { clearSelection(); refetch(); }}
        />
      )}


      {selected && <TaskDetailModal taskId={selected} onClose={closeTaskModal} onChanged={refetch} />}
      {newOpen && <NewTaskModal defaultProjectId={id} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refetch(); }} />}
      {deleteOpen && (() => {
        const name = lang === "ar" ? p.name_ar : p.name_en;
        const canDelete = confirmText.trim() === name.trim() && !busy;
        const submit = async () => {
          if (!canDelete) return;
          setBusy(true);
          const { error } = await supabase.from("projects").delete().eq("id", p.id);
          setBusy(false);
          if (error) {
            const { explainSupabaseError } = await import("@/lib/permission-errors");
            toast.error(explainSupabaseError(error, { action: "delete", entity: "project", user, lang }), { duration: 8000 });
            return;
          }
          toast.success(t("projectDeleted"));
          navigate({ to: "/projects" });
        };
        return (
          <ResponsiveModal title={t("deleteProject")} onClose={() => setDeleteOpen(false)} size="md">
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(255,107,107,.08)", border: "1px solid rgba(255,107,107,.35)", color: "#ffb4b4", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
              {t("deleteProjectWarning")}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
              <b style={{ color: "var(--foreground)" }}>{name}</b>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{t("typeToConfirm")}</label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={name}
              autoFocus
              style={{ width: "100%", padding: "10px 12px", minHeight: 48, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 14, outline: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={submit} disabled={!canDelete} className="brand-btn"
                style={{ background: canDelete ? "#e5484d" : "var(--surface-2)", color: canDelete ? "#fff" : "var(--muted)", flex: 1, cursor: canDelete ? "pointer" : "not-allowed" }}>
                {t("deleteProject")}
              </button>
              <button onClick={() => setDeleteOpen(false)} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
            </div>
          </ResponsiveModal>
        );
      })()}
    </div>
  );
}
