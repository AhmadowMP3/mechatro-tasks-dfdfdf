import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { formatDate, isOverdue, relativeTime, toLocalDigits } from "@/lib/format";
import { OverduePill } from "@/components/Pills";
import { useEffect, useMemo, useState } from "react";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import type { DictKey } from "@/i18n/dict";
import { FilterBar, DEFAULT_FILTERS, resolveRange, type DashboardFilters } from "@/components/dashboard/FilterBar";
import { LeaguePodiumCard } from "@/components/dashboard/LeaguePodiumCard";

type SearchParams = Partial<DashboardFilters>;

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (raw: Record<string, unknown>): SearchParams => {
    const allowedRanges = ["today", "7d", "30d", "90d", "all", "custom"] as const;
    const range = allowedRanges.includes(raw.range as never) ? (raw.range as DashboardFilters["range"]) : undefined;
    const arr = (v: unknown): string[] | undefined => {
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
      if (typeof v === "string" && v.length > 0) return v.split(",");
      return undefined;
    };
    const dateStr = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    return {
      range,
      from: dateStr(raw.from),
      to: dateStr(raw.to),
      projects: arr(raw.projects),
      statuses: arr(raw.statuses),
    };
  },
  component: Dashboard,
});

function Dashboard() {
  const { t, lang, user, isMasterAdmin } = useApp();
  const isAdmin = isMasterAdmin || user?.role === "admin";
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const filters: DashboardFilters = {
    range: search.range ?? DEFAULT_FILTERS.range,
    from: search.from,
    to: search.to,
    projects: search.projects ?? [],
    statuses: search.statuses ?? [],
  };
  const setFilters = (next: DashboardFilters) => {
    navigate({
      search: {
        range: next.range === DEFAULT_FILTERS.range ? undefined : next.range,
        from: next.from,
        to: next.to,
        projects: next.projects.length ? next.projects : undefined,
        statuses: next.statuses.length ? next.statuses : undefined,
      },
      replace: true,
    });
  };

  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const { data, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [tasksRes, projectsRes, activityRes, profilesRes, sessionsRes] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("projects").select("*"),
        supabase.from("activity_log").select("*").neq("action", "signed_in").neq("action", "signed_out").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id, full_name, avatar_url, role").eq("active", true),
        supabase.from("work_sessions").select("id, user_id, task_id, started_at, ended_at, duration_minutes").order("started_at", { ascending: false }).limit(500),
      ]);
      return {
        tasks: tasksRes.data ?? [],
        projects: projectsRes.data ?? [],
        activity: activityRes.data ?? [],
        profiles: profilesRes.data ?? [],
        sessions: sessionsRes.data ?? [],
      };
    },
  });

  const allTasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];
  const allActivity = data?.activity ?? [];
  const profiles = data?.profiles ?? [];
  const allSessions = data?.sessions ?? [];

  // Resolved range
  const { start: rangeStart, end: rangeEnd } = useMemo(() => resolveRange(filters), [filters.range, filters.from, filters.to]);
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (rangeStart && t < rangeStart.getTime()) return false;
    if (rangeEnd && t > rangeEnd.getTime()) return false;
    return true;
  };

  // Apply project + status filters to tasks
  const tasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (filters.projects.length && !filters.projects.includes(t.project_id)) return false;
      if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
      return true;
    });
  }, [allTasks, filters.projects, filters.statuses]);

  // Activity + sessions filtered by date range (and project when relevant)
  const activity = useMemo(() => {
    return allActivity.filter((a) => {
      if (a.action === "signed_in" || a.action === "signed_out") return false;
      if (rangeStart || rangeEnd) { if (!inRange(a.created_at)) return false; }
      return true;
    }).slice(0, 12);
  }, [allActivity, rangeStart, rangeEnd]);

  const sessions = useMemo(() => {
    return allSessions.filter((s) => {
      if (rangeStart || rangeEnd) { if (!inRange(s.started_at)) return false; }
      if (filters.projects.length) {
        const tk = allTasks.find((x) => x.id === s.task_id);
        if (!tk || !filters.projects.includes(tk.project_id)) return false;
      }
      return true;
    });
  }, [allSessions, rangeStart, rangeEnd, filters.projects, allTasks]);

  const active = tasks.filter((t) => t.status !== "done");
  const overdueTasks = tasks.filter((t) => isOverdue(t.due_date, t.status));
  const doneInRange = tasks.filter((t) => t.status === "done" && t.completed_at && (!rangeStart || !rangeEnd ? inRange(t.completed_at) || (!rangeStart && !rangeEnd) : inRange(t.completed_at)));
  const projectFilterActive = filters.projects.length > 0;
  const activeProjectsAll = projects.filter((p) => p.status === "active" && !p.archived);
  const activeProjects = projectFilterActive ? activeProjectsAll.filter((p) => filters.projects.includes(p.id)) : activeProjectsAll;

  const dist = ["todo", "in_progress", "paused", "done"].map((s) => ({
    key: s, count: tasks.filter((t) => t.status === s).length,
  }));
  const total = dist.reduce((a, b) => a + b.count, 0);

  // Momentum window: aligned to selected range; capped at 60 bars
  const momentumWindow = useMemo(() => {
    const end = rangeEnd ? new Date(rangeEnd) : new Date();
    end.setHours(0, 0, 0, 0);
    let days: number;
    if (rangeStart && rangeEnd) {
      days = Math.max(1, Math.min(60, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1));
    } else if (filters.range === "today") days = 1;
    else if (filters.range === "7d") days = 7;
    else if (filters.range === "30d") days = 30;
    else if (filters.range === "90d") days = 60;
    else days = 30;
    const buckets: { d: Date; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      buckets.push({ d, count: 0 });
    }
    tasks.filter((t) => t.status === "done" && t.completed_at).forEach((t) => {
      const c = new Date(t.completed_at!);
      const idx = buckets.findIndex((b) => c >= b.d && c < new Date(b.d.getTime() + 86400000));
      if (idx >= 0) buckets[idx].count++;
    });
    return buckets;
  }, [tasks, rangeStart, rangeEnd, filters.range]);
  const dayBuckets = momentumWindow;


  // Top active projects
  const projectStats = activeProjects.map((p) => {
    const list = tasks.filter((t) => t.project_id === p.id);
    const done = list.filter((t) => t.status === "done").length;
    return { p, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  // Workload per teammate
  const workload = profiles.map((pr) => {
    const list = active.filter((t) => t.assignee_id === pr.id);
    return { profile: pr, count: list.length, overdue: list.filter((t) => isOverdue(t.due_date, t.status)).length };
  }).sort((a, b) => b.count - a.count).slice(0, 6);
  const unassigned = active.filter((t) => !t.assignee_id).length;

  // Hours tracked within the current scope (sessions are already range/project-filtered)
  const hoursToday = sessions.reduce((sum, s) => {
    const mins = s.duration_minutes ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000 : 0);
    return sum + mins;
  }, 0) / 60;


  // Live now: sessions with no end
  const liveNow = sessions.filter((s) => !s.ended_at).length;

  // Streak: consecutive days ending today with ≥1 completion
  let streak = 0;
  for (let i = dayBuckets.length - 1; i >= 0; i--) {
    if (dayBuckets[i].count > 0) streak++;
    else break;
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t("greetingMorning");
    if (h < 18) return t("greetingAfternoon");
    return t("greetingEvening");
  };

  const timeStr = now.toLocaleTimeString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HERO */}
      <div className="brand-card" style={{ padding: "clamp(16px, 3vw, 24px)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 260px at 100% 0%, rgba(66,194,238,.15), transparent 60%), radial-gradient(600px 220px at 0% 100%, rgba(232,168,44,.10), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--brand-blue)", textTransform: "uppercase", marginBottom: 4 }}>
              {formatDate(new Date().toISOString(), lang)}
            </div>
            <h1 style={{ fontSize: "clamp(22px, 4.5vw, 30px)", margin: 0, lineHeight: 1.2 }}>
              {greeting()}، <span style={{ background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{user?.full_name}</span>
            </h1>
            <p style={{ color: "var(--muted)", marginTop: 6, marginBottom: 0, fontSize: 14 }}>
              {t("focusToday")} — {toLocalDigits(active.length, lang)} {lang === "ar" ? "مهمة نشطة" : "active tasks"}
              {overdueTasks.length > 0 && <> · <span style={{ color: "#F0676A", fontWeight: 700 }}>{toLocalDigits(overdueTasks.length, lang)} {lang === "ar" ? "متأخرة" : "overdue"}</span></>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <HeroChip icon="●" iconColor="#73C94E" pulse label={t("liveNow")} value={`${toLocalDigits(liveNow, lang)}`} />
            <HeroChip icon="⏱" iconColor="#42C2EE" label={t("hoursTracked")} value={toLocalDigits(hoursToday.toFixed(1), lang)} />
            <HeroChip icon="🔥" iconColor="#FF9255" label={t("streak")} value={toLocalDigits(streak, lang)} />
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 18, fontWeight: 700, letterSpacing: 1, color: "var(--brand-blue)" }}>
              {timeStr}
            </div>
          </div>

          {/* Filter bar */}
          <FilterBar value={filters} onChange={setFilters} projects={projects} />
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <StatCard label={t("activeTasks")} value={active.length} color="var(--grad-blue)" lang={lang} accent="#42C2EE" />
        <StatCard label={t("doneThisWeek")} value={doneInRange.length} color="var(--grad-green)" lang={lang} accent="#73C94E" trend={dayBuckets.slice(-7).map((b) => b.count)} />
        <StatCard label={t("overdueTasks")} value={overdueTasks.length} color="linear-gradient(135deg,#D9484B,#F0676A)" lang={lang} accent="#F0676A" highlight={overdueTasks.length > 0} />
        <StatCard label={t("activeProjects")} value={activeProjects.length} color="var(--grad-orange)" lang={lang} accent="#FF9255" />
      </div>


      {/* Momentum */}
      <MomentumCard buckets={dayBuckets} lang={lang} title={t("momentum")} />

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

      {/* Top projects + Workload */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <TopProjectsCard title={t("topProjects")} rows={projectStats} lang={lang} />
        <WorkloadCard title={t("workloadByOwner")} rows={workload} unassigned={unassigned} lang={lang} />
      </div>

      {/* League podium */}
      <LeaguePodiumCard />


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
        {activity.length === 0 ? <p style={{ color: "var(--muted)" }}>{t("noActivity")}</p> : activity.map((a) => {
          const color = actionColor(a.action);
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 10px ${color}88`, flex: "0 0 auto" }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t(a.action as DictKey) || a.action} {t(`entity_${a.entity_type}` as DictKey) || a.entity_type}
                {a.meta && typeof a.meta === "object" && "title" in a.meta ? ` — ${(a.meta as { title: string }).title}` : ""}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 12, flex: "0 0 auto" }}>{relativeTime(a.created_at, lang)}</span>
            </div>
          );
        })}
      </div>

      {selected && <TaskDetailModal taskId={selected} onClose={() => setSelected(null)} onChanged={refetch} />}
    </div>
  );
}

function HeroChip({ icon, iconColor, label, value, pulse }: { icon: string; iconColor: string; label: string; value: string; pulse?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <span style={{ color: iconColor, fontSize: 14, filter: pulse ? `drop-shadow(0 0 6px ${iconColor})` : undefined, animation: pulse ? "pulse 1.6s ease-in-out infinite" : undefined }}>{icon}</span>
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <b style={{ fontSize: 15, color: iconColor }}>{value}</b>
    </div>
  );
}

function StatCard({ label, value, color, lang, highlight, trend, accent }: { label: string; value: number; color: string; lang: "ar" | "en"; highlight?: boolean; trend?: number[]; accent?: string }) {
  return (
    <div className="brand-card" style={{ padding: 20, position: "relative", overflow: "hidden", borderColor: highlight ? "rgba(240,103,106,.5)" : "var(--border)" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(300px 120px at 100% 0%, ${accent ?? "#42C2EE"}22, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, background: color, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {toLocalDigits(value, lang)}
          </div>
        </div>
        {trend && trend.length > 1 && <Sparkline data={trend} color={accent ?? "#73C94E"} />}
      </div>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 36;
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sp-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sp-${color})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MomentumCard({ buckets, lang, title }: { buckets: { d: Date; count: number }[]; lang: "ar" | "en"; title: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const totalDone = buckets.reduce((s, b) => s + b.count, 0);
  const avg = (totalDone / buckets.length).toFixed(1);
  const w = 100 / buckets.length;
  const weekday = (d: Date) => d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "short" }).slice(0, 3);

  return (
    <div className="brand-card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(800px 200px at 50% 100%, rgba(115,201,78,.10), transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <div><b style={{ fontSize: 22, color: "#73C94E" }}>{toLocalDigits(totalDone, lang)}</b> <span style={{ color: "var(--muted)", fontSize: 12 }}>{lang === "ar" ? "مهمة" : "done"}</span></div>
          <div><b style={{ fontSize: 22, color: "#42C2EE" }}>{toLocalDigits(avg, lang)}</b> <span style={{ color: "var(--muted)", fontSize: 12 }}>{lang === "ar" ? "متوسط/يوم" : "avg/day"}</span></div>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 4, height: 120, padding: "0 2px" }}>
        {buckets.map((b, i) => {
          const h = (b.count / max) * 100;
          const isToday = i === buckets.length - 1;
          return (
            <div key={i} style={{ flex: `0 0 calc(${w}% - 4px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                <div title={`${b.count}`} style={{
                  width: "100%",
                  height: `${Math.max(3, h)}%`,
                  borderRadius: 6,
                  background: isToday
                    ? "linear-gradient(180deg, #42C2EE, #73C94E)"
                    : b.count > 0
                    ? "linear-gradient(180deg, #73C94E, #73C94E66)"
                    : "var(--surface-3)",
                  boxShadow: b.count > 0 ? `0 0 14px ${isToday ? "#42C2EE88" : "#73C94E55"}` : "none",
                  transition: "height .6s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, color: isToday ? "var(--brand-blue)" : "var(--muted)", fontWeight: isToday ? 700 : 500 }}>{weekday(b.d)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopProjectsCard({ title, rows, lang }: { title: string; rows: { p: { id: string; name_ar: string; name_en: string; color: string | null }; total: number; done: number; pct: number }[]; lang: "ar" | "en" }) {
  return (
    <div className="brand-card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 17, marginTop: 0, marginBottom: 14 }}>{title}</h2>
      {rows.length === 0 ? <p style={{ color: "var(--muted)" }}>—</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map(({ p, total, done, pct }) => {
            const color = p.color || "#42C2EE";
            return (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }} style={{ textDecoration: "none", color: "inherit" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, boxShadow: `0 0 8px ${color}88`, flex: "0 0 auto" }} />
                      <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lang === "ar" ? p.name_ar : p.name_en}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)", flex: "0 0 auto" }}>
                      {toLocalDigits(done, lang)}/{toLocalDigits(total, lang)} · <b style={{ color }}>{toLocalDigits(pct, lang)}%</b>
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}88)`, boxShadow: `0 0 10px ${color}66`, transition: "width .6s ease" }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkloadCard({ title, rows, unassigned, lang }: { title: string; rows: { profile: { id: string; full_name: string; avatar_url: string | null }; count: number; overdue: number }[]; unassigned: number; lang: "ar" | "en" }) {
  const max = Math.max(1, unassigned, ...rows.map((r) => r.count));
  const initials = (n: string) => n.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="brand-card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 17, marginTop: 0, marginBottom: 14 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(({ profile, count, overdue }) => (
          <div key={profile.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--grad-blue)", display: "grid", placeItems: "center", flex: "0 0 auto", fontSize: 12, fontWeight: 800, color: "#fff", overflow: "hidden" }}>
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(profile.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.full_name}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  <b style={{ color: "var(--foreground)" }}>{toLocalDigits(count, lang)}</b>
                  {overdue > 0 && <> · <span style={{ color: "#F0676A" }}>{toLocalDigits(overdue, lang)} {lang === "ar" ? "متأخرة" : "late"}</span></>}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
                <div style={{ width: `${(count / max) * 100}%`, height: "100%", background: overdue > 0 ? "linear-gradient(90deg, #F0676A, #FF9255)" : "linear-gradient(90deg, #42C2EE, #73C94E)", transition: "width .6s ease" }} />
              </div>
            </div>
          </div>
        ))}
        {unassigned > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--surface-3)", border: "1px dashed var(--border)", display: "grid", placeItems: "center", flex: "0 0 auto", color: "var(--muted)", fontSize: 14 }}>?</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{t_unassigned(lang)}</span>
                <b style={{ fontSize: 12 }}>{toLocalDigits(unassigned, lang)}</b>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
                <div style={{ width: `${(unassigned / max) * 100}%`, height: "100%", background: "linear-gradient(90deg, #86A1B7, #86A1B788)" }} />
              </div>
            </div>
          </div>
        )}
        {rows.length === 0 && unassigned === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>—</p>}
      </div>
    </div>
  );
}

function t_unassigned(lang: "ar" | "en") { return lang === "ar" ? "غير مُسنَد" : "Unassigned"; }

function donutColor(key: string) {
  return { todo: "#86A1B7", in_progress: "#42C2EE", paused: "#FF9255", done: "#73C94E" }[key] ?? "#86A1B7";
}

function actionColor(action: string) {
  if (action.includes("done") || action.includes("completed") || action.includes("created")) return "#73C94E";
  if (action.includes("deleted") || action.includes("removed")) return "#F0676A";
  if (action.includes("paused")) return "#FF9255";
  if (action.includes("signed") || action.includes("login")) return "#86A1B7";
  return "#42C2EE";
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
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(600px 200px at 100% 0%, rgba(66,194,238,.10), transparent 60%), radial-gradient(500px 220px at 0% 100%, rgba(115,201,78,.08), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 800, background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{toLocalDigits(total, lang)}</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{lang === "ar" ? "المهام" : "tasks"}</span>
        </div>
      </div>
      <div style={{ position: "relative", height: 14, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden", display: "flex" }}>
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.key} title={`${s.label} — ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: `linear-gradient(180deg, ${s.color}, ${s.color}CC)`, boxShadow: `inset 0 0 12px ${s.color}66` }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(110px, 1fr))`, gap: 10, marginTop: 18 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 16 }}>
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
