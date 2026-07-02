import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { formatDate, isOverdue, relativeTime, toLocalDigits } from "@/lib/format";
import { StatusPill, OverduePill } from "@/components/Pills";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { useState } from "react";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import type { DictKey } from "@/i18n/dict";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { t, lang, user } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [tasksRes, projectsRes, activityRes] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("projects").select("*"),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(15),
      ]);
      return {
        tasks: tasksRes.data ?? [],
        projects: projectsRes.data ?? [],
        activity: activityRes.data ?? [],
      };
    },
  });

  const tasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];
  const activity = data?.activity ?? [];

  const active = tasks.filter((t) => t.status !== "done");
  const overdueTasks = tasks.filter((t) => isOverdue(t.due_date, t.status));
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const doneWeek = tasks.filter((t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() > weekAgo);
  const activeProjects = projects.filter((p) => p.status === "active" && !p.archived);

  const dist = ["todo", "in_progress", "paused", "done"].map((s) => ({
    key: s, count: tasks.filter((t) => t.status === s).length,
  }));
  const total = dist.reduce((a, b) => a + b.count, 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t("greetingMorning");
    if (h < 18) return t("greetingAfternoon");
    return t("greetingEvening");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 28, margin: 0 }}>
          {greeting()}، <span style={{ background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{user?.full_name}</span>
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>{formatDate(new Date().toISOString(), lang)}</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
        <StatCard label={t("activeTasks")} value={active.length} color="var(--grad-blue)" lang={lang} />
        <StatCard label={t("doneThisWeek")} value={doneWeek.length} color="var(--grad-green)" lang={lang} />
        <StatCard label={t("overdueTasks")} value={overdueTasks.length} color="linear-gradient(135deg,#D9484B,#F0676A)" lang={lang} highlight={overdueTasks.length > 0} />
        <StatCard label={t("activeProjects")} value={activeProjects.length} color="var(--grad-orange)" lang={lang} />
      </div>

      {/* Distribution + Overdue */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div className="brand-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 17, marginTop: 0, marginBottom: 16 }}>{t("taskDistribution")}</h2>
          <Donut segments={dist.map((d) => ({ label: t(d.key as DictKey), value: d.count, color: donutColor(d.key) }))} lang={lang} total={total} />
        </div>

        <div className="brand-card" style={{ padding: 20, borderColor: overdueTasks.length ? "rgba(240,103,106,.5)" : "var(--border)" }}>
          <h2 style={{ fontSize: 17, marginTop: 0, marginBottom: 12, color: overdueTasks.length ? "#F0676A" : "var(--foreground)" }}>
            ⚠ {t("overdueTasks")}
          </h2>
          {overdueTasks.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>{t("noOverdue")}</p>
          ) : overdueTasks.slice(0, 6).map((tk) => {
            const p = projects.find((pr) => pr.id === tk.project_id);
            return (
              <button key={tk.id} onClick={() => setSelected(tk.id)} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border)", width: "100%", background: "none", color: "var(--foreground)", border: "none", borderBottomStyle: "solid", cursor: "pointer", textAlign: lang === "ar" ? "right" : "left", minHeight: 48 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.title}</div>
                  {p && <div style={{ fontSize: 12, color: "var(--muted)" }}>{lang === "ar" ? p.name_ar : p.name_en}</div>}
                </div>
                <OverduePill />
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity */}
      <div className="brand-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 17, marginTop: 0, marginBottom: 12 }}>{t("recentActivity")}</h2>
        {activity.length === 0 ? <p style={{ color: "var(--muted)" }}>{t("noActivity")}</p> : activity.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
            <span>
              {t(a.action as DictKey) || a.action} {t(`entity_${a.entity_type}` as DictKey) || a.entity_type}
              {a.meta && typeof a.meta === "object" && "title" in a.meta ? ` — ${(a.meta as { title: string }).title}` : ""}
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{relativeTime(a.created_at, lang)}</span>
          </div>
        ))}
      </div>

      {selected && <TaskDetailModal taskId={selected} onClose={() => setSelected(null)} onChanged={refetch} />}
    </div>
  );
}

function StatCard({ label, value, color, lang, highlight }: { label: string; value: number; color: string; lang: "ar" | "en"; highlight?: boolean }) {
  return (
    <div className="brand-card" style={{ padding: 20, position: "relative", overflow: "hidden", borderColor: highlight ? "rgba(240,103,106,.5)" : "var(--border)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, background: color, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        {toLocalDigits(value, lang)}
      </div>
    </div>
  );
}

function donutColor(key: string) {
  return { todo: "#86A1B7", in_progress: "#42C2EE", paused: "#FF9255", done: "#73C94E" }[key] ?? "#86A1B7";
}

function Donut({ segments, total, lang }: { segments: { label: string; value: number; color: string }[]; total: number; lang: "ar" | "en" }) {
  if (total === 0) return <p style={{ color: "var(--muted)" }}>—</p>;
  const size = 180, r = 70, cx = size / 2, cy = size / 2;
  let acc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={22} />
        {segments.filter((s) => s.value > 0).map((s, i) => {
          const frac = s.value / total;
          const circ = 2 * Math.PI * r;
          const dash = frac * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={22}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-acc * circ}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          acc += frac;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={26} fontWeight={800} fill="var(--foreground)">{toLocalDigits(total, lang)}</text>
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={12} fill="var(--muted)">{lang === "ar" ? "المهام" : "tasks"}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 140 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color }} />
            <span style={{ flex: 1, fontSize: 13 }}>{s.label}</span>
            <b>{toLocalDigits(s.value, lang)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
