import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { STATUS_STYLES, PROJECT_COLORS } from "@/lib/ui-tokens";
import { Avatar } from "@/components/Avatar";
import { formatDate, isOverdue, toLocalDigits } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import type { TaskRow } from "@/components/TaskCard";

type Project = { id: string; name_ar: string; name_en: string; color: string };
const COLUMNS = ["todo", "in_progress", "paused", "done"] as const;

export function KanbanView({
  tasks, projects, users, onOpen, onChanged,
}: {
  tasks: TaskRow[];
  projects: Project[];
  users: Profile[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const { t, lang, can, user } = useApp();
  const editable = can("manage_tasks");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  async function moveTask(id: string, status: string) {
    const task = tasks.find((x) => x.id === id);
    if (!task || task.status === status) return;
    const { error } = await supabase.from("tasks").update({ status: status as TaskRow["status"] }).eq("id", id);
    if (!error) {
      await logActivity(user?.id ?? null, "status", "task", id, { from: task.status, to: status });
      onChanged();
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(260px, 1fr))`,
        gap: 14,
        overflowX: "auto",
        paddingBottom: 8,
      }}
    >
      {COLUMNS.map((col) => {
        const style = STATUS_STYLES[col];
        const colTasks = tasks.filter((x) => x.status === col);
        const isOver = overCol === col;
        return (
          <div
            key={col}
            onDragOver={(e) => { if (editable && dragId) { e.preventDefault(); setOverCol(col); } }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={() => {
              if (editable && dragId) moveTask(dragId, col);
              setDragId(null); setOverCol(null);
            }}
            className="brand-card"
            style={{
              padding: 12,
              minHeight: 200,
              background: isOver ? "var(--surface-2)" : "var(--card)",
              border: `1px solid ${isOver ? style.text : "var(--border)"}`,
              transition: "border-color .15s ease, background .15s ease",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: `2px solid ${style.text}` }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: style.text }} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, flex: 1, color: style.text }}>{t(col as never)}</h3>
              <span style={{
                fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: "center",
                padding: "2px 8px", borderRadius: 999, background: style.bg, color: style.text,
              }}>{toLocalDigits(colTasks.length, lang)}</span>
            </div>
            {colTasks.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "18px 6px" }}>—</div>
            )}
            {colTasks.map((tk) => {
              const project = projects.find((p) => p.id === tk.project_id);
              const assignee = users.find((u) => u.id === tk.assignee_id);
              const overdue = isOverdue(tk.due_date, tk.status);
              return (
                <div
                  key={tk.id}
                  draggable={editable}
                  onDragStart={() => setDragId(tk.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onOpen(tk.id)}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: "var(--surface-2)",
                    border: `1px solid ${overdue ? "rgba(240,103,106,.5)" : "var(--border)"}`,
                    cursor: editable ? "grab" : "pointer",
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
                    {assignee && <Avatar id={assignee.id} name={assignee.full_name} size={22} />}
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
  const c = p === "urgent" ? "#F0676A" : p === "high" ? "#FF9255" : p === "normal" ? "#42C2EE" : "#86A1B7";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />;
}
