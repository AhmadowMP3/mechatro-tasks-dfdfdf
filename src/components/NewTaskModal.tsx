import { useEffect, useMemo, useState } from "react";
import { Clock, Zap } from "lucide-react";
import { DatePickerField } from "@/components/DatePickerField";

import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { notify } from "@/lib/activity";
import { ModalShell, Field, inp } from "@/routes/_authenticated/projects";
import { useQuery } from "@tanstack/react-query";
import { formatDate, toLocalDigits } from "@/lib/format";

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function endOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO); a.setHours(0, 0, 0, 0);
  const b = new Date(toISO); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

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

  // Live clock — updates every second while modal is open.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clockText = now.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", { hour12: false });
  const dateText = formatDate(now.toISOString(), lang);
  const minDate = todayISO(0);

  const duration = form.due_date ? daysBetween(minDate, form.due_date) : null;
  // Urgency ring color based on remaining days.
  const urgencyRing =
    duration == null ? "var(--border)"
      : duration < 0 ? "#F0676A"
      : duration === 0 ? "#F0676A"
      : duration <= 2 ? "#F5A623"
      : duration <= 7 ? "#F1C40F"
      : "#3ECF8E";

  const submit = async () => {
    if (!form.title || !form.project_id) { toast.error(t("title")); return; }
    const startISO = new Date().toISOString();
    const { data, error } = await supabase.from("tasks").insert({
      title: form.title, description: form.description || null,
      project_id: form.project_id, assignee_id: form.assignee_id || null,
      priority: form.priority as never, status: form.status as never,
      due_date: form.due_date || null, progress: 0,
      start_date: startISO, created_by: user?.id ?? null,
    }).select().single();
    if (error) {
      const { explainSupabaseError } = await import("@/lib/permission-errors");
      toast.error(
        explainSupabaseError(error, { action: "create", entity: "task", user, lang }),
        { duration: 8000 },
      );
      return;
    }
    if (data) {
      if (form.assignee_id && form.assignee_id !== user?.id) {
        await notify(form.assignee_id, "task_assigned",
          `تم إسنادك: ${form.title}`, `Assigned to you: ${form.title}`,
          undefined, data.id);
      }
    }

    toast.success(t("created"));
    onCreated();
  };

  const quickPicks: { label: string; value: string }[] = useMemo(() => [
    { label: t("today"), value: todayISO(0) },
    { label: t("plus1Day"), value: todayISO(1) },
    { label: t("plus3Days"), value: todayISO(3) },
    { label: t("plus1Week"), value: todayISO(7) },
    { label: t("plus2Weeks"), value: todayISO(14) },
    { label: t("endOfMonth"), value: endOfMonthISO() },
  ], [t, now.getDate()]); // recompute if day rolls over

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
    background: active ? "var(--grad-blue)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--foreground)",
    cursor: "pointer", transition: "all .15s",
  });

  return (
    <ModalShell title={t("newTask")} onClose={onClose}>
      {/* Live clock chip — "Starts now" */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderRadius: 12, background: "var(--grad-blue)", color: "#fff",
        marginBottom: 14, boxShadow: "0 6px 18px rgba(37,99,235,.25)",
      }}>
        <Zap size={16} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontSize: 11, opacity: .85, fontWeight: 600 }}>{t("startsNow")}</span>
          <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {dateText} · {toLocalDigits(clockText, lang)}
          </span>
        </div>
        <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6, opacity: .9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#3ECF8E", boxShadow: "0 0 0 4px rgba(62,207,142,.25)" }} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>{t("liveClock")}</span>
        </div>
      </div>

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

      {/* Due date block: quick chips + ringed input + duration readout */}
      <Field label={t("dueDate")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center", marginInlineEnd: 4 }}>{t("quickPick")}:</span>
          {quickPicks.map((qp) => (
            <button
              key={qp.label}
              type="button"
              onClick={() => setForm({ ...form, due_date: qp.value })}
              style={chipStyle(form.due_date === qp.value)}
            >{qp.label}</button>
          ))}
        </div>
        <div style={{
          padding: 2, borderRadius: 12,
          background: form.due_date ? urgencyRing : "transparent",
          transition: "background .2s",
        }}>
          <DatePickerField
            value={form.due_date}
            min={minDate}
            lang={lang}
            placeholder={t("pickDate")}
            onChange={(v) => setForm({ ...form, due_date: v })}
          />
        </div>

        {form.due_date && duration != null && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 8,
            fontSize: 12, color: "var(--muted)",
          }}>
            <Clock size={13} style={{ color: urgencyRing }} />
            <span>
              <strong style={{ color: "var(--foreground)" }}>{t("duration")}:</strong>{" "}
              {duration === 0 ? t("sameDay") : `${toLocalDigits(Math.abs(duration), lang)} ${t("days")}`}
            </span>
            <span style={{ opacity: .6 }}>·</span>
            <span>{t("endsOn")} {formatDate(form.due_date, lang)}</span>
          </div>
        )}
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={submit} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1 }}>{t("create")}</button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}
