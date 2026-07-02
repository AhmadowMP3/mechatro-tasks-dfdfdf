import { createFileRoute, Link } from "@tanstack/react-router";
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
  const { t, lang, user, isMasterAdmin } = useApp();
  const isAdmin = isMasterAdmin || user?.role === "admin";
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
        <TaskFlowCard
          title={t("taskDistribution")}
          segments={dist.map((d) => ({ key: d.key, label: t(d.key as DictKey), value: d.count, color: donutColor(d.key) }))}
          total={total}
          lang={lang}
        />


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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{t("recentActivity")}</h2>
          {isAdmin && (
            <Link to="/activity" style={{ fontSize: 13, color: "var(--brand-blue)", textDecoration: "none" }}>
              {t("activityLog")} →
            </Link>
          )}
        </div>
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

function TaskFlowCard({ title, segments, total, lang }: { title: string; segments: { key: string; label: string; value: number; color: string }[]; total: number; lang: "ar" | "en" }) {
  const done = segments.find((s) => s.key === "done")?.value ?? 0;
  const inProgress = segments.find((s) => s.key === "in_progress")?.value ?? 0;
  const paused = segments.find((s) => s.key === "paused")?.value ?? 0;
  const completionPct = total ? Math.round((done / total) * 100) : 0;
  const activityPct = total ? Math.round(((inProgress + done) / total) * 100) : 0;
  const max = Math.max(1, ...segments.map((s) => s.value));
  const icons: Record<string, string> = { todo: "○", in_progress: "◐", paused: "❚❚", done: "✓" };

  return (
    <div className="brand-card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
      {/* ambient glow */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(600px 200px at 100% 0%, rgba(66,194,238,.10), transparent 60%), radial-gradient(500px 220px at 0% 100%, rgba(115,201,78,.08), transparent 60%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 800, background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{toLocalDigits(total, lang)}</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{lang === "ar" ? "المهام" : "tasks"}</span>
        </div>
      </div>

      {/* Flow bar — full pipeline in one gradient stripe */}
      <div style={{ position: "relative", height: 14, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden", display: "flex" }}>
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.key} title={`${s.label} — ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: `linear-gradient(180deg, ${s.color}, ${s.color}CC)`, boxShadow: `inset 0 0 12px ${s.color}66` }} />
        ))}
      </div>

      {/* Column bars — creative status cells */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${segments.length}, 1fr)`, gap: 10, marginTop: 18 }}>
        {segments.map((s) => {
          const h = 90 * (s.value / max);
          return (
            <div key={s.key} style={{ position: "relative", padding: 12, borderRadius: 14, background: "linear-gradient(180deg, color-mix(in oklab, " + s.color + " 8%, transparent), transparent)", border: `1px solid color-mix(in oklab, ${s.color} 22%, var(--border))`, minHeight: 148, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: `${s.color}22`, color: s.color, fontSize: 13, fontWeight: 800 }}>{icons[s.key] ?? "•"}</span>
                <b style={{ fontSize: 22, color: s.color, lineHeight: 1 }}>{toLocalDigits(s.value, lang)}</b>
              </div>
              <div style={{ height: 90, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: Math.max(4, h), borderRadius: 8, background: `linear-gradient(180deg, ${s.color}, ${s.color}66)`, boxShadow: `0 0 24px ${s.color}55`, transition: "height .6s ease" }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
        <MiniGauge label={lang === "ar" ? "نسبة الإنجاز" : "Completion"} pct={completionPct} color="#73C94E" lang={lang} />
        <MiniGauge label={lang === "ar" ? "نسبة النشاط" : "In motion"} pct={activityPct} color="#42C2EE" lang={lang} />
      </div>

      {paused > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "#FF9255" }} />
          {toLocalDigits(paused, lang)} {lang === "ar" ? "مهمة متوقفة تحتاج انتباه" : "paused — needs attention"}
        </div>
      )}
    </div>
  );
}

function MiniGauge({ label, pct, color, lang }: { label: string; pct: number; color: string; lang: "ar" | "en" }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        <b style={{ fontSize: 14, color }}>{toLocalDigits(pct, lang)}%</b>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}88)`, boxShadow: `0 0 10px ${color}88`, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

