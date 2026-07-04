import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, FileText } from "lucide-react";
import { GenerateReportDialog } from "@/components/team/GenerateReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/Pills";
import { toLocalDigits, formatMinutes, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ModalShell, Field, inp } from "@/routes/_authenticated/projects";
import {
  FilterDrawer, FilterSection, ChipMultiSelect, FilterSelect,
  ActiveFilterChips, SearchField, FilterBarCluster,
} from "@/components/filters/FilterDrawer";
import { exportToBrandedXlsx, type XlsxColumn } from "@/lib/export/xlsx";
import type { DictKey } from "@/i18n/dict";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/_authenticated/team")({ component: TeamPage });

const ROLES = ["admin", "manager", "member", "viewer"] as const;

type Filters = {
  q: string;
  roles: string[];
  statuses: ("active" | "inactive")[];
  sortField: "name" | "total" | "done" | "completion";
  sortDir: "asc" | "desc";
};
const DEFAULTS: Filters = { q: "", roles: [], statuses: [], sortField: "name", sortDir: "asc" };

function TeamPage() {
  const { t, lang, isAdmin, user, users, directory, refreshUsers } = useApp();
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [record, setRecord] = useState<Profile | null>(null);
  const [report, setReport] = useState<Profile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [f, setF] = useState<Filters>(DEFAULTS);
  const patch = (p: Partial<Filters>) => setF((c) => ({ ...c, ...p }));

  const { data: aggregates } = useQuery({
    queryKey: ["team-agg"],
    queryFn: async () => {
      const [tasks, sessions] = await Promise.all([
        supabase.from("tasks").select("assignee_id,status,due_date,completed_at"),
        supabase.from("work_sessions").select("user_id,duration_minutes"),
      ]);
      return { tasks: tasks.data ?? [], sessions: sessions.data ?? [] };
    },
  });

  const statsFor = (uid: string) => {
    const ts = (aggregates?.tasks ?? []).filter((x) => x.assignee_id === uid);
    const open = ts.filter((x) => x.status !== "done").length;
    const done = ts.filter((x) => x.status === "done").length;
    const total = ts.length;
    const minutes = (aggregates?.sessions ?? []).filter((s) => s.user_id === uid).reduce((a, b) => a + (b.duration_minutes ?? 0), 0);
    const completion = total ? Math.round((done / total) * 100) : 0;
    return { open, done, minutes, total, completion };
  };

  const baseList = useMemo(() => (isAdmin ? users : directory.map((d) => ({
    id: d.id, full_name: d.full_name, avatar_url: d.avatar_url,
    role: "member" as const, job_title: null, phone: null, active: true,
    language_pref: "ar", theme_pref: "dark",
  }))) as typeof users, [isAdmin, users, directory]);

  const enriched = useMemo(() => baseList.map((u) => ({ u, s: statsFor(u.id) })), [baseList, aggregates]);

  const filtered = useMemo(() => {
    let out = enriched.filter(({ u }) => {
      if (f.q && !u.full_name.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.roles.length && !f.roles.includes(u.role)) return false;
      if (f.statuses.length) {
        const st = u.active ? "active" : "inactive";
        if (!f.statuses.includes(st as never)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (f.sortField === "name") { av = a.u.full_name.toLowerCase(); bv = b.u.full_name.toLowerCase(); }
      else if (f.sortField === "total") { av = a.s.total; bv = b.s.total; }
      else if (f.sortField === "done") { av = a.s.done; bv = b.s.done; }
      else { av = a.s.completion; bv = b.s.completion; }
      if (av < bv) return f.sortDir === "asc" ? -1 : 1;
      if (av > bv) return f.sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [enriched, f]);

  const chips = useMemo(() => {
    const c: { key: string; label: string; onRemove: () => void }[] = [];
    if (f.q) c.push({ key: "q", label: `"${f.q}"`, onRemove: () => patch({ q: "" }) });
    f.roles.forEach((r) => c.push({ key: `r-${r}`, label: t(r as DictKey), onRemove: () => patch({ roles: f.roles.filter((x) => x !== r) }) }));
    f.statuses.forEach((s) => c.push({ key: `s-${s}`, label: t((s === "active" ? "activeMember" : "inactiveMember") as DictKey), onRemove: () => patch({ statuses: f.statuses.filter((x) => x !== s) }) }));
    return c;
  }, [f, t]);

  const activeCount = chips.length;

  const doExport = async () => {
    try {
      const cols: XlsxColumn<typeof filtered[number]>[] = [
        { key: "name", header: t("fullName"), width: 30, get: (r) => r.u.full_name },
        { key: "role", header: t("role"), width: 16, get: (r) => t(r.u.role as DictKey) },
        { key: "job", header: t("jobTitle"), width: 24, get: (r) => r.u.job_title ?? "" },
        { key: "status", header: t("memberStatus"), width: 12, kind: "status", get: (r) => r.u.active ? "active" : "archived" },
        { key: "total", header: t("totalCount"), width: 12, kind: "number", get: (r) => r.s.total },
        { key: "done", header: t("doneTasks"), width: 12, kind: "number", get: (r) => r.s.done },
        { key: "open", header: t("openTasks"), width: 12, kind: "number", get: (r) => r.s.open },
        { key: "hours", header: t("hoursLogged"), width: 12, kind: "number", get: (r) => Math.round(r.s.minutes / 60) },
        { key: "completion", header: t("completionRate"), width: 14, kind: "percent", get: (r) => r.s.completion },
      ];
      await exportToBrandedXlsx({
        sheetName: t("team"),
        title: `${t("reportTitle")} · ${t("team")}`,
        filtersSummary: chips.map((c) => c.label).join(" · ") || (lang === "ar" ? "بدون فلاتر" : "No filters"),
        generatedBy: user?.full_name,
        lang, columns: cols, rows: filtered,
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
        title={t("team")}
        actions={
          isAdmin ? (
            <button onClick={() => setAdd(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
              <Plus size={18} /> {t("addMember")}
            </button>
          ) : null
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

      <FilterDrawer open={drawerOpen} onOpenChange={setDrawerOpen} activeCount={activeCount} onReset={() => setF(DEFAULTS)}>
        {isAdmin && (
          <FilterSection label={t("role")}>
            <ChipMultiSelect value={f.roles} onChange={(v) => patch({ roles: v })}
              options={ROLES.map((r) => ({ value: r, label: t(r as DictKey) }))} />
          </FilterSection>
        )}
        <FilterSection label={t("memberStatus")}>
          <ChipMultiSelect value={f.statuses} onChange={(v) => patch({ statuses: v as Filters["statuses"] })}
            options={[
              { value: "active", label: t("activeMember"), color: "#3F782A" },
              { value: "inactive", label: t("inactiveMember"), color: "#86A1B7" },
            ]} />
        </FilterSection>
        <FilterSection label={t("sortBy")}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <FilterSelect value={f.sortField} onChange={(v) => patch({ sortField: v as Filters["sortField"] })}
                options={[
                  { value: "name", label: t("fullName") },
                  { value: "total", label: t("totalCount") },
                  { value: "done", label: t("doneTasks") },
                  { value: "completion", label: t("completionRate") },
                ]} />
            </div>
            <div style={{ flex: 1 }}>
              <FilterSelect value={f.sortDir} onChange={(v) => patch({ sortDir: v as "asc" | "desc" })}
                options={[{ value: "asc", label: t("sortAsc") }, { value: "desc", label: t("sortDesc") }]} />
            </div>
          </div>
        </FilterSection>
      </FilterDrawer>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 280px), 1fr))", gap: 16 }}>
        {filtered.map(({ u, s }) => (
          <div key={u.id} className="brand-card" style={{ padding: 20, opacity: u.active ? 1 : 0.6 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Avatar id={u.id} name={u.full_name} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.full_name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{u.job_title || "—"}</div>
              </div>
              {isAdmin && <RoleBadge role={u.role} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14, textAlign: "center" }}>
              <MiniStat label={t("openTasks")} value={toLocalDigits(s.open, lang)} />
              <MiniStat label={t("doneTasks")} value={toLocalDigits(s.done, lang)} />
              <MiniStat label={t("hoursLogged")} value={toLocalDigits(Math.round(s.minutes / 60), lang)} />
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={() => setRecord(u)} className="brand-btn-sm" style={{ flex: 1, minWidth: 90, minHeight: 44, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("record")}</button>
                <button onClick={() => setEdit(u)} className="brand-btn-sm" style={{ flex: 1, minWidth: 90, minHeight: 44, background: "var(--grad-blue)", color: "#fff" }}>{t("editMember")}</button>
                <button onClick={() => setReport(u)} className="brand-btn-sm"
                  title={t("generateReport")}
                  style={{ flex: "0 0 auto", minHeight: 44, padding: "0 14px", background: "linear-gradient(135deg,#FF8A3D,#F0676A)", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <FileText size={14} /> PDF
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {add && <MemberModal onClose={() => setAdd(false)} onSaved={() => { setAdd(false); refreshUsers(); }} />}
      {edit && <MemberModal member={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refreshUsers(); }} />}
      {record && <RecordModal member={record} onClose={() => setRecord(null)} />}
      {report && <GenerateReportDialog member={report} onClose={() => setReport(null)} />}
    </div>
  );
}



function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "8px 4px", background: "var(--surface-2)", borderRadius: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

function MemberModal({ member, onClose, onSaved }: { member?: Profile; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const [form, setForm] = useState({
    full_name: member?.full_name ?? "", role: member?.role ?? "member",
    job_title: member?.job_title ?? "", phone: member?.phone ?? "",
    active: member?.active ?? true,
  });
  const save = async () => {
    if (!form.full_name) { toast.error(t("fullName")); return; }
    if (member) {
      const { error } = await supabase.from("profiles").update({
        full_name: form.full_name, role: form.role as never, job_title: form.job_title || null,
        phone: form.phone || null, active: form.active,
      }).eq("id", member.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("profiles").insert({
        full_name: form.full_name, role: form.role as never,
        job_title: form.job_title || null, phone: form.phone || null,
        active: form.active, language_pref: "ar", theme_pref: "dark",
      });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(t("saved"));
    onSaved();
  };
  return (
    <ModalShell title={member ? t("editMember") : t("addMember")} onClose={onClose}>
      <Field label={t("fullName")}><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={inp} /></Field>
      <Field label={t("jobTitle")}><input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} style={inp} /></Field>
      <Field label={t("phone")}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inp} /></Field>
      <Field label={t("role")}>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as never })} style={inp}>
          {["admin", "manager", "member", "viewer"].map((r) => <option key={r} value={r}>{t(r as never)}</option>)}
        </select>
      </Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, marginBottom: 12 }}>
        <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ width: 18, height: 18 }} />
        {t("activate")}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1 }}>{t("save")}</button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}

function RecordModal({ member, onClose }: { member: Profile; onClose: () => void }) {
  const { t, lang } = useApp();
  const { data } = useQuery({
    queryKey: ["record", member.id],
    queryFn: async () => {
      const [tasks, sessions] = await Promise.all([
        supabase.from("tasks").select("*").eq("assignee_id", member.id).eq("status", "done").order("completed_at", { ascending: false }).limit(20),
        supabase.from("work_sessions").select("duration_minutes").eq("user_id", member.id),
      ]);
      return { tasks: tasks.data ?? [], sessions: sessions.data ?? [] };
    },
  });
  const minutes = (data?.sessions ?? []).reduce((a, b) => a + (b.duration_minutes ?? 0), 0);
  const onTime = (data?.tasks ?? []).filter((t) => t.due_date && t.completed_at && new Date(t.completed_at) <= new Date(t.due_date)).length;
  const pct = data?.tasks.length ? Math.round((onTime / data.tasks.length) * 100) : 0;
  return (
    <ModalShell title={`${t("record")} · ${member.full_name}`} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <MiniStat label={t("doneTasks")} value={toLocalDigits(data?.tasks.length ?? 0, lang)} />
        <MiniStat label={t("hoursLogged")} value={formatMinutes(minutes, lang)} />
        <MiniStat label={t("onTimePct")} value={`${toLocalDigits(pct, lang)}%`} />
      </div>
      <div style={{ maxHeight: 300, overflow: "auto" }}>
        {(data?.tasks ?? []).map((tk) => (
          <div key={tk.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
            <div style={{ fontWeight: 700 }}>{tk.title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(tk.completed_at, lang)}</div>
          </div>
        ))}
      </div>
      <button onClick={onClose} className="brand-btn" style={{ marginTop: 14, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", width: "100%" }}>{t("cancel")}</button>
    </ModalShell>
  );
}
