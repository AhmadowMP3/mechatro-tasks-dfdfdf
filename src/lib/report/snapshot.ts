import type { ReportData } from "./data";

export type KpiSnapshot = {
  version: 1;
  member: { id: string; full_name: string; avatar_url: string | null; job_title: string | null };
  range: { from: string | null; to: string | null; label: string };
  totals: {
    tasks: number;
    done: number;
    in_progress: number;
    todo: number;
    paused: number;
    overdue: number;
    on_time: number;
    completion_pct: number;
    on_time_pct: number;
    avg_completion_hours: number;
    total_minutes: number;
    sessions: number;
    comments: number;
    files: number;
    activity: number;
    points: number;
    rank_position: number;
    rank_total: number;
  };
  status_dist: Record<string, number>;
  priority_dist: Record<string, number>;
  projects_touched: Array<{ id: string; name_en: string; name_ar: string; tasks: number }>;
  top_tasks: Array<{ id: string; title: string; status: string; priority: string; project_id: string | null; due_date: string | null }>;
  activity_by_day: Array<{ date: string; count: number }>;
};

export function buildKpiSnapshot(d: ReportData): KpiSnapshot {
  const tasks = d.tasks;
  const done = tasks.filter((t) => t.status === "done").length;
  const in_progress = tasks.filter((t) => t.status === "in_progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const paused = tasks.filter((t) => t.status === "paused").length;
  const now = Date.now();
  const overdue = tasks.filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < now).length;
  const on_time = tasks.filter((t) => t.status === "done" && t.due_date && t.completed_at && new Date(t.completed_at) <= new Date(t.due_date)).length;
  const completion_pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const doneWithDue = tasks.filter((t) => t.status === "done" && t.due_date).length;
  const on_time_pct = doneWithDue ? Math.round((on_time / doneWithDue) * 100) : 0;

  const completionDurations = tasks
    .filter((t) => t.status === "done" && t.completed_at && (t.start_date || t.created_at))
    .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.start_date || t.created_at).getTime()) / 36e5);
  const avg_completion_hours = completionDurations.length
    ? Math.round((completionDurations.reduce((a, b) => a + b, 0) / completionDurations.length) * 10) / 10
    : 0;

  const total_minutes = d.sessions.reduce((a, b) => a + (b.duration_minutes ?? 0), 0);

  const status_dist: Record<string, number> = { done, in_progress, todo, paused };
  const priority_dist: Record<string, number> = {};
  for (const t of tasks) priority_dist[t.priority] = (priority_dist[t.priority] ?? 0) + 1;

  const projectMap: Record<string, number> = {};
  for (const t of tasks) if (t.project_id) projectMap[t.project_id] = (projectMap[t.project_id] ?? 0) + 1;
  const projects_touched = Object.entries(projectMap).map(([pid, count]) => {
    const p = d.projects[pid];
    return { id: pid, name_en: p?.name_en ?? pid, name_ar: p?.name_ar ?? pid, tasks: count };
  }).sort((a, b) => b.tasks - a.tasks);

  const top_tasks = tasks.slice(0, 25).map((t) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, project_id: t.project_id, due_date: t.due_date,
  }));

  const dayMap: Record<string, number> = {};
  for (const a of d.activity) {
    const day = a.created_at.slice(0, 10);
    dayMap[day] = (dayMap[day] ?? 0) + 1;
  }
  const activity_by_day = Object.entries(dayMap).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, count]) => ({ date, count }));

  return {
    version: 1,
    member: { id: d.member.id, full_name: d.member.full_name, avatar_url: d.member.avatar_url, job_title: d.member.job_title },
    range: { from: d.range.from?.toISOString() ?? null, to: d.range.to?.toISOString() ?? null, label: d.range.label },
    totals: {
      tasks: tasks.length, done, in_progress, todo, paused, overdue, on_time,
      completion_pct, on_time_pct, avg_completion_hours,
      total_minutes, sessions: d.sessions.length,
      comments: d.comments.length, files: d.files.length, activity: d.activity.length,
      points: d.rank.points, rank_position: d.rank.position, rank_total: d.rank.total,
    },
    status_dist, priority_dist, projects_touched, top_tasks, activity_by_day,
  };
}
