import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Archive, ArchiveRestore } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { Avatar } from "@/components/Avatar";
import { formatDate, toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

type P = { id: string; name_ar: string; name_en: string; color: string; status: string; due_date: string | null; archived: boolean; description: string | null; };

function ProjectsPage() {
  const { t, lang, can, user } = useApp();
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: async () => {
      const [projects, tasks] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("tasks").select("id,project_id,status,assignee_id"),
      ]);
      return { projects: (projects.data ?? []) as P[], tasks: tasks.data ?? [] };
    },
  });

  const projects = (data?.projects ?? []).filter((p) => showArchived ? p.archived : !p.archived);

  const toggleArchive = async (p: P) => {
    await supabase.from("projects").update({ archived: !p.archived }).eq("id", p.id);
    toast.success(t("saved"));
    await logActivity(user?.id ?? null, "act_update", "project", p.id, { title: lang === "ar" ? p.name_ar : p.name_en });
    refetch();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, margin: 0, flex: 1 }}>{t("projects")}</h1>
        <button onClick={() => setShowArchived((v) => !v)} className="brand-btn-sm" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
          {showArchived ? t("hideArchived") : t("showArchived")}
        </button>
        {can("manage_projects") && (
          <button onClick={() => setModal(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
            <Plus size={18} /> {t("newProject")}
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noProjects")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {projects.map((p) => {
            const projTasks = (data?.tasks ?? []).filter((t) => t.project_id === p.id);
            const doneCount = projTasks.filter((t) => t.status === "done").length;
            const progress = projTasks.length ? Math.round((doneCount / projTasks.length) * 100) : 0;
            const memberIds = Array.from(new Set(projTasks.map((t) => t.assignee_id).filter(Boolean))) as string[];
            return (
              <div key={p.id} className="brand-card" style={{ overflow: "hidden" }}>
                <div style={{ height: 6, background: PROJECT_COLORS[p.color] ?? PROJECT_COLORS.blue }} />
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 12 }}>
                    <div style={{ display: "flex", gap: -8 }}>
                      <MembersList ids={memberIds} />
                    </div>
                    <span style={{ color: "var(--muted)" }}>{formatDate(p.due_date, lang)}</span>
                  </div>
                  {can("manage_projects") && (
                    <button onClick={() => toggleArchive(p)} style={{ marginTop: 12, width: "100%", minHeight: 40, borderRadius: 10, background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      {p.archived ? <><ArchiveRestore size={16} /> {t("unarchive")}</> : <><Archive size={16} /> {t("archive")}</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <NewProjectModal onClose={() => setModal(false)} onCreated={() => { setModal(false); refetch(); }} />}
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
  const { t, user } = useApp();
  const [form, setForm] = useState({ name_ar: "", name_en: "", description: "", color: "blue", due_date: "", start_date: "" });
  const submit = async () => {
    if (!form.name_ar || !form.name_en) { toast.error(t("fullName")); return; }
    const { data, error } = await supabase.from("projects").insert({
      name_ar: form.name_ar, name_en: form.name_en,
      description: form.description || null,
      color: form.color, due_date: form.due_date || null,
      start_date: form.start_date || null,
      created_by: user?.id ?? null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) await logActivity(user?.id ?? null, "act_create", "project", data.id, { title: form.name_ar });
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
      <Field label={t("startDate")}><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inp} /></Field>
      <Field label={t("dueDate")}><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} style={inp} /></Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={submit} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1 }}>{t("create")}</button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}

export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 20, overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="brand-card" style={{ maxWidth: 520, width: "100%", padding: 24, marginTop: 40 }}>
        <h2 style={{ margin: 0, marginBottom: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
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
