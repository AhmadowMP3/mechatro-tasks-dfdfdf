import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Archive, ArchiveRestore, CalendarPlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { Avatar } from "@/components/Avatar";
import { formatDate, toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";

import {
  FilterDrawer, FilterSection, ChipMultiSelect, FilterSelect,
  DateRangeControl, resolveDateRange, ActiveFilterChips,
  SearchField, FilterBarCluster, type Preset,
} from "@/components/filters/FilterDrawer";
import { exportToBrandedXlsx, type XlsxColumn } from "@/lib/export/xlsx";
import { promptFilename } from "@/components/FilenamePrompt";
import type { DictKey } from "@/i18n/dict";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/_authenticated/projects/")({ component: ProjectsPage });

type P = { id: string; name_ar: string; name_en: string; color: string; status: string; due_date: string | null; start_date: string | null; archived: boolean; description: string | null; created_at: string; created_by: string | null; };
type Task = { id: string; project_id: string | null; status: string; assignee_id: string | null };

const PROJECT_STATUSES = ["active", "on_hold", "done"] as const;
const BUCKETS = [
  { key: "b0", label: "0–25%", min: 0, max: 25 },
  { key: "b1", label: "26–50%", min: 26, max: 50 },
  { key: "b2", label: "51–75%", min: 51, max: 75 },
  { key: "b3", label: "76–100%", min: 76, max: 100 },
] as const;

type Filters = {
  q: string;
  statuses: string[];
  owners: string[];
  buckets: string[];
  archived: boolean;
  datePreset: Preset;
  dateField: "created_at" | "due_date";
  dateFrom: string;
  dateTo: string;
  sortField: "created_at" | "due_date" | "progress" | "name";
  sortDir: "asc" | "desc";
};
const DEFAULTS: Filters = {
  q: "", statuses: [], owners: [], buckets: [], archived: false,
  datePreset: "all", dateField: "created_at", dateFrom: "", dateTo: "",
  sortField: "created_at", sortDir: "desc",
};

function ProjectsPage() {
  const { t, lang, isAdmin, user, users } = useApp();
  const [modal, setModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<P | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [f, setF] = useState<Filters>(DEFAULTS);
  const patch = (p: Partial<Filters>) => setF((c) => ({ ...c, ...p }));

  const { data, refetch } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: async () => {
      const [projects, tasks] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("tasks").select("id,project_id,status,assignee_id"),
      ]);
      return { projects: (projects.data ?? []) as P[], tasks: (tasks.data ?? []) as Task[] };
    },
  });

  const enriched = useMemo(() => {
    return (data?.projects ?? []).map((p) => {
      const projTasks = (data?.tasks ?? []).filter((tk) => tk.project_id === p.id);
      const done = projTasks.filter((tk) => tk.status === "done").length;
      const progress = projTasks.length ? Math.round((done / projTasks.length) * 100) : 0;
      const memberIds = Array.from(new Set(projTasks.map((tk) => tk.assignee_id).filter(Boolean))) as string[];
      return { p, projTasks, done, progress, memberIds };
    });
  }, [data]);

  const filtered = useMemo(() => {
    const { since, until } = resolveDateRange(f.datePreset, f.dateFrom, f.dateTo);
    let out = enriched.filter(({ p, progress }) => {
      if (f.archived ? !p.archived : p.archived) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        if (!p.name_ar.toLowerCase().includes(q) && !p.name_en.toLowerCase().includes(q)) return false;
      }
      if (f.statuses.length && !f.statuses.includes(p.status)) return false;
      if (f.owners.length && !f.owners.includes(p.created_by ?? "")) return false;
      if (f.buckets.length) {
        const b = BUCKETS.find((x) => progress >= x.min && progress <= x.max);
        if (!b || !f.buckets.includes(b.key)) return false;
      }
      if (since || until) {
        const raw = p[f.dateField];
        if (!raw) return false;
        const d = new Date(raw);
        if (since && d < since) return false;
        if (until && d > until) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (f.sortField === "progress") { av = a.progress; bv = b.progress; }
      else if (f.sortField === "name") { av = (lang === "ar" ? a.p.name_ar : a.p.name_en).toLowerCase(); bv = (lang === "ar" ? b.p.name_ar : b.p.name_en).toLowerCase(); }
      else { av = new Date(a.p[f.sortField] ?? 0).getTime(); bv = new Date(b.p[f.sortField] ?? 0).getTime(); }
      if (av < bv) return f.sortDir === "asc" ? -1 : 1;
      if (av > bv) return f.sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [enriched, f, lang]);

  const chips = useMemo(() => {
    const c: { key: string; label: string; onRemove: () => void }[] = [];
    if (f.q) c.push({ key: "q", label: `"${f.q}"`, onRemove: () => patch({ q: "" }) });
    f.statuses.forEach((s) => c.push({ key: `s-${s}`, label: t(s as DictKey), onRemove: () => patch({ statuses: f.statuses.filter((x) => x !== s) }) }));
    f.owners.forEach((id) => {
      const u = users.find((x) => x.id === id);
      c.push({ key: `o-${id}`, label: u?.full_name ?? id, onRemove: () => patch({ owners: f.owners.filter((x) => x !== id) }) });
    });
    f.buckets.forEach((k) => {
      const b = BUCKETS.find((x) => x.key === k);
      c.push({ key: `b-${k}`, label: b?.label ?? k, onRemove: () => patch({ buckets: f.buckets.filter((x) => x !== k) }) });
    });
    // archived toggle is a top-level tab, not a removable chip
    if (f.datePreset !== "all") c.push({ key: "dr", label: `${t(f.dateField === "due_date" ? "dueSoon" : "createdAt")}`, onRemove: () => patch({ datePreset: "all", dateFrom: "", dateTo: "" }) });
    return c;
  }, [f, users, t]);

  const toggleArchive = async (p: P) => {
    const nextArchived = !p.archived;
    await supabase.from("projects").update({
      archived: nextArchived,
      status: nextArchived ? "archived" : "active",
    }).eq("id", p.id);
    toast.success(t("saved"));
    refetch();
  };


  const doExport = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = await promptFilename({
      defaultName: `Mechatro_Projects_${stamp}`,
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
        { key: "name", header: lang === "ar" ? "المشروع" : "Project", width: 40, get: (r) => lang === "ar" ? r.p.name_ar : r.p.name_en },
        { key: "status", header: t("filterStatus"), width: 14, kind: "status", get: (r) => t(r.p.status as never) },
        { key: "owner", header: lang === "ar" ? "المُنشئ" : "Owner", width: 24, get: (r) => users.find((u) => u.id === r.p.created_by)?.full_name ?? "" },
        { key: "start", header: lang === "ar" ? "البداية" : "Start", width: 14, kind: "date", get: (r) => r.p.start_date ?? r.p.created_at },
        { key: "due", header: t("dueDate"), width: 14, kind: "date", get: (r) => r.p.due_date },
        { key: "total", header: t("totalCount"), width: 12, kind: "number", get: (r) => r.projTasks.length },
        { key: "done", header: t("doneTasks"), width: 12, kind: "number", get: (r) => r.done },
        { key: "progress", header: t("progressLbl"), width: 14, kind: "percent", get: (r) => r.progress },
      ];
      await exportToBrandedXlsx({
        sheetName: t("projects"),
        title: `${t("reportTitle")} · ${t("projects")}`,
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

  const activeCount = chips.length;
  const owners = useMemo(() => Array.from(new Set((data?.projects ?? []).map((p) => p.created_by).filter(Boolean))) as string[], [data]);

  return (
    <div>
      <PageHeader
        title={t("projects")}
        actions={
          isAdmin ? (
            <button onClick={() => setModal(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
              <Plus size={18} /> {t("newProject")}
            </button>
          ) : null
        }
      />


      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div role="tablist" aria-label={lang === "ar" ? "عرض" : "View"} style={{ display: "inline-flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: 4 }}>
          {([false, true] as const).map((val) => {
            const active = f.archived === val;
            const label = val ? (lang === "ar" ? "مؤرشفة" : "Archived") : (lang === "ar" ? "نشطة" : "Active");
            return (
              <button
                key={String(val)}
                role="tab"
                aria-selected={active}
                onClick={() => patch({ archived: val })}
                style={{
                  minHeight: 36, padding: "6px 16px", borderRadius: 999, border: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  background: active ? "var(--grad-blue)" : "transparent",
                  color: active ? "#0B0F14" : "var(--muted)",
                  boxShadow: active ? "0 6px 18px rgba(66,194,238,.35)" : "none",
                  transition: "all .2s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
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

      <FilterDrawer open={drawerOpen} onOpenChange={setDrawerOpen} activeCount={activeCount} onReset={() => setF(DEFAULTS)}>
        <FilterSection label={t("filterStatus")}>
          <ChipMultiSelect
            value={f.statuses}
            onChange={(v) => patch({ statuses: v })}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: t(s as DictKey) }))}
          />
        </FilterSection>
        <FilterSection label={t("progressBucket")}>
          <ChipMultiSelect
            value={f.buckets}
            onChange={(v) => patch({ buckets: v })}
            options={BUCKETS.map((b) => ({ value: b.key, label: b.label }))}
          />
        </FilterSection>
        {isAdmin && (
          <FilterSection label={lang === "ar" ? "المُنشئ" : "Owner"}>
            <ChipMultiSelect
              value={f.owners}
              onChange={(v) => patch({ owners: v })}
              options={owners.map((id) => ({ value: id, label: users.find((u) => u.id === id)?.full_name ?? id }))}
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
          <DateRangeControl preset={f.datePreset} from={f.dateFrom} to={f.dateTo}
            onChange={({ preset, from, to }) => patch({ datePreset: preset, dateFrom: from, dateTo: to })} />
        </FilterSection>
        <FilterSection label={t("sortBy")}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <FilterSelect value={f.sortField} onChange={(v) => patch({ sortField: v as Filters["sortField"] })}
                options={[
                  { value: "created_at", label: t("createdAt") },
                  { value: "due_date", label: t("dueSoon") },
                  { value: "progress", label: t("progressLbl") },
                  { value: "name", label: lang === "ar" ? "الاسم" : "Name" },
                ]} />
            </div>
            <div style={{ flex: 1 }}>
              <FilterSelect value={f.sortDir} onChange={(v) => patch({ sortDir: v as "asc" | "desc" })}
                options={[{ value: "desc", label: t("sortDesc") }, { value: "asc", label: t("sortAsc") }]} />
            </div>
          </div>
        </FilterSection>
      </FilterDrawer>

      {filtered.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          {f.archived
            ? (lang === "ar" ? "لا توجد مشاريع مؤرشفة" : "No archived projects")
            : t("noProjects")}
        </div>

      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 280px), 1fr))", gap: 16 }}>
          {filtered.map(({ p, progress, memberIds }) => (
            <div key={p.id} className="brand-card" style={{ overflow: "hidden", position: "relative" }}>
              <div style={{ height: 6, background: PROJECT_COLORS[p.color] ?? PROJECT_COLORS.blue }} />
              <StatusPill status={p.status} lang={lang} label={t(p.status as never)} />
              <div style={{ padding: 18 }}>
                <Link to="/projects/$id" params={{ id: p.id }} style={{ color: "var(--foreground)", textDecoration: "none" }}>
                  <h3 style={{ fontSize: 17, margin: 0, marginBottom: 6 }}>{lang === "ar" ? p.name_ar : p.name_en}</h3>
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, minHeight: 34, overflow: "hidden" }}>{p.description || "—"}</p>
                </Link>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: "var(--muted)" }}>
                    <span>{t("progress")}</span>
                    <b>{toLocalDigits(progress, lang)}%</b>
                  </div>
                  <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "var(--grad-green)" }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, fontSize: 12, gap: 8 }}>
                  <MembersList ids={memberIds} />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: lang === "ar" ? "flex-start" : "flex-end", gap: 2 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)" }}>
                      <CalendarPlus size={12} style={{ color: "var(--brand-gold)" }} />
                      <span>{t("created")}:</span>
                      <b style={{ color: "var(--brand-gold)" }}>{formatDate(p.created_at, lang)}</b>
                    </span>
                    {p.due_date && (
                      <span style={{ color: "var(--muted)" }}>
                        {t("dueDate")}: <b style={{ color: "var(--foreground)" }}>{formatDate(p.due_date, lang)}</b>
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button onClick={() => toggleArchive(p)} style={{ flex: 1, minHeight: 40, borderRadius: 10, background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      {p.archived ? <><ArchiveRestore size={16} /> {t("unarchive")}</> : <><Archive size={16} /> {t("archive")}</>}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      aria-label={t("deleteProject")}
                      title={t("deleteProject")}
                      style={{ width: 44, minHeight: 40, borderRadius: 10, background: "var(--surface-2)", color: "#ff6b6b", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <NewProjectModal onClose={() => setModal(false)} onCreated={() => { setModal(false); refetch(); }} />}
      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); refetch(); }}
        />
      )}
    </div>
  );
}



function MembersList({ ids }: { ids: string[] }) {
  const { users } = useApp();
  return (
    <div style={{ display: "flex" }}>
      {ids.slice(0, 4).map((id, i) => {
        const u = users.find((u) => u.id === id);
        if (!u) return null;
        return <div key={id} style={{ marginInlineStart: i === 0 ? 0 : -8, border: "2px solid var(--card)", borderRadius: "50%" }}><Avatar id={u.id} name={u.full_name} size={26} /></div>;
      })}
      {ids.length > 4 && <span style={{ marginInlineStart: 6, color: "var(--muted)" }}>+{ids.length - 4}</span>}
    </div>
  );
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t, user, lang } = useApp();
  const [form, setForm] = useState({ name_ar: "", name_en: "", description: "", color: "blue", due_date: "" });
  const submit = async () => {
    if (!form.name_ar || !form.name_en) { toast.error(t("fullName")); return; }
    const { data, error } = await supabase.from("projects").insert({
      name_ar: form.name_ar, name_en: form.name_en,
      description: form.description || null,
      color: form.color, due_date: form.due_date || null,
      start_date: new Date().toISOString(),
      created_by: user?.id ?? null,
    }).select().single();
    if (error) {
      const { explainSupabaseError } = await import("@/lib/permission-errors");
      toast.error(
        explainSupabaseError(error, { action: "create", entity: "project", user, lang }),
        { duration: 8000 },
      );
      return;
    }
    void data;
    toast.success(t("created"));
    onCreated();
  };
  return (
    <ModalShell title={t("newProject")} onClose={onClose}>
      <Field label={`${t("fullName")} (ع)`}><input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} style={inp} /></Field>
      <Field label={`${t("fullName")} (EN)`}><input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} style={inp} /></Field>
      <Field label={t("description")}><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inp, minHeight: 70 }} /></Field>
      <Field label={t("color")}>
        <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={inp}>
          <option value="blue">Blue</option><option value="orange">Orange</option><option value="green">Green</option><option value="red">Red</option>
        </select>
      </Field>
      <Field label={t("dueDate")}><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} style={inp} /></Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={submit} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1 }}>{t("create")}</button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}

function DeleteProjectModal({ project, onClose, onDeleted }: { project: P; onClose: () => void; onDeleted: () => void }) {
  const { t, lang, user } = useApp();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const name = lang === "ar" ? project.name_ar : project.name_en;
  const canDelete = confirm.trim() === name.trim() && !busy;
  const submit = async () => {
    if (!canDelete) return;
    setBusy(true);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    setBusy(false);
    if (error) {
      const { explainSupabaseError } = await import("@/lib/permission-errors");
      toast.error(explainSupabaseError(error, { action: "delete", entity: "project", user, lang }), { duration: 8000 });
      return;
    }
    toast.success(t("projectDeleted"));
    onDeleted();
  };
  return (
    <ModalShell title={t("deleteProject")} onClose={onClose}>
      <div style={{ padding: 12, borderRadius: 10, background: "rgba(255,107,107,.08)", border: "1px solid rgba(255,107,107,.35)", color: "#ffb4b4", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
        {t("deleteProjectWarning")}
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
        <b style={{ color: "var(--foreground)" }}>{name}</b>
      </div>
      <Field label={t("typeToConfirm")}>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} style={inp} autoFocus />
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={submit}
          disabled={!canDelete}
          className="brand-btn"
          style={{ background: canDelete ? "#e5484d" : "var(--surface-2)", color: canDelete ? "#fff" : "var(--muted)", flex: 1, cursor: canDelete ? "pointer" : "not-allowed" }}
        >
          {t("deleteProject")}
        </button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}

export function ModalShell({ title, onClose, children, size = "md" }: { title: string; onClose: () => void; children: React.ReactNode; size?: "md" | "lg" }) {
  return (
    <ResponsiveModal title={title} onClose={onClose} size={size}>
      {children}
    </ResponsiveModal>
  );
}


export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

export const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", minHeight: 48,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  borderRadius: 10, color: "var(--foreground)", fontSize: 14, outline: "none", fontFamily: "inherit",
};
