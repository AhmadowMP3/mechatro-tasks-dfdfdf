import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/Pills";
import { toLocalDigits, formatMinutes, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ModalShell, Field, inp } from "@/routes/projects";

export const Route = createFileRoute("/team")({ component: TeamPage });

function TeamPage() {
  const { t, lang, can, users, refreshUsers } = useApp();
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [record, setRecord] = useState<Profile | null>(null);

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

  const stats = (uid: string) => {
    const ts = (aggregates?.tasks ?? []).filter((x) => x.assignee_id === uid);
    const open = ts.filter((x) => x.status !== "done").length;
    const done = ts.filter((x) => x.status === "done").length;
    const minutes = (aggregates?.sessions ?? []).filter((s) => s.user_id === uid).reduce((a, b) => a + (b.duration_minutes ?? 0), 0);
    return { open, done, minutes };
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, margin: 0, flex: 1 }}>{t("team")}</h1>
        {can("manage_users") && (
          <button onClick={() => setAdd(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
            <Plus size={18} /> {t("addMember")}
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {users.map((u) => {
          const s = stats(u.id);
          return (
            <div key={u.id} className="brand-card" style={{ padding: 20, opacity: u.active ? 1 : 0.6 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar id={u.id} name={u.full_name} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.full_name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{u.job_title || "—"}</div>
                </div>
                <RoleBadge role={u.role} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14, textAlign: "center" }}>
                <MiniStat label={t("openTasks")} value={toLocalDigits(s.open, lang)} />
                <MiniStat label={t("doneTasks")} value={toLocalDigits(s.done, lang)} />
                <MiniStat label={t("hoursLogged")} value={toLocalDigits(Math.round(s.minutes / 60), lang)} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => setRecord(u)} className="brand-btn-sm" style={{ flex: 1, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("record")}</button>
                {can("manage_users") && <button onClick={() => setEdit(u)} className="brand-btn-sm" style={{ flex: 1, background: "var(--grad-blue)", color: "#fff" }}>{t("editMember")}</button>}
              </div>
            </div>
          );
        })}
      </div>

      {add && <MemberModal onClose={() => setAdd(false)} onSaved={() => { setAdd(false); refreshUsers(); }} />}
      {edit && <MemberModal member={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refreshUsers(); }} />}
      {record && <RecordModal member={record} onClose={() => setRecord(null)} />}
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
