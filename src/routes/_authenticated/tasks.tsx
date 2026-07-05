import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { NewTaskModal } from "@/components/NewTaskModal";
import { ViewSwitcher, type TaskView } from "@/components/tasks/ViewSwitcher";
import { KanbanView } from "@/components/tasks/KanbanView";
import { TableView } from "@/components/tasks/TableView";

import { isOverdue, formatDate } from "@/lib/format";
import {
  FilterDrawer, FilterSection, ChipMultiSelect, FilterSelect,
  DateRangeControl, resolveDateRange, ActiveFilterChips,
  SearchField, FilterBarCluster, type Preset,
} from "@/components/filters/FilterDrawer";
import { exportToBrandedXlsx, type XlsxColumn } from "@/lib/export/xlsx";
import { promptFilename } from "@/components/FilenamePrompt";
import { toast } from "sonner";
import type { DictKey } from "@/i18n/dict";
import { PageHeader } from "@/components/layout/PageHeader";
import { useBulkSelection, BulkCheckbox } from "@/lib/bulk-selection";
import { Trash2, CircleDot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tasks")({ component: TasksPage });

const VIEW_KEY = "tasks.view";
const STATUSES = ["todo", "in_progress", "paused", "in_review", "done"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUS_COLORS: Record<string, string> = {
  todo: "var(--muted)", in_progress: "#189FD1", paused: "#E8732E",
  in_review: "#7C5CD1", done: "#3F782A",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--muted)", normal: "#189FD1", high: "#E8732E", urgent: "#D64545",
};

type Filters = {
  q: string;
  projects: string[];
  assignees: string[];
  statuses: string[];
  priorities: string[];
  overdue: boolean;
  hasAttachments: boolean;
  datePreset: Preset;
  dateField: "created_at" | "due_date";
  dateFrom: string;
  dateTo: string;
  sortField: "created_at" | "due_date" | "priority" | "title";
  sortDir: "asc" | "desc";
};

const DEFAULTS: Filters = {
  q: "", projects: [], assignees: [], statuses: [], priorities: [],
  overdue: false, hasAttachments: false,
  datePreset: "all", dateField: "created_at", dateFrom: "", dateTo: "",
  sortField: "created_at", sortDir: "desc",
};

function TasksPage() {
  const { t, lang, users, directory, isAdmin, user } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // Deep-link: open task modal from ?task=<id>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("task");
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<TaskView>(() => {
    if (typeof window === "undefined") return "cards";
    const v = window.localStorage.getItem(VIEW_KEY);
    return (v === "kanban" || v === "table" || v === "cards") ? v : "cards";
  });
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(VIEW_KEY, view); }, [view]);

  const [f, setF] = useState<Filters>(DEFAULTS);
  const patch = (p: Partial<Filters>) => setF((cur) => ({ ...cur, ...p }));

  const memberScope = !isAdmin && user ? user.id : null;
  const peopleForFilters = isAdmin
    ? users.map((u) => ({ id: u.id, full_name: u.full_name }))
    : directory.map((u) => ({ id: u.id, full_name: u.full_name }));

  const { data, refetch } = useQuery({
    queryKey: ["tasks-list", memberScope],
    queryFn: async () => {
      const tasksQ = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (memberScope) tasksQ.eq("assignee_id", memberScope);
      const [tasks, projects, files] = await Promise.all([
        tasksQ,
        supabase.from("projects").select("id,name_ar,name_en,color"),
        supabase.from("task_files").select("task_id"),
      ]);
      const fileCounts: Record<string, number> = {};
      for (const row of files.data ?? []) fileCounts[row.task_id] = (fileCounts[row.task_id] ?? 0) + 1;
      return { tasks: tasks.data ?? [], projects: projects.data ?? [], fileCounts };
    },
  });

  const projects = data?.projects ?? [];
  const fileCounts = data?.fileCounts ?? {};

  const filtered = useMemo(() => {
    const { since, until } = resolveDateRange(f.datePreset, f.dateFrom, f.dateTo);
    const priorityRank: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
    let out = (data?.tasks ?? []).filter((tk) => {
      if (f.projects.length && !f.projects.includes(tk.project_id ?? "")) return false;
      if (f.assignees.length && !f.assignees.includes(tk.assignee_id ?? "")) return false;
      if (f.statuses.length && !f.statuses.includes(tk.status)) return false;
      if (f.priorities.length && !f.priorities.includes(tk.priority)) return false;
      if (f.overdue && !isOverdue(tk.due_date, tk.status)) return false;
      if (f.hasAttachments && !(fileCounts[tk.id] > 0)) return false;
      if (f.q && !tk.title.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (since || until) {
        const raw = tk[f.dateField];
        if (!raw) return false;
        const d = new Date(raw);
        if (since && d < since) return false;
        if (until && d > until) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (f.sortField === "priority") { av = priorityRank[a.priority] ?? 0; bv = priorityRank[b.priority] ?? 0; }
      else if (f.sortField === "title") { av = (a.title ?? "").toLowerCase(); bv = (b.title ?? "").toLowerCase(); }
      else { av = new Date(a[f.sortField] ?? 0).getTime(); bv = new Date(b[f.sortField] ?? 0).getTime(); }
      if (av < bv) return f.sortDir === "asc" ? -1 : 1;
      if (av > bv) return f.sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [data, f, fileCounts]);

  // Global "N" shortcut / palette "New task" action.
  useEffect(() => {
    if (!isAdmin) return;
    const openNew = () => setNewOpen(true);
    window.addEventListener("app:new-task", openNew);
    return () => window.removeEventListener("app:new-task", openNew);
  }, [isAdmin]);

  // Bulk selection — admins only.
  const { isSelected, toggle, ids: selectedIds } = useBulkSelection({
    pageId: "tasks",
    items: filtered as Array<{ id: string }>,
    deps: [filtered.length, isAdmin, lang],
    buildBar: isAdmin
      ? (sel, clearSel) => {
          const runBulk = async (payload: Record<string, string>) => {
            const { error } = await supabase.from("tasks").update(payload as never).in("id", sel);
            if (error) { toast.error(error.message); return; }
            toast.success(t("saved"));
            clearSel();
            refetch();
          };
          return {
            count: sel.length,
            totalLabel: lang === "ar"
              ? `${sel.length} مهمة محددة`
              : `${sel.length} task${sel.length === 1 ? "" : "s"} selected`,
            actions: [
              {
                id: "todo", label: lang === "ar" ? "قيد الانتظار" : "To do",
                icon: <CircleDot size={14} />, onRun: () => runBulk({ status: "todo" }),
              },
              {
                id: "in_progress", label: lang === "ar" ? "قيد التنفيذ" : "In progress",
                icon: <CircleDot size={14} />, onRun: () => runBulk({ status: "in_progress" }),
              },
              {
                id: "done", label: lang === "ar" ? "مكتمل" : "Done",
                icon: <CircleDot size={14} />, onRun: () => runBulk({ status: "done" }),
              },
              {
                id: "priority-high", label: lang === "ar" ? "أولوية عالية" : "High priority",
                icon: <CircleDot size={14} />, onRun: () => runBulk({ priority: "high" }),
              },
              {
                id: "delete",
                label: lang === "ar" ? "حذف" : "Delete",
                icon: <Trash2 size={14} />,
                destructive: true,
                confirm: lang === "ar"
                  ? `حذف ${sel.length} مهمة؟`
                  : `Delete ${sel.length} task${sel.length === 1 ? "" : "s"}?`,
                onRun: async () => {
                  const { error } = await supabase.from("tasks").delete().in("id", sel);
                  if (error) { toast.error(error.message); return; }
                  toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
                  clearSel();
                  refetch();
                },
              },
            ],
          };
        }
      : () => null,
  });
  const bulkMode = selectedIds.length > 0;



  // Active-filter chips
  const chips = useMemo(() => {
    const c: { key: string; label: string; onRemove: () => void }[] = [];
    if (f.q) c.push({ key: "q", label: `"${f.q}"`, onRemove: () => patch({ q: "" }) });
    f.projects.forEach((id) => {
      const p = projects.find((x) => x.id === id);
      c.push({ key: `p-${id}`, label: p ? (lang === "ar" ? p.name_ar : p.name_en) : id, onRemove: () => patch({ projects: f.projects.filter((x) => x !== id) }) });
    });
    f.assignees.forEach((id) => {
      const u = peopleForFilters.find((x) => x.id === id);
      c.push({ key: `a-${id}`, label: u?.full_name ?? id, onRemove: () => patch({ assignees: f.assignees.filter((x) => x !== id) }) });
    });
    f.statuses.forEach((s) => c.push({ key: `s-${s}`, label: t(s as DictKey), onRemove: () => patch({ statuses: f.statuses.filter((x) => x !== s) }) }));
    f.priorities.forEach((s) => c.push({ key: `pr-${s}`, label: t(s as DictKey), onRemove: () => patch({ priorities: f.priorities.filter((x) => x !== s) }) }));
    if (f.overdue) c.push({ key: "od", label: t("onlyOverdue"), onRemove: () => patch({ overdue: false }) });
    if (f.hasAttachments) c.push({ key: "att", label: t("hasAttachments"), onRemove: () => patch({ hasAttachments: false }) });
    if (f.datePreset !== "all") c.push({ key: "dr", label: `${t(f.dateField === "due_date" ? "dueSoon" : "createdAt")}: ${t(("last" + (f.datePreset === "7d" ? "7Days" : f.datePreset === "30d" ? "30Days" : "")) as DictKey) || f.datePreset}`, onRemove: () => patch({ datePreset: "all", dateFrom: "", dateTo: "" }) });
    return c;
  }, [f, projects, peopleForFilters, lang, t]);

  const activeCount = chips.length;

  const doExport = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = await promptFilename({
      defaultName: `Mechatro_Tasks_${stamp}`,
      extension: "xlsx",
      title: t("filenamePromptTitle"),
      label: t("filenameLabel"),
      hint: t("filenameHint"),
      confirmLabel: t("exportXlsx"),
      cancelLabel: t("cancel"),
    });
    if (!fileName) return;
    try {
      const cols: XlsxColumn<typeof filtered[number]>[] = [
        { key: "title", header: t("taskTitle"), width: 42, get: (r) => r.title },
        { key: "project", header: t("filterProject"), width: 26, get: (r) => {
          const p = projects.find((x) => x.id === r.project_id); return p ? (lang === "ar" ? p.name_ar : p.name_en) : "";
        }},
        { key: "assignee", header: t("filterAssignee"), width: 24, get: (r) => {
          const u = peopleForFilters.find((x) => x.id === r.assignee_id); return u?.full_name ?? "";
        }},
        { key: "status", header: t("filterStatus"), width: 16, kind: "status", get: (r) => r.status },
        { key: "priority", header: t("filterPriority"), width: 14, kind: "priority", get: (r) => r.priority },
        { key: "start", header: lang === "ar" ? "بدأت" : "Started", width: 14, kind: "date", get: (r) => r.start_date ?? r.created_at },
        { key: "due", header: t("dueDate"), width: 14, kind: "date", get: (r) => r.due_date },
        { key: "files", header: lang === "ar" ? "المرفقات" : "Files", width: 10, kind: "number", get: (r) => fileCounts[r.id] ?? 0 },
      ];
      await exportToBrandedXlsx({
        sheetName: t("tasks"),
        title: `${t("reportTitle")} · ${t("tasks")}`,
        filtersSummary: chips.map((c) => c.label).join(" · ") || (lang === "ar" ? "بدون فلاتر" : "No filters"),
        generatedBy: user?.full_name,
        lang, columns: cols, rows: filtered, fileName,
      });
      toast.success(t("exported"));
    } catch (e) {
      toast.error(t("exportFailed"));
      console.error(e);
    }
  };

  return (
    <div>
      <PageHeader
        title={isAdmin ? t("tasks") : (lang === "ar" ? "مهامي" : "My Tasks")}
        actions={
          <>
            <ViewSwitcher value={view} onChange={setView} />
            {isAdmin && (
              <button onClick={() => setNewOpen(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
                <Plus size={18} /> {t("newTask")}
              </button>
            )}
          </>
        }
      />


      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <SearchField value={f.q} onChange={(v) => patch({ q: v })} />
        <FilterBarCluster
          activeCount={activeCount}
          onOpen={() => setDrawerOpen(true)}
          onReset={() => setF(DEFAULTS)}
          onExport={doExport}
          exportDisabled={!filtered.length}
        />
      </div>

      <ActiveFilterChips chips={chips} onClearAll={() => setF(DEFAULTS)} />

      <FilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        activeCount={activeCount}
        onReset={() => setF(DEFAULTS)}
      >
        <FilterSection label={t("filterStatus")}>
          <ChipMultiSelect
            value={f.statuses}
            onChange={(v) => patch({ statuses: v })}
            options={STATUSES.map((s) => ({ value: s, label: t(s), color: STATUS_COLORS[s] }))}
          />
        </FilterSection>

        <FilterSection label={t("filterPriority")}>
          <ChipMultiSelect
            value={f.priorities}
            onChange={(v) => patch({ priorities: v })}
            options={PRIORITIES.map((s) => ({ value: s, label: t(s), color: PRIORITY_COLORS[s] }))}
          />
        </FilterSection>

        <FilterSection label={t("filterProject")}>
          <ChipMultiSelect
            value={f.projects}
            onChange={(v) => patch({ projects: v })}
            options={projects.map((p) => ({ value: p.id, label: lang === "ar" ? p.name_ar : p.name_en }))}
          />
        </FilterSection>

        {isAdmin && (
          <FilterSection label={t("filterAssignee")}>
            <ChipMultiSelect
              value={f.assignees}
              onChange={(v) => patch({ assignees: v })}
              options={peopleForFilters.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </FilterSection>
        )}

        <FilterSection label={t("dateRange")}>
          <div style={{ marginBottom: 8 }}>
            <FilterSelect
              value={f.dateField}
              onChange={(v) => patch({ dateField: v as Filters["dateField"] })}
              options={[
                { value: "created_at", label: t("createdAt") },
                { value: "due_date", label: t("dueSoon") },
              ]}
            />
          </div>
          <DateRangeControl
            preset={f.datePreset}
            from={f.dateFrom}
            to={f.dateTo}
            onChange={({ preset, from, to }) => patch({ datePreset: preset, dateFrom: from, dateTo: to })}
          />
        </FilterSection>

        <FilterSection label={lang === "ar" ? "خيارات" : "Options"}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, cursor: "pointer" }}>
            <input type="checkbox" checked={f.overdue} onChange={(e) => patch({ overdue: e.target.checked })} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14 }}>{t("onlyOverdue")}</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, cursor: "pointer" }}>
            <input type="checkbox" checked={f.hasAttachments} onChange={(e) => patch({ hasAttachments: e.target.checked })} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14 }}>{t("hasAttachments")}</span>
          </label>
        </FilterSection>

        <FilterSection label={t("sortBy")}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <FilterSelect
                value={f.sortField}
                onChange={(v) => patch({ sortField: v as Filters["sortField"] })}
                options={[
                  { value: "created_at", label: t("createdAt") },
                  { value: "due_date", label: t("dueSoon") },
                  { value: "priority", label: t("filterPriority") },
                  { value: "title", label: t("taskTitle") },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FilterSelect
                value={f.sortDir}
                onChange={(v) => patch({ sortDir: v as "asc" | "desc" })}
                options={[
                  { value: "desc", label: t("sortDesc") },
                  { value: "asc", label: t("sortAsc") },
                ]}
              />
            </div>
          </div>
        </FilterSection>
      </FilterDrawer>

      {(() => {
        const displayUsers = (isAdmin ? users : directory.map((d) => ({
          id: d.id, full_name: d.full_name, avatar_url: d.avatar_url,
          role: "member" as const, job_title: null, phone: null, active: true,
          language_pref: "ar", theme_pref: "dark",
        }))) as typeof users;
        return filtered.length === 0 ? (
          <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noTasks")}</div>
        ) : view === "cards" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 280px),1fr))", gap: 14 }}>
            {filtered.map((tk) => {
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
                  onClick={(e) => {
                    if (bulkMode && isAdmin) { e.stopPropagation(); toggle(tk.id); }
                  }}
                >
                  {isAdmin && (
                    <div
                      onClick={(e) => { e.stopPropagation(); toggle(tk.id); }}
                      className="ref-bulk-check"
                      style={{
                        position: "absolute",
                        top: 10,
                        insetInlineStart: 10,
                        zIndex: 5,
                        opacity: checked || bulkMode ? 1 : 0,
                        transition: "opacity .12s",
                      }}
                    >
                      <BulkCheckbox checked={checked} onChange={() => toggle(tk.id)} label={lang === "ar" ? "تحديد" : "Select"} />
                    </div>
                  )}
                  <div style={{ pointerEvents: bulkMode ? "none" : "auto" }}>
                    <TaskCard task={tk}
                      project={projects.find((p) => p.id === tk.project_id) ?? null}
                      assignee={displayUsers.find((u) => u.id === tk.assignee_id) ?? null}
                      onClick={() => setSelected(tk.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === "kanban" ? (
          <KanbanView tasks={filtered} projects={projects} users={displayUsers} onOpen={setSelected} onChanged={refetch} />
        ) : (
          <TableView tasks={filtered} projects={projects} users={displayUsers} onOpen={setSelected} />
        );
      })()}

      {selected && <TaskDetailModal taskId={selected} onClose={closeTaskModal} onChanged={refetch} />}
      {newOpen && <NewTaskModal onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refetch(); }} />}
    </div>
  );
}

// (formatDate imported for potential future use of formatting summaries)
void formatDate;
