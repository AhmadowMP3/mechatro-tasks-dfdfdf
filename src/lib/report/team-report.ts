// Team-wide PDF report — aggregates all members within a period.
// Uses the same theme system as per-member reports.

import { supabase } from "@/integrations/supabase/client";
import { dict, type Lang } from "@/i18n/dict";
import { getTheme, setTheme, type ThemeId } from "./themes";
import logo from "@/assets/mechatro-logo.png";

export type TeamReportRange = {
  from: Date | null;
  to: Date | null;
  label: string;
};

export type TeamMemberSlice = {
  id: string;
  full_name: string;
  role: string;
  job_title: string | null;
  avatar_url: string | null;
  total_points: number;
  current_streak: number;
  tasks_total: number;
  tasks_done: number;
  tasks_overdue: number;
  on_time_pct: number;
  hours_logged: number;
};

export type TeamReportData = {
  range: TeamReportRange;
  generated_by: { full_name: string };
  members: TeamMemberSlice[];
  totals: {
    tasks: number;
    done: number;
    in_progress: number;
    overdue: number;
    points: number;
    hours: number;
    projects: number;
    active_members: number;
  };
  projectRows: Array<{ id: string; name_ar: string; name_en: string; color: string; total: number; done: number }>;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const t = (k: keyof typeof dict, lang: Lang) => dict[k]?.[lang] ?? String(k);

const fmtDate = (d: Date | null, lang: Lang) =>
  d ? d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "numeric" }) : "—";

/** Load team-wide report data for admins. */
export async function loadTeamReportData(range: TeamReportRange, generatedByName: string): Promise<TeamReportData> {
  const fromISO = range.from?.toISOString();
  const toISO = range.to?.toISOString();

  const profilesQ = supabase.from("profiles").select("id,full_name,role,job_title,avatar_url,total_points,current_streak,active").eq("active", true);
  let tasksQ = supabase.from("tasks").select("id,status,priority,assignee_id,project_id,due_date,completed_at,created_at,points_awarded_amount");
  if (fromISO) tasksQ = tasksQ.gte("created_at", fromISO);
  if (toISO) tasksQ = tasksQ.lte("created_at", toISO);
  let sessionsQ = supabase.from("work_sessions").select("user_id,duration_minutes,started_at");
  if (fromISO) sessionsQ = sessionsQ.gte("started_at", fromISO);
  if (toISO) sessionsQ = sessionsQ.lte("started_at", toISO);
  const projectsQ = supabase.from("projects").select("id,name_ar,name_en,color");

  const [profR, tasksR, sessR, projR] = await Promise.all([profilesQ, tasksQ, sessionsQ, projectsQ]);
  const profiles = profR.data ?? [];
  const tasks = tasksR.data ?? [];
  const sessions = sessR.data ?? [];
  const projects = projR.data ?? [];

  // Load co-assignees for the tasks in scope.
  const taskIds = tasks.map((t) => t.id);
  const assigneesByTask: Record<string, string[]> = {};
  if (taskIds.length) {
    const chunkSize = 500;
    for (let i = 0; i < taskIds.length; i += chunkSize) {
      const slice = taskIds.slice(i, i + chunkSize);
      const { data: ta } = await supabase.from("task_assignees").select("task_id,user_id").in("task_id", slice);
      for (const row of ta ?? []) (assigneesByTask[row.task_id] ||= []).push(row.user_id);
    }
  }
  const memberOnTask = (taskId: string, primaryId: string | null, memberId: string) =>
    primaryId === memberId || (assigneesByTask[taskId] ?? []).includes(memberId);

  const now = new Date();

  const members: TeamMemberSlice[] = profiles.map((p) => {
    const mine = tasks.filter((tk) => memberOnTask(tk.id, tk.assignee_id, p.id));
    const done = mine.filter((tk) => tk.status === "done");
    const overdue = mine.filter((tk) => tk.status !== "done" && tk.due_date && new Date(tk.due_date) < now).length;
    const onTime = done.filter((tk) => tk.due_date && tk.completed_at && new Date(tk.completed_at) <= new Date(tk.due_date + "T23:59:59")).length;
    const hoursMin = sessions.filter((s) => s.user_id === p.id).reduce((a, s) => a + (s.duration_minutes ?? 0), 0);
    return {
      id: p.id,
      full_name: p.full_name ?? "",
      role: p.role ?? "member",
      job_title: p.job_title,
      avatar_url: p.avatar_url,
      total_points: p.total_points ?? 0,
      current_streak: p.current_streak ?? 0,
      tasks_total: mine.length,
      tasks_done: done.length,
      tasks_overdue: overdue,
      on_time_pct: done.length ? Math.round((onTime / done.length) * 100) : 0,
      hours_logged: Math.round(hoursMin / 60),
    };
  }).sort((a, b) => b.total_points - a.total_points);

  const projectRows = projects.map((p) => {
    const list = tasks.filter((tk) => tk.project_id === p.id);
    return {
      id: p.id, name_ar: p.name_ar, name_en: p.name_en, color: p.color ?? "#189FD1",
      total: list.length,
      done: list.filter((tk) => tk.status === "done").length,
    };
  }).sort((a, b) => b.total - a.total);

  return {
    range,
    generated_by: { full_name: generatedByName },
    members,
    totals: {
      tasks: tasks.length,
      done: tasks.filter((tk) => tk.status === "done").length,
      in_progress: tasks.filter((tk) => tk.status === "in_progress").length,
      overdue: tasks.filter((tk) => tk.status !== "done" && tk.due_date && new Date(tk.due_date) < now).length,
      points: profiles.reduce((a, p) => a + (p.total_points ?? 0), 0),
      hours: Math.round(sessions.reduce((a, s) => a + (s.duration_minutes ?? 0), 0) / 60),
      projects: projects.length,
      active_members: profiles.length,
    },
    projectRows,
  };
}

/** Build the HTML for a team-wide report using the currently selected theme. */
export function buildTeamReportHtml(data: TeamReportData, lang: Lang, theme?: ThemeId): string {
  if (theme) setTheme(theme);
  const th = getTheme();
  const isMinimal = th.id === "minimal";
  const softOverlay = th.id === "aurora" || th.id === "executive" ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.05)";
  const softBorder = th.id === "aurora" || th.id === "executive" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.08)";
  const softSubtle = th.coverSub;

  const cover = `
  <section class="pdf-page cover" style="background:${th.coverBg};color:${th.coverInk};position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:${th.coverGlow}"></div>
    <div style="position:relative;padding:${isMinimal ? "80px 72px 56px" : "56px"};height:100%;display:flex;flex-direction:column;gap:${isMinimal ? 32 : 20}px">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="${logo}" style="width:44px;height:44px;object-fit:contain"/>
        <div>
          <div style="font-size:18px;font-weight:800">${esc(t("appName", lang))}</div>
          <div style="font-size:11px;color:${softSubtle};letter-spacing:2px">${isMinimal ? "MECHATRO · TEAM REPORT" : "TEAM PERFORMANCE REPORT"}</div>
        </div>
      </div>
      ${isMinimal ? `<div style="width:64px;height:3px;background:${th.gold};margin-top:20px"></div>` : ""}
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px">
        <div style="font-size:${isMinimal ? 60 : 44}px;font-weight:900;line-height:1;letter-spacing:-1px">
          ${lang === "ar" ? "تقرير الفريق" : "Team Report"}
        </div>
        <div style="font-size:${isMinimal ? 20 : 16}px;color:${softSubtle}">
          ${lang === "ar" ? "Team Performance Report" : "تقرير أداء الفريق"}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px">
          ${teamBigStat(t("kpi_total_tasks", lang), String(data.totals.tasks), softOverlay, softBorder, softSubtle, th.coverInk)}
          ${teamBigStat(t("kpi_completed", lang), String(data.totals.done), softOverlay, softBorder, softSubtle, th.coverInk)}
          ${teamBigStat(lang === "ar" ? "النقاط" : "Points", String(data.totals.points), softOverlay, softBorder, softSubtle, th.coverInk)}
          ${teamBigStat(lang === "ar" ? "أعضاء" : "Members", String(data.totals.active_members), softOverlay, softBorder, softSubtle, th.coverInk)}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:${softSubtle};border-top:1px solid ${softBorder};padding-top:14px">
        <div>${esc(t("reportPeriod", lang))}: <b style="color:${th.coverInk}">${esc(fmtDate(data.range.from, lang))} — ${esc(fmtDate(data.range.to, lang))}</b></div>
        <div>${esc(t("reportedBy", lang))}: <b style="color:${th.coverInk}">${esc(data.generated_by.full_name)}</b></div>
      </div>
    </div>
  </section>`;

  const leaderboardRows = data.members.slice(0, 20).map((m, i) => `
    <tr>
      <td style="padding:10px 12px;font-weight:800;color:${i < 3 ? th.gold : th.muted};width:40px">${i + 1}</td>
      <td style="padding:10px 12px"><b>${esc(m.full_name)}</b><div style="font-size:10.5px;color:${th.muted}">${esc(m.job_title ?? m.role)}</div></td>
      <td style="padding:10px 12px;text-align:center;font-weight:800;color:${th.gold}">⭐ ${m.total_points}</td>
      <td style="padding:10px 12px;text-align:center">${m.tasks_done}/${m.tasks_total}</td>
      <td style="padding:10px 12px;text-align:center;color:${m.tasks_overdue ? th.red : th.ink}">${m.tasks_overdue}</td>
      <td style="padding:10px 12px;text-align:center">${m.on_time_pct}%</td>
      <td style="padding:10px 12px;text-align:center">${m.hours_logged}h</td>
      <td style="padding:10px 12px;text-align:center">🔥 ${m.current_streak}</td>
    </tr>`).join("");

  const projectRows = data.projectRows.slice(0, 20).map((p) => {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    return `<tr>
      <td style="padding:10px 12px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.color};margin-inline-end:8px"></span><b>${esc(lang === "ar" ? p.name_ar : p.name_en)}</b></td>
      <td style="padding:10px 12px;text-align:center">${p.total}</td>
      <td style="padding:10px 12px;text-align:center">${p.done}</td>
      <td style="padding:10px 12px">
        <div style="background:${th.line};height:8px;border-radius:4px"><div style="width:${pct}%;height:100%;background:${p.color};border-radius:4px"></div></div>
        <div style="font-size:10.5px;color:${th.muted};margin-top:3px">${pct}%</div>
      </td>
    </tr>`;
  }).join("");

  const page2 = `
  <section class="pdf-page" dir="${lang === "ar" ? "rtl" : "ltr"}" style="background:${th.paper};color:${th.ink};padding:40px 44px;position:relative">
    ${pageHeader(th, lang, data)}
    <div style="display:flex;flex-direction:column;gap:24px">
      <div>
        ${sectionHeader(th, lang === "ar" ? "لوحة الصدارة" : "Leaderboard", th.gold)}
        <table style="width:100%;border-collapse:collapse;background:${th.card};border:1px solid ${th.line};border-radius:12px;overflow:hidden;font-size:12px">
          <thead><tr style="background:${th.soft};color:${th.muted};font-size:10.5px;text-transform:uppercase;letter-spacing:.5px">
            <th style="padding:10px 12px;text-align:${lang === "ar" ? "right" : "left"}">#</th>
            <th style="padding:10px 12px;text-align:${lang === "ar" ? "right" : "left"}">${esc(lang === "ar" ? "العضو" : "Member")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "النقاط" : "Points")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "منجزة/الكل" : "Done/Total")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "متأخرة" : "Overdue")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "في الموعد" : "On Time")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "ساعات" : "Hours")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "متتالية" : "Streak")}</th>
          </tr></thead>
          <tbody>${leaderboardRows}</tbody>
        </table>
      </div>
    </div>
    ${pageFooter(th, lang, 2)}
  </section>`;

  const page3 = `
  <section class="pdf-page" dir="${lang === "ar" ? "rtl" : "ltr"}" style="background:${th.paper};color:${th.ink};padding:40px 44px;position:relative">
    ${pageHeader(th, lang, data)}
    <div style="display:flex;flex-direction:column;gap:24px">
      <div>
        ${sectionHeader(th, lang === "ar" ? "المشاريع" : "Projects", th.blue)}
        <table style="width:100%;border-collapse:collapse;background:${th.card};border:1px solid ${th.line};border-radius:12px;overflow:hidden;font-size:12.5px">
          <thead><tr style="background:${th.soft};color:${th.muted};font-size:10.5px;text-transform:uppercase;letter-spacing:.5px">
            <th style="padding:10px 12px;text-align:${lang === "ar" ? "right" : "left"}">${esc(lang === "ar" ? "المشروع" : "Project")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "المجموع" : "Total")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "منجزة" : "Done")}</th>
            <th style="padding:10px 12px">${esc(lang === "ar" ? "الإكمال" : "Completion")}</th>
          </tr></thead>
          <tbody>${projectRows}</tbody>
        </table>
      </div>
    </div>
    ${pageFooter(th, lang, 3)}
  </section>`;

  return cover + page2 + page3;
}

function teamBigStat(label: string, value: string, bg: string, border: string, sub: string, ink: string): string {
  return `<div style="background:${bg};border:1px solid ${border};border-radius:14px;padding:14px 16px">
    <div style="font-size:32px;font-weight:900;line-height:1;color:${ink}">${esc(value)}</div>
    <div style="font-size:11px;color:${sub};margin-top:4px;text-transform:uppercase;letter-spacing:1px">${esc(label)}</div>
  </div>`;
}

function sectionHeader(th: ReturnType<typeof getTheme>, title: string, accent: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin:0 0 14px 0">
    <div style="width:8px;height:22px;background:${accent};border-radius:2px"></div>
    <div style="font-size:20px;font-weight:800;color:${th.ink}">${esc(title)}</div>
  </div>`;
}

function pageHeader(th: ReturnType<typeof getTheme>, lang: Lang, data: TeamReportData): string {
  return `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${th.line};padding-bottom:12px;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${logo}" style="width:24px;height:24px;object-fit:contain"/>
      <div style="font-size:12px;font-weight:800;color:${th.ink}">${esc(t("appName", lang))} · ${esc(lang === "ar" ? "تقرير الفريق" : "Team Report")}</div>
    </div>
    <div style="font-size:11px;color:${th.muted}">${esc(fmtDate(data.range.from, lang))} — ${esc(fmtDate(data.range.to, lang))}</div>
  </div>`;
}

function pageFooter(th: ReturnType<typeof getTheme>, lang: Lang, pageNum: number): string {
  return `<div style="position:absolute;bottom:18px;left:44px;right:44px;display:flex;justify-content:space-between;font-size:10.5px;color:${th.muted};border-top:1px solid ${th.line};padding-top:8px">
    <div>Mechatro © ${new Date().getFullYear()}</div>
    <div>${esc(t("page", lang))} ${pageNum}</div>
  </div>`;
}
