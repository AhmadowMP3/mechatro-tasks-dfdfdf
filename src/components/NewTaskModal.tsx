import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { logActivity, notify } from "@/lib/activity";
import { ModalShell, Field, inp } from "@/routes/_authenticated/projects";
import { useQuery } from "@tanstack/react-query";

export function NewTaskModal({ onClose, onCreated, defaultProjectId }: { onClose: () => void; onCreated: () => void; defaultProjectId?: string }) {
  const { t, lang, user, users } = useApp();
  const { data: projects } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name_ar,name_en").eq("archived", false)).data ?? [],
  });
  const [form, setForm] = useState({
    title: "", description: "", project_id: defaultProjectId ?? "",
    assignee_id: "", priority: "normal", status: "todo", due_date: "",
  });

  const submit = async () => {
    if (!form.title || !form.project_id) { toast.error(t("title")); return; }
    const { data, error } = await supabase.from("tasks").insert({
      title: form.title, description: form.description || null,
      project_id: form.project_id, assignee_id: form.assignee_id || null,
      priority: form.priority as never, status: form.status as never,
      due_date: form.due_date || null, progress: 0, created_by: user?.id ?? null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) {
      await logActivity(user?.id ?? null, "act_create", "task", data.id, { title: form.title });
      if (form.assignee_id && form.assignee_id !== user?.id) {
        await notify(form.assignee_id, "task_assigned",
          `تم إسنادك: ${form.title}`, `Assigned to you: ${form.title}`,
          undefined, data.id);
      }
    }
    toast.success(t("created"));
    onCreated();
  };

  return (
    <ModalShell title={t("newTask")} onClose={onClose}>
      <Field label={t("title")}><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inp} /></Field>
      <Field label={t("description")}><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inp, minHeight: 70 }} /></Field>
      <Field label={t("filterProject")}>
        <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} style={inp}>
          <option value="">—</option>
          {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{lang === "ar" ? p.name_ar : p.name_en}</option>)}
        </select>
      </Field>
      <Field label={t("assignee")}>
        <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} style={inp}>
          <option value="">{t("none")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label={t("priority")}>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inp}>
            {["low", "normal", "high", "urgent"].map((s) => <option key={s} value={s}>{t(s as never)}</option>)}
          </select>
        </Field>
        <Field label={t("status")}>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inp}>
            {["todo", "in_progress", "paused", "done"].map((s) => <option key={s} value={s}>{t(s as never)}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t("dueDate")}><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} style={inp} /></Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={submit} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1 }}>{t("create")}</button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}
