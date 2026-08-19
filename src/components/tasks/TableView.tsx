import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useApp, type Profile } from "@/lib/app-context";
import { StatusPill, PriorityPill } from "@/components/Pills";
import { AssigneeNames } from "@/components/AssigneeNames";
import { BulkCheckbox } from "@/lib/bulk-selection";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { formatDate, isOverdue, toLocalDigits } from "@/lib/format";
import type { TaskRow } from "@/components/TaskCard";

type Project = { id: string; name_ar: string; name_en: string; color: string };
type SortKey = "title" | "due_date" | "priority" | "status" | "progress";
const PRIO_RANK: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
const STATUS_RANK: Record<string, number> = { todo: 1, in_progress: 2, paused: 3, in_review: 4, done: 5 };

export function TableView({
  tasks, projects, users, assigneesByTask, onOpen,
  selectable, isSelected, onToggle, onToggleAll,
}: {
  tasks: TaskRow[];
  projects: Project[];
  users: Profile[];
  assigneesByTask?: Record<string, string[]>;
  onOpen: (id: string) => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onToggle?: (id: string) => void;
  onToggleAll?: (ids: string[], allSelected: boolean) => void;
}) {
  const { t, lang } = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "due_date", dir: "asc" });

  const sorted = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sort.key) {
        case "title": av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
        case "due_date": av = a.due_date ?? "9999"; bv = b.due_date ?? "9999"; break;
        case "priority": av = PRIO_RANK[a.priority] ?? 0; bv = PRIO_RANK[b.priority] ?? 0; break;
        case "status": av = STATUS_RANK[a.status] ?? 0; bv = STATUS_RANK[b.status] ?? 0; break;
        case "progress": av = a.progress; bv = b.progress; break;
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [tasks, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const H = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => toggle(k)}
      style={{
        textAlign: lang === "ar" ? "right" : "left",
        padding: "12px 14px", fontSize: 12, fontWeight: 800, color: "var(--muted)",
        textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );


  return (
    <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              {selectable && (
                <th style={{ ...thStatic(lang), width: 36, padding: "12px 8px" }}>
                  <BulkCheckbox
                    checked={sorted.length > 0 && sorted.every((tk) => isSelected?.(tk.id))}
                    onChange={() => {
                      const ids = sorted.map((tk) => tk.id);
                      const allSel = ids.length > 0 && ids.every((id) => isSelected?.(id));
                      onToggleAll?.(ids, allSel);
                    }}
                    stopPropagation={false}
                    label={lang === "ar" ? "تحديد الكل" : "Select all"}
                  />
                </th>
              )}
              <H k="title" label={t("title")} />
              <th className="hide-md" style={thStatic(lang)}>{t("filterProject")}</th>
              <th style={thStatic(lang)}>{t("assignee")}</th>
              <H k="status" label={t("status")} />
              <H k="priority" label={t("priority")} />
              <H k="due_date" label={t("dueDate")} />
              <H k="progress" label={t("progress")} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((tk, i) => {
              const project = projects.find((p) => p.id === tk.project_id);
              const assignee = users.find((u) => u.id === tk.assignee_id);
              const taskAssigneeIds = assigneesByTask?.[tk.id] ?? [];
              const taskAssignees = taskAssigneeIds
                .map((uid) => users.find((u) => u.id === uid))
                .filter(Boolean) as Profile[];
              const overdue = isOverdue(tk.due_date, tk.status);
              const rowSelected = selectable && isSelected?.(tk.id);
              return (
                <tr
                  key={tk.id}
                  onClick={(e) => {
                    if (selectable && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                      onToggle?.(tk.id);
                      return;
                    }
                    onOpen(tk.id);
                  }}
                  style={{
                    cursor: "pointer",
                    background: rowSelected
                      ? "color-mix(in oklab, var(--grad-blue, #189FD1) 15%, transparent)"
                      : i % 2 === 0 ? "transparent" : "color-mix(in oklab, var(--surface-2) 40%, transparent)",
                    borderBottom: "1px solid var(--border)",
                    transition: "background .12s ease",
                  }}
                  onMouseEnter={(e) => { if (!rowSelected) e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = rowSelected
                      ? "color-mix(in oklab, var(--grad-blue, #189FD1) 15%, transparent)"
                      : i % 2 === 0 ? "transparent" : "color-mix(in oklab, var(--surface-2) 40%, transparent)";
                  }}
                >
                  {selectable && (
                    <td style={{ ...td, width: 36, padding: "12px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <BulkCheckbox
                        checked={!!rowSelected}
                        onChange={() => onToggle?.(tk.id)}
                        label={lang === "ar" ? "تحديد" : "Select"}
                      />
                    </td>
                  )}
                  <td style={{ ...td, fontWeight: 700, color: "var(--foreground)" }}>{tk.title}</td>
                  <td className="hide-md" style={td}>
                    {project ? (
                      <span style={{
                        padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                        color: "#fff", background: PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue,
                      }}>{lang === "ar" ? project.name_ar : project.name_en}</span>
                    ) : (
                      <span style={{
                        padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                        color: "var(--muted)", background: "var(--surface-2)", border: "1px solid var(--border)",
                      }}>{lang === "ar" ? "بدون مشروع" : "No project"}</span>
                    )}
                  </td>
                  <td style={td}>
                    {taskAssignees.length > 1 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <AssigneeStack users={taskAssignees} size={24} max={3} />
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          {taskAssignees.length} {/* count hint */}
                        </span>
                      </span>
                    ) : assignee ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Avatar id={assignee.id} name={assignee.full_name} size={24} />
                        <span style={{ fontSize: 13 }}>{assignee.full_name}</span>
                      </span>
                    ) : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td style={td}><StatusPill status={tk.status} /></td>
                  <td style={td}><PriorityPill priority={tk.priority} /></td>
                  <td style={{ ...td, color: overdue ? "#F0676A" : "var(--foreground)", fontWeight: overdue ? 700 : 500, whiteSpace: "nowrap" }}>
                    {tk.due_date ? formatDate(tk.due_date, lang) : "—"}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
                      <div style={{ flex: 1, height: 6, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${tk.progress}%`, height: "100%", background: "var(--grad-blue)" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 32 }}>
                        {toLocalDigits(tk.progress, lang)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };
const thStatic = (lang: string): React.CSSProperties => ({
  textAlign: lang === "ar" ? "right" : "left",
  padding: "12px 14px", fontSize: 12, fontWeight: 800, color: "var(--muted)",
  textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
});
