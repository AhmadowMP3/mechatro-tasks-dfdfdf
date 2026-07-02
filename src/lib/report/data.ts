import { supabase } from "@/integrations/supabase/client";

export type ReportRange =
  | { kind: "all" }
  | { kind: "7d" | "30d" | "90d" }
  | { kind: "custom"; from: string; to: string };

export function rangeToDates(r: ReportRange): { from: Date | null; to: Date | null; label: string } {
  const now = new Date();
  if (r.kind === "all") return { from: null, to: null, label: "all" };
  if (r.kind === "custom") return { from: new Date(r.from), to: new Date(r.to + "T23:59:59"), label: `${r.from} → ${r.to}` };
  const days = r.kind === "7d" ? 7 : r.kind === "30d" ? 30 : 90;
  const from = new Date(now.getTime() - days * 864e5);
  return { from, to: null, label: r.kind };
}

export type ReportData = {
  member: {
    id: string; full_name: string; email: string | null; role: string;
    job_title: string | null; phone: string | null; avatar_url: string | null;
    is_master_admin: boolean; status: string | null; active: boolean;
    created_at: string; language_pref: string;
  };
  range: { from: Date | null; to: Date | null; label: string };
  tasks: Array<{
    id: string; title: string; status: string; priority: string;
    project_id: string | null; start_date: string | null;
    due_date: string | null; completed_at: string | null; created_at: string;
    progress: number | null;
  }>;
  projects: Record<string, { id: string; name_ar: string; name_en: string; color: string }>;
  sessions: Array<{ id: string; task_id: string | null; started_at: string; ended_at: string | null; duration_minutes: number | null }>;
  comments: Array<{ id: string; task_id: string; body: string; created_at: string }>;
  files: Array<{ id: string; task_id: string; file_name: string; drive_url: string; file_type: string | null; created_at: string }>;
  activity: Array<{ id: string; action: string; entity_type: string; entity_id: string | null; meta: Record<string, unknown> | null; created_at: string }>;
  rank: { position: number; total: number; points: number };
  generated_by: { full_name: string; email: string | null };
};

export async function loadMemberReportData(memberId: string, r: ReportRange): Promise<ReportData> {
  const range = rangeToDates(r);
  const fromISO = range.from?.toISOString();
  const toISO = range.to?.toISOString();

  const { data: member } = await supabase.from("profiles").select("*").eq("id", memberId).maybeSingle();
  if (!member) throw new Error("Member not found");

  const withinDate = <T extends { created_at?: string | null; started_at?: string | null }>(rows: T[], field: "created_at" | "started_at") => {
    if (!range.from) return rows;
    return rows.filter((r) => {
      const v = r[field]; if (!v) return true;
      const d = new Date(v);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    });
  };

  // Tasks assigned to member (all, then filter)
  const tasksQ = supabase.from("tasks").select("id,title,status,priority,project_id,start_date,due_date,completed_at,created_at,progress").eq("assignee_id", memberId).order("created_at", { ascending: false });
  const sessionsQ = supabase.from("work_sessions").select("id,task_id,started_at,ended_at,duration_minutes").eq("user_id", memberId).order("started_at", { ascending: false });
  const commentsQ = supabase.from("task_comments").select("id,task_id,body,created_at").eq("author_id", memberId).order("created_at", { ascending: false });
  const filesQ = supabase.from("task_files").select("id,task_id,file_name,drive_url,file_type,created_at").eq("added_by", memberId).order("created_at", { ascending: false });
  const activityQ = supabase.from("activity_log").select("id,action,entity_type,entity_id,meta,created_at").eq("actor_id", memberId).order("created_at", { ascending: false }).limit(300);
  const projectsQ = supabase.from("projects").select("id,name_ar,name_en,color");
  const allSessionsQ = supabase.from("work_sessions").select("user_id,duration_minutes");
  const allProfilesQ = supabase.from("profiles").select("id,full_name");

  const [tasksR, sessionsR, commentsR, filesR, activityR, projectsR, allSessionsR, allProfilesR, userR] = await Promise.all([
    tasksQ, sessionsQ, commentsQ, filesQ, activityQ, projectsQ, allSessionsQ, allProfilesQ, supabase.auth.getUser(),
  ]);

  let tasks = tasksR.data ?? [];
  let sessions = sessionsR.data ?? [];
  let comments = commentsR.data ?? [];
  let files = filesR.data ?? [];
  let activity = activityR.data ?? [];

  if (range.from) {
    tasks = withinDate(tasks, "created_at");
    sessions = withinDate(sessions, "started_at");
    comments = withinDate(comments, "created_at");
    files = withinDate(files, "created_at");
    activity = withinDate(activity, "created_at");
  }

  if (fromISO && toISO) {
    // silence unused warnings
    void fromISO; void toISO;
  }

  const projects: ReportData["projects"] = {};
  for (const p of projectsR.data ?? []) projects[p.id] = p;

  // League rank: compute points = tasks_done*10 + on_time*5 - overdue*3 per user across ALL time from all sessions & tasks
  // Simpler: rank by hours logged (sum durations)
  const totals: Record<string, number> = {};
  for (const s of allSessionsR.data ?? []) {
    totals[s.user_id] = (totals[s.user_id] ?? 0) + (s.duration_minutes ?? 0);
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const position = sorted.findIndex(([uid]) => uid === memberId);
  const points = Math.round((totals[memberId] ?? 0) / 6); // 1 point per 6 minutes

  const uName = userR.data.user?.user_metadata?.full_name || userR.data.user?.email || "—";
  return {
    member: {
      id: member.id, full_name: member.full_name, email: member.email, role: member.role,
      job_title: member.job_title, phone: member.phone, avatar_url: member.avatar_url,
      is_master_admin: !!member.is_master_admin, status: member.status ?? null, active: !!member.active,
      created_at: member.created_at, language_pref: member.language_pref ?? "ar",
    },
    range, tasks, projects, sessions, comments, files,
    activity: (activity as unknown as ReportData["activity"]),
    rank: { position: position >= 0 ? position + 1 : (allProfilesR.data?.length ?? 0), total: allProfilesR.data?.length ?? 0, points },
    generated_by: { full_name: uName, email: userR.data.user?.email ?? null },
  };
}
