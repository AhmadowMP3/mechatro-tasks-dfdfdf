import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { STATUS_STYLES, PROJECT_COLORS } from "@/lib/ui-tokens";
import { Avatar } from "@/components/Avatar";
import { AssigneeStack } from "@/components/AssigneeStack";
import { BulkCheckbox } from "@/lib/bulk-selection";
import { formatDate, isOverdue, toLocalDigits } from "@/lib/format";

import type { TaskRow } from "@/components/TaskCard";

type Project = { id: string; name_ar: string; name_en: string; color: string };
const COLUMNS = ["todo", "in_progress", "paused", "in_review", "done"] as const;
type ColStatus = (typeof COLUMNS)[number];

export function KanbanView({
  tasks, projects, users, assigneesByTask, onOpen, onChanged,
  selectable, isSelected, onToggle,
}: {
  tasks: TaskRow[];
  projects: Project[];
  users: Profile[];
  assigneesByTask?: Record<string, string[]>;
  onOpen: (id: string) => void;
  onChanged: () => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onToggle?: (id: string) => void;
}) {
  const { t, lang, isAdmin, user } = useApp();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  function canMove(task: TaskRow | undefined, target: ColStatus): boolean {
    if (!task) return false;
    if (isAdmin) return true;
    // Members can only drag their own tasks, and never to 'done'
    if (task.assignee_id !== user?.id) return false;
    if (target === "done") return false;
    return true;
  }

  async function moveTask(id: string, status: ColStatus) {
    const task = tasks.find((x) => x.id === id);
    if (!task || task.status === status) return;
    if (!canMove(task, status)) {
      toast.error(t("onlyAdminCanComplete"));
      return;
    }
    const patch: { status: ColStatus; completed_at?: string | null } = { status };
    if (status === "done") patch.completed_at = new Date().toISOString();
    if (task.status === "done" && status !== "done") patch.completed_at = null;
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    
    if (status === "in_review") toast.success(t("awaitingReview"));
    onChanged();
  }

  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(min(82vw, 280px), 1fr)",
        gap: 14,
        overflowX: "auto",
        paddingBottom: 8,
        scrollSnapType: "x mandatory",
      }}
    >

      {COLUMNS.map((col) => {
        const style = STATUS_STYLES[col];
        const colTasks = tasks.filter((x) => x.status === col);
        const isOver = overCol === col;
        const draggingTask = dragId ? tasks.find((x) => x.id === dragId) : undefined;
        const dropAllowed = !!draggingTask && canMove(draggingTask, col);
        const isReview = col === "in_review";
        const isDone = col === "done";
        return (
          <div
            key={col}
            onDragOver={(e) => { if (dropAllowed) { e.preventDefault(); setOverCol(col); } }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={() => {
              if (dropAllowed) moveTask(dragId!, col);
              setDragId(null); setOverCol(null);
            }}
            className="brand-card kanban-col"
            style={{
              padding: 12,
              minHeight: 200,
              background: isOver && dropAllowed ? "var(--surface-2)" : "var(--card)",
              border: `1px solid ${isOver && dropAllowed ? style.text : (isReview ? "rgba(168,85,247,.35)" : "var(--border)")}`,
              boxShadow: isReview ? `0 0 0 1px rgba(168,85,247,.15) inset, 0 8px 24px -18px ${style.text}` : undefined,
              backgroundImage: isReview
                ? "radial-gradient(120% 60% at 50% 0%, rgba(168,85,247,.08), transparent 70%)"
                : undefined,
              transition: "border-color .15s ease, background .15s ease",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              opacity: draggingTask && !dropAllowed ? 0.55 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: `2px solid ${style.text}` }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: style.text, boxShadow: isReview ? `0 0 10px ${style.text}` : undefined }} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, flex: 1, color: style.text, display: "flex", alignItems: "center", gap: 6 }}>
                {t(col as never)}
                {isDone && !isAdmin && <span title={t("onlyAdminCanComplete")} style={{ fontSize: 11 }}>🔒</span>}
              </h3>
              <span style={{
                fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: "center",
                padding: "2px 8px", borderRadius: 999, background: style.bg, color: style.text,
              }}>{toLocalDigits(colTasks.length, lang)}</span>
            </div>
            {isReview && (
              <div style={{ fontSize: 11, color: "var(--muted)", padding: "0 2px", lineHeight: 1.4 }}>
                {lang === "ar" ? "المهام هنا بانتظار اعتماد المدير." : "Tasks here await admin approval."}
              </div>
            )}
            {colTasks.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "18px 6px" }}>—</div>
            )}
            {colTasks.map((tk) => {
              const project = projects.find((p) => p.id === tk.project_id);
              const assignee = users.find((u) => u.id === tk.assignee_id);
              const overdue = isOverdue(tk.due_date, tk.status);
              const taskAssigneeIds = assigneesByTask?.[tk.id] ?? [];
              const taskAssignees = taskAssigneeIds
                .map((uid) => users.find((u) => u.id === uid))
                .filter(Boolean) as Profile[];
              const dragThis = isAdmin || tk.assignee_id === user?.id || taskAssigneeIds.includes(user?.id ?? "");
              return (
                <div
                  key={tk.id}
                  draggable={dragThis}
                  onDragStart={() => setDragId(tk.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onOpen(tk.id)}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: "var(--surface-2)",
                    border: `1px solid ${overdue ? "rgba(240,103,106,.5)" : "var(--border)"}`,
                    cursor: dragThis ? "grab" : "pointer",
                    opacity: dragId === tk.id ? 0.4 : 1,
                    borderInlineStart: project ? `3px solid transparent` : undefined,
                    backgroundImage: project
                      ? `linear-gradient(var(--surface-2),var(--surface-2)), ${PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue}`
                      : undefined,
                    backgroundOrigin: "border-box",
                    backgroundClip: "padding-box, border-box",
                    transition: "transform .1s ease",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, marginBottom: 8, color: "var(--foreground)" }}>
                    {tk.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: overdue ? "#F0676A" : "var(--muted)", fontWeight: overdue ? 700 : 500 }}>
                      <PriorityDot p={tk.priority} />
                      <span>{tk.due_date ? formatDate(tk.due_date, lang) : "—"}</span>
                    </div>
                    {taskAssignees.length > 1
                      ? <AssigneeStack users={taskAssignees} size={22} max={3} />
                      : assignee && <Avatar id={assignee.id} name={assignee.full_name} size={22} />}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function PriorityDot({ p }: { p: string }) {
  const c = p === "urgent" ? "#F0676A" : p === "high" ? "#FF9255" : p === "normal" ? "#42C2EE" : "var(--muted)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />;
}
