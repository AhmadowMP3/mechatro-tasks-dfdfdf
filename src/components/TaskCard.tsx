import { StatusPill, PriorityPill, OverduePill } from "@/components/Pills";
import { Avatar } from "@/components/Avatar";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { formatDate, isOverdue, toLocalDigits } from "@/lib/format";
import { useApp } from "@/lib/app-context";
import type { Profile } from "@/lib/app-context";

export type TaskRow = {
  id: string; title: string; project_id: string; status: string; priority: string;
  progress: number; due_date: string | null; assignee_id: string | null;
};

export function TaskCard({ task, project, assignee, onClick }: {
  task: TaskRow;
  project?: { name_ar: string; name_en: string; color: string } | null;
  assignee?: Profile | null;
  onClick: () => void;
}) {
  const { lang, t } = useApp();
  const overdue = isOverdue(task.due_date, task.status);
  const projectName = project ? (lang === "ar" ? project.name_ar : project.name_en) : "";
  return (
    <button onClick={onClick} className="brand-card" style={{
      padding: 16, textAlign: lang === "ar" ? "right" : "left",
      cursor: "pointer", width: "100%", border: `1px solid ${overdue ? "rgba(240,103,106,.5)" : "var(--border)"}`,
      background: "var(--card)", color: "var(--foreground)", display: "block",
    }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        {project && (
          <span style={{
            padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff",
            background: PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue,
          }}>{projectName}</span>
        )}
        <PriorityPill priority={task.priority} />
        <StatusPill status={task.status} />
        {overdue && <OverduePill />}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: "6px 0" }}>{task.title}</h3>
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${task.progress}%`, height: "100%", background: "var(--grad-blue)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--muted)", alignItems: "center" }}>
          <span>{toLocalDigits(task.progress, lang)}%</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {assignee && <Avatar id={assignee.id} name={assignee.full_name} size={24} />}
            <span style={{ color: overdue ? "#F0676A" : "var(--muted)", fontWeight: overdue ? 700 : 500 }}>
              {task.due_date ? formatDate(task.due_date, lang) : t("na")}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
