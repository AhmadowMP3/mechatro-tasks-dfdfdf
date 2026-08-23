// Team-wide PDF report — one Dashboard Card per member, plus team KPI cover.
// Single locked style, colorful Mechatro logo, bilingual side-by-side cards.

import { supabase } from "@/integrations/supabase/client";
import { dict, type Lang } from "@/i18n/dict";
import logo from "@/assets/mechatro-logo.png";
import { P, CARD_STYLE, esc, fmtDate, card, cardHeader, block, kpiTile, miniKpi } from "./pdf-chrome";

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
  tasks_in_progress: number;
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
    on_time_pct: number;
    points: number;
    hours: number;
    projects: number;
    active_members: number;
  };
  projectRows: Array<{ id: string; name_ar: string; name_en: string; color: string; total: number; done: number }>;
};

const t = (k: keyof typeof dict, lang: Lang) => dict[k]?.[lang] ?? String(k);

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
  const taskIds = tasks.map((tk) => tk.id);
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
  let teamOnTimeNum = 0, teamOnTimeDen = 0;

  const members: TeamMemberSlice[] = profiles.map((p) => {
    const mine = tasks.filter((tk) => memberOnTask(tk.id, tk.assignee_id, p.id));
    const done = mine.filter((tk) => tk.status === "done");
    const inProgress = mine.filter((tk) => tk.status === "in_progress").length;
    const overdue = mine.filter((tk) => tk.status !== "done" && tk.due_date && new Date(tk.due_date) < now).length;
    const onTime = done.filter((tk) => tk.due_date && tk.completed_at && new Date(tk.completed_at) <= new Date(tk.due_date + "T23:59:59")).length;
    teamOnTimeNum += onTime;
    teamOnTimeDen += done.length;
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
      tasks_in_progress: inProgress,
      tasks_overdue: overdue,
      on_time_pct: done.length ? Math.round((onTime / done.length) * 100) : 0,
      hours_logged: Math.round(hoursMin / 60),
    };
  }).sort((a, b) => b.total_points - a.total_points);

  const projectRows = projects.map((p) => {
    const list = tasks.filter((tk) => tk.project_id === p.id);
    return {
      id: p.id, name_ar: p.name_ar, name_en: p.name_en, color: p.color ?? P.cyan,
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
      on_time_pct: teamOnTimeDen ? Math.round((teamOnTimeNum / teamOnTimeDen) * 100) : 0,
      points: profiles.reduce((a, p) => a + (p.total_points ?? 0), 0),
      hours: Math.round(sessions.reduce((a, s) => a + (s.duration_minutes ?? 0), 0) / 60),
      projects: projects.length,
      active_members: profiles.length,
    },
    projectRows,
  };
}

// ---------- Cover ----------
function coverPage(data: TeamReportData): string {
  const rangeText = data.range.from
    ? `${fmtDate(data.range.from, "en")} — ${fmtDate(data.range.to ?? new Date(), "en")}`
    : "All time";

  const kpis: [string, string, string, string][] = [
    [String(data.totals.tasks), "TOTAL TASKS", "إجمالي المهام", P.cyan],
    [
      (data.totals.tasks ? Math.round((data.totals.done / data.totals.tasks) * 100) : 0) + "%",
      "COMPLETION", "الإنجاز", P.green,
    ],
    [data.totals.on_time_pct + "%", "ON-TIME", "في الموعد", P.gold],
    [String(data.totals.hours), "HOURS LOGGED", "الساعات", P.purple],
  ];

  const secondaryStats: [string, string, string][] = [
    [String(data.totals.active_members), "Members", "أعضاء"],
    [String(data.totals.projects), "Projects", "مشاريع"],
    [String(data.totals.in_progress), "In progress", "قيد التنفيذ"],
    [String(data.totals.overdue), "Overdue", "متأخرة"],
    [String(data.totals.points), "Total points", "النقاط"],
  ];

  return `
  <section class="pdf-page cover" style="background:${P.page};color:${P.ink};position:relative;overflow:hidden;padding:56px 48px 44px 48px;box-sizing:border-box">
    <!-- Brand strip -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:36px">
      <img src="${logo}" style="height:48px;object-fit:contain"/>
      <div style="text-align:right;font-size:10px;color:${P.muted};letter-spacing:1px;line-height:1.6">
        <div>${esc(fmtDate(new Date(), "en"))}</div>
        <div>${esc(rangeText)}</div>
      </div>
    </div>

    <!-- Gold accent bar -->
    <div style="width:56px;height:4px;background:${P.gold};border-radius:2px;margin-bottom:22px"></div>

    <!-- Title card -->
    <div style="${CARD_STYLE};padding:32px;margin-bottom:22px">
      <div style="font-size:11px;color:${P.muted};letter-spacing:3px;font-weight:700;margin-bottom:10px">MECHATRO · TEAM REPORT · تقرير الفريق</div>
      <div style="font-size:52px;font-weight:900;line-height:1.02;letter-spacing:-1.5px;color:${P.ink}">Team Performance</div>
      <div dir="rtl" style="font-size:22px;color:${P.muted};margin-top:10px;font-family:'Montserrat Arabic','Cairo',sans-serif">تقرير أداء الفريق</div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <span style="background:${P.gold};color:#111;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px">PERIOD · ${esc(rangeText).toUpperCase()}</span>
        <span style="border:1.5px solid ${P.line};color:${P.ink2};background:rgba(255,255,255,.04);padding:5px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px">${data.totals.active_members} MEMBERS</span>
      </div>
    </div>

    <!-- KPI grid -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px">
      ${kpis.map(([v, en, ar, c]) => kpiTile(v, en, ar, c)).join("")}
    </div>

    <!-- Secondary stats strip -->
    <div style="${CARD_STYLE};padding:18px 22px;margin-bottom:22px">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;align-items:center">
        ${secondaryStats.map(([v, en, ar]) => `
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:900;color:${P.ink};line-height:1">${esc(v)}</div>
            <div style="font-size:9.5px;color:${P.muted};margin-top:6px;letter-spacing:1px;font-weight:700;text-transform:uppercase">${esc(en)}</div>
            <div dir="rtl" style="font-size:10.5px;color:${P.ink2};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(ar)}</div>
          </div>`).join("")}
      </div>
    </div>

    <!-- Meta footer -->
    <div style="${CARD_STYLE};padding:16px 22px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${P.muted}">
      <div style="display:flex;align-items:center;gap:8px">
        <img src="${logo}" style="height:16px;object-fit:contain;opacity:.9"/>
        <span>mechatro @ dashboard.mechatro-sy.com</span>
      </div>
      <div>By ${esc(data.generated_by.full_name)}</div>
    </div>
  </section>`;
}

// ---------- Per-member card ----------
function memberCard(m: TeamMemberSlice, rankIndex: number): string {
  const initials = m.full_name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const avatar = m.avatar_url
    ? `<img src="${esc(m.avatar_url)}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.15)"/>`
    : `<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,${P.cyan},${P.cyanDark});display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff">${esc(initials)}</div>`;

  const completionPct = m.tasks_total ? Math.round((m.tasks_done / m.tasks_total) * 100) : 0;
  const rankBadge = rankIndex < 3
    ? `<span style="background:${P.gold};color:#111;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:1px">#${rankIndex + 1}</span>`
    : `<span style="background:${P.soft};color:${P.muted};padding:4px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:1px">#${rankIndex + 1}</span>`;

  const header = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
      ${avatar}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          ${rankBadge}
          <span style="font-size:10px;color:${P.muted};letter-spacing:1.5px;font-weight:800;text-transform:uppercase">${esc(m.role)}</span>
        </div>
        <div style="font-size:20px;font-weight:900;color:${P.ink};line-height:1.15;letter-spacing:-.3px">${esc(m.full_name)}</div>
        ${m.job_title ? `<div style="font-size:12px;color:${P.muted};margin-top:2px">${esc(m.job_title)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:900;color:${P.gold};line-height:1">${m.total_points}</div>
        <div style="font-size:9.5px;color:${P.muted};letter-spacing:1px;font-weight:800;margin-top:2px">POINTS · النقاط</div>
      </div>
    </div>`;

  const kpiGrid = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      ${miniKpi(String(m.tasks_total), "Tasks", "المهام", P.cyan)}
      ${miniKpi(completionPct + "%", "Done", "منجزة", P.green)}
      ${miniKpi(String(m.tasks_in_progress), "In progress", "قيد التنفيذ", P.orange)}
      ${miniKpi(String(m.tasks_overdue), "Overdue", "متأخرة", m.tasks_overdue ? P.red : P.muted)}
      ${miniKpi(String(m.hours_logged) + "h", "Hours", "ساعات", P.purple)}
    </div>`;

  // Progress bar for done ratio
  const progress = `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid ${P.line}">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:${P.muted};font-weight:700;margin-bottom:6px">
        <span>Completion · الإنجاز</span>
        <span>${m.tasks_done}/${m.tasks_total} · ${completionPct}%</span>
      </div>
      <div style="background:${P.soft};height:8px;border-radius:4px;overflow:hidden">
        <div style="width:${completionPct}%;height:100%;background:linear-gradient(90deg,${P.cyan},${P.green})"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:${P.muted};margin-top:10px">
        <span>🔥 Streak: <b style="color:${P.ink}">${m.current_streak}</b></span>
        <span>On-time · ${m.on_time_pct}%</span>
      </div>
    </div>`;

  return card(header + kpiGrid + progress);
}

// ---------- Projects card ----------
function projectsCard(data: TeamReportData): string {
  const entries = data.projectRows.slice(0, 8);
  if (!entries.length) return "";
  const rows = entries.map((p) => {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    return `<div style="padding:11px 0;border-bottom:1px solid ${P.line}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
          <span style="width:12px;height:12px;border-radius:4px;background:${p.color};flex:0 0 auto"></span>
          <div style="min-width:0;flex:1">
            <div style="font-weight:800;color:${P.ink};font-size:13px">${esc(p.name_en)}</div>
            <div dir="rtl" style="font-size:11px;color:${P.muted};font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(p.name_ar)}</div>
          </div>
        </div>
        <div style="text-align:right;font-size:11px;color:${P.muted}">
          <div><b style="color:${P.ink};font-size:14px">${p.done}</b> / ${p.total}</div>
          <div style="margin-top:2px">${pct}%</div>
        </div>
      </div>
      <div style="background:${P.soft};height:6px;border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${p.color},${p.color}cc)"></div>
      </div>
    </div>`;
  }).join("");
  return card(cardHeader(P.orange, "▤", "Top projects", "أهم المشاريع") + `<div>${rows}</div>`);
}

/** Build the full team report HTML (single style, bilingual). */
export function buildTeamReportHtml(data: TeamReportData, _lang: Lang = "en"): string {
  void _lang;
  const cover = coverPage(data);
  const parts: string[] = [];
  // Section header card announcing member roster
  parts.push(card(cardHeader(P.cyan, "◐", "Members overview", "نظرة عامة على الأعضاء") +
    `<div style="font-size:12px;color:${P.muted};line-height:1.6">
      One dashboard card per active member with tasks, completion, hours, and streak.
      <br/><span dir="rtl" style="font-family:'Montserrat Arabic','Cairo',sans-serif">بطاقة أداء لكل عضو نشط تشمل المهام والإنجاز والساعات والاستمرارية.</span>
    </div>`));
  for (let i = 0; i < data.members.length; i++) {
    parts.push(memberCard(data.members[i], i));
  }
  const projects = projectsCard(data);
  if (projects) parts.push(projects);
  const blocks = parts.map(block).join("");
  return cover + blocks;
}
