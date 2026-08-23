// Manager-only aggregate board: one kanban-style column per employee showing
// their tasks plus per-employee KPIs (status counts, overdue, points,
// completion rate, logged hours). Read-only view — clicking a card opens the
// usual task detail modal.

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useApp, type Profile } from "@/lib/app-context";
import { TaskCard, type TaskRow } from "@/components/TaskCard";
import { Avatar } from "@/components/Avatar";
import { STATUS_STYLES, ROLE_STYLES } from "@/lib/ui-tokens";
import { isOverdue, toLocalDigits } from "@/lib/format";
import type { DictKey } from "@/i18n/dict";

export type MemberProject = { id: string; name_ar: string; name_en: string; color: string };

export type MemberGroup = {
  id: string;                 // profile id, or "__unassigned__"
  name: string;
  role: string | null;
  user: Profile | null;
  tasks: TaskRow[];
  counts: Record<string, number>;
  overdue: number;
  points: number;
  completionRate: number;     // 0..100
  hours: number;
};

export const UNASSIGNED_ID = "__unassigned__";
const STATUSES = ["todo", "in_progress", "paused", "in_review", "done"] as const;

/** Builds per-employee groups from the already-filtered task list. */
export function buildMemberGroups(opts: {
  tasks: TaskRow[];
  users: Profile[];
  assigneesByTask: Record<string, string[]>;
  hoursByUser: Record<string, number>;
  unassignedLabel: string;
}): MemberGroup[] {
  const { tasks, users, assigneesByTask, hoursByUser, unassignedLabel } = opts;

  const byUser = new Map<string, TaskRow[]>();
  const unassigned: TaskRow[] = [];

  for (const tk of tasks) {
    const ids = Array.from(new Set(assigneesByTask[tk.id] ?? (tk.assignee_id ? [tk.assignee_id] : [])));
    if (ids.length === 0) { unassigned.push(tk); continue; }
    for (const uid of ids) {
      const list = byUser.get(uid) ?? [];
      list.push(tk);
      byUser.set(uid, list);
    }
  }

  const stats = (list: TaskRow[]): Omit<MemberGroup, "id" | "name" | "role" | "user" | "tasks" | "hours"> => {
    const counts: Record<string, number> = { todo: 0, in_progress: 0, paused: 0, in_review: 0, done: 0 };
    let overdue = 0, points = 0, done = 0;
    for (const tk of list) {
      counts[tk.status] = (counts[tk.status] ?? 0) + 1;
      if (isOverdue(tk.due_date, tk.status)) overdue += 1;
      if (tk.status === "done") { done += 1; points += tk.points ?? 0; }
    }
    return {
      counts, overdue, points,
      completionRate: list.length ? Math.round((done / list.length) * 100) : 0,
    };
  };

  const groups: MemberGroup[] = users.map((u) => {
    const list = byUser.get(u.id) ?? [];
    return {
      id: u.id,
      name: u.full_name,
      role: u.role,
      user: u,
      tasks: list,
      hours: Math.round(((hoursByUser[u.id] ?? 0) / 60) * 10) / 10,
      ...stats(list),
    };
  });

  const openOf = (g: MemberGroup) => g.tasks.length - (g.counts.done ?? 0);
  groups.sort((a, b) => openOf(b) - openOf(a) || b.tasks.length - a.tasks.length);

  if (unassigned.length > 0) {
    groups.push({
      id: UNASSIGNED_ID,
      name: unassignedLabel,
      role: null,
      user: null,
      tasks: unassigned,
      hours: 0,
      ...stats(unassigned),
    });
  }

  return groups;
}

export function MemberBoard({
  groups, projects, users, assigneesByTask, onOpen, onExportPdf, onExportXlsx,
}: {
  groups: MemberGroup[];
  projects: MemberProject[];
  users: Profile[];
  assigneesByTask: Record<string, string[]>;
  onOpen: (id: string) => void;
  onExportPdf: (groups: MemberGroup[]) => void;
  onExportXlsx: (groups: MemberGroup[]) => void;
}) {
  const { t, lang } = useApp();
  const [hideEmpty, setHideEmpty] = useState(true);

  const shown = useMemo(
    () => (hideEmpty ? groups.filter((g) => g.tasks.length > 0) : groups),
    [groups, hideEmpty],
  );

  const num = (n: number) => toLocalDigits(n, lang);

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        marginBottom: 14,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minHeight: 40 }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{t("hideEmptyMembers")}</span>
        </label>

        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => onExportPdf(shown)}
            className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", minHeight: 44, padding: "10px 16px" }}
          >
            <FileText size={16} /> PDF
          </button>
          <button
            onClick={() => onExportXlsx(shown)}
            className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", minHeight: 44, padding: "10px 16px" }}
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <span style={{ display: "none" }}><Download size={0} /></span>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noTasks")}</div>
      ) : (
        <div
          className="member-board-scroll"
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(min(100%,300px),320px)",
            gap: 14,
            overflowX: "auto",
            paddingBottom: 10,
          }}
        >
          {shown.map((g) => {
            const roleStyle = g.role ? ROLE_STYLES[g.role] : null;
            return (
              <section
                key={g.id}
                className="brand-card"
                style={{
                  padding: 12,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minHeight: 200,
                }}
              >
                {/* Column head */}
                <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {g.user
                    ? <Avatar name={g.name} id={g.user.id} size={38} />
                    : <div style={{
                        width: 38, height: 38, borderRadius: "50%", background: "var(--surface-3, var(--card))",
                        border: "1px dashed var(--border)", display: "inline-flex", alignItems: "center",
                        justifyContent: "center", color: "var(--muted)", fontWeight: 800,
                      }}>—</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      {roleStyle && (
                        <span style={{
                          padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                          background: roleStyle.bg, color: roleStyle.text,
                        }}>{t(g.role as DictKey)}</span>
                      )}
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                        {num(g.tasks.length)} {t("tasks")}
                      </span>
                    </div>
                  </div>
                </header>

                {/* Status chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {STATUSES.map((s) => {
                    const c = g.counts[s] ?? 0;
                    if (!c) return null;
                    const st = STATUS_STYLES[s];
                    return (
                      <span key={s} style={{
                        padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                        background: st.bg, color: st.text, border: `1px solid ${st.ring}`,
                      }}>{t(s as DictKey)} {num(c)}</span>
                    );
                  })}
                  {g.overdue > 0 && (
                    <span style={{
                      padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                      background: "rgba(240,103,106,.18)", color: "#F0676A", border: "1px solid rgba(240,103,106,.4)",
                    }}>{t("overdue")} {num(g.overdue)}</span>
                  )}
                </div>

                {/* KPI strip */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 6px",
                }}>
                  <Kpi label={t("points")} value={num(g.points)} color="#F5A623" />
                  <Kpi label={t("completionRate")} value={`${num(g.completionRate)}%`} color="#73C94E" />
                  <Kpi label={t("loggedHours")} value={num(g.hours)} color="#42C2EE" />
                </div>

                {/* Tasks */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 620, overflowY: "auto" }}>
                  {g.tasks.length === 0 ? (
                    <div style={{ padding: 18, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t("noTasks")}</div>
                  ) : g.tasks.map((tk) => (
                    <TaskCard
                      key={`${g.id}-${tk.id}`}
                      task={tk}
                      project={projects.find((p) => p.id === tk.project_id) ?? null}
                      assignee={users.find((u) => u.id === tk.assignee_id) ?? null}
                      assignees={(assigneesByTask[tk.id] ?? []).map((uid) => users.find((u) => u.id === uid)).filter(Boolean) as Profile[]}
                      onClick={() => onOpen(tk.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}
