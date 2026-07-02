import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { NewTaskModal } from "@/components/NewTaskModal";
import { isOverdue } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tasks")({ component: TasksPage });

function TasksPage() {
  const { t, lang, users, can } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filters, setFilters] = useState({ project: "", assignee: "", status: "", priority: "", overdue: false, q: "" });

  const { data, refetch } = useQuery({
    queryKey: ["tasks-list"],
    queryFn: async () => {
      const [tasks, projects] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("projects").select("id,name_ar,name_en,color"),
      ]);
      return { tasks: tasks.data ?? [], projects: projects.data ?? [] };
    },
  });

  const filtered = useMemo(() => {
    return (data?.tasks ?? []).filter((tk) => {
      if (filters.project && tk.project_id !== filters.project) return false;
      if (filters.assignee && tk.assignee_id !== filters.assignee) return false;
      if (filters.status && tk.status !== filters.status) return false;
      if (filters.priority && tk.priority !== filters.priority) return false;
      if (filters.overdue && !isOverdue(tk.due_date, tk.status)) return false;
      if (filters.q && !tk.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
      return true;
    });
  }, [data, filters]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, margin: 0, flex: 1 }}>{t("tasks")}</h1>
        {can("manage_tasks") && (
          <button onClick={() => setNewOpen(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
            <Plus size={18} /> {t("newTask")}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="brand-card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <Search size={16} style={{ position: "absolute", top: "50%", insetInlineStart: 10, transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input placeholder={t("search")} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ ...filterInp, paddingInlineStart: 34 }} />
        </div>
        <select value={filters.project} onChange={(e) => setFilters({ ...filters, project: e.target.value })} style={filterInp}>
          <option value="">{t("filterProject")}: {t("all")}</option>
          {(data?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{lang === "ar" ? p.name_ar : p.name_en}</option>)}
        </select>
        <select value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })} style={filterInp}>
          <option value="">{t("filterAssignee")}: {t("all")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={filterInp}>
          <option value="">{t("filterStatus")}: {t("all")}</option>
          {["todo", "in_progress", "paused", "done"].map((s) => <option key={s} value={s}>{t(s as never)}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} style={filterInp}>
          <option value="">{t("filterPriority")}: {t("all")}</option>
          {["low", "normal", "high", "urgent"].map((s) => <option key={s} value={s}>{t(s as never)}</option>)}
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14, cursor: "pointer", padding: "0 10px" }}>
          <input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })} style={{ width: 18, height: 18 }} />
          {t("onlyOverdue")}
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noTasks")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
          {filtered.map((tk) => (
            <TaskCard key={tk.id} task={tk}
              project={(data?.projects ?? []).find((p) => p.id === tk.project_id) ?? null}
              assignee={users.find((u) => u.id === tk.assignee_id) ?? null}
              onClick={() => setSelected(tk.id)} />
          ))}
        </div>
      )}

      {selected && <TaskDetailModal taskId={selected} onClose={() => setSelected(null)} onChanged={refetch} />}
      {newOpen && <NewTaskModal onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refetch(); }} />}
    </div>
  );
}

const filterInp: React.CSSProperties = {
  minHeight: 44, padding: "8px 12px", background: "var(--surface-2)",
  border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)",
  fontSize: 14, fontFamily: "inherit", outline: "none",
};
