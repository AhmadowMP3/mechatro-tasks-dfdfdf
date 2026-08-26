import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Edit3, FileText, Mail, Phone, Calendar, Award, Flame, TrendingUp, Clock, CheckCircle2, AlertCircle, Play, Pause, ListTodo, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Profile } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/Pills";
import { PageHeader } from "@/components/layout/PageHeader";
import { GenerateReportDialog } from "@/components/team/GenerateReportDialog";
import { toLocalDigits, formatMinutes, formatDate } from "@/lib/format";
import type { DictKey } from "@/i18n/dict";
import { requireAdmin } from "@/lib/route-guards";
import { fetchLeaderboard } from "@/lib/leaderboard";


export const Route = createFileRoute("/_authenticated/team/$id")({
  ssr: false,
  beforeLoad: requireAdmin,
  component: MemberProfilePage,
});

function MemberProfilePage() {
  const { id } = Route.useParams();
  const { t, lang, isAdmin } = useApp();
  const navigate = useNavigate();
  const isRTL = lang === "ar";
  const [reportOpen, setReportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["member-profile", id],
    queryFn: async () => {
      const [profileRes, tasksRes, sessionsRes, badgesRes, scoresRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("tasks")
          .select("id,title,status,priority,due_date,completed_at,points,points_awarded_amount,points_awarded_at,project_id,projects(name_ar,name_en)")
          .eq("assignee_id", id)
          .order("updated_at", { ascending: false }),
        supabase.from("work_sessions").select("duration_minutes,started_at").eq("user_id", id),
        supabase.from("user_badges").select("code,awarded_at,meta").eq("user_id", id).order("awarded_at", { ascending: false }),
        fetchLeaderboard().then((rows) => ({ data: rows })),

      ]);
      return {
        profile: profileRes.data as Profile | null,
        tasks: tasksRes.data ?? [],
        sessions: sessionsRes.data ?? [],
        badges: badgesRes.data ?? [],
        ranking: scoresRes.data ?? [],
      };
    },
  });

  const stats = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const done = tasks.filter((x) => x.status === "done");
    const inReview = tasks.filter((x) => x.status === "in_review").length;
    const inProgress = tasks.filter((x) => x.status === "in_progress").length;
    const todo = tasks.filter((x) => x.status === "todo").length;
    const paused = tasks.filter((x) => x.status === "paused").length;
    const total = tasks.length;
    const completion = total ? Math.round((done.length / total) * 100) : 0;
    const onTimeDone = done.filter((tk) => tk.due_date && tk.completed_at && new Date(tk.completed_at) <= new Date(tk.due_date)).length;
    const onTimePct = done.length ? Math.round((onTimeDone / done.length) * 100) : 0;
    const minutes = (data?.sessions ?? []).reduce((a, b) => a + (b.duration_minutes ?? 0), 0);
    const sessionCount = (data?.sessions ?? []).length;
    return { total, done: done.length, inReview, inProgress, todo, paused, completion, onTimePct, minutes, sessionCount };
  }, [data]);

  const p = data?.profile;

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>…</div>;
  }
  if (!p) {
    return (
      <div>
        <PageHeader title={t("memberNotFound")} />
        <Link to="/team" className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", textDecoration: "none" }}>
          {t("backToTeam")}
        </Link>
      </div>
    );
  }

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const suspended = p.status === "suspended";
  const pending = p.status === "pending";

  return (
    <div>
      <PageHeader
        title={p.full_name}
        subtitle={p.job_title || t("memberProfile")}
        actions={
          <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate({ to: "/team" })}
              className="brand-btn"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
            >
              <BackIcon size={16} /> {t("backToTeam")}
            </button>
            {isAdmin && (
              <button
                onClick={() => setReportOpen(true)}
                className="brand-btn"
                style={{ background: "linear-gradient(135deg,#FF8A3D,#F0676A)", color: "#fff" }}
              >
                <FileText size={16} /> PDF
              </button>
            )}
          </div>
        }
      />

      {/* Identity card */}
      <div className="brand-card" style={{ padding: 22, marginBottom: 16, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <Avatar id={p.id} name={p.full_name} size={92} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{p.full_name}</div>
          <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 14 }}>{p.job_title || "—"}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <RoleBadge role={p.role} />
            {p.is_master_admin && <Pill label={t("masterAdmin")} bg="linear-gradient(135deg,#E7B03A,#F5D06B)" fg="#0A1626" />}
            {p.active
              ? <Pill label={t("activeMember")} bg="rgba(63,120,42,.18)" fg="#67BD42" />
              : <Pill label={t("inactiveMember")} bg="var(--surface-2)" fg="var(--muted)" />}
            {pending && <Pill label={t("status") + ": pending"} bg="rgba(232,115,46,.15)" fg="#FF9C5A" />}
            {suspended && <Pill label={t("suspendedInfo")} bg="rgba(240,103,106,.15)" fg="#F0676A" />}
          </div>
        </div>
      </div>

      {/* Performance stats */}
      <SectionTitle icon={<TrendingUp size={16} />}>{t("performance")}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
        <Stat icon={<Award size={16} color="#F5D06B" />} label={t("totalPoints")} value={toLocalDigits((p as { total_points?: number }).total_points ?? 0, lang)} />
        <Stat icon={<Flame size={16} color="#F0676A" />} label={t("currentStreak")} value={`${toLocalDigits((p as { current_streak?: number }).current_streak ?? 0, lang)} ${t("streakDays")}`} />
        <Stat icon={<Flame size={16} color="#E7B03A" />} label={t("longestStreak")} value={`${toLocalDigits((p as { longest_streak?: number }).longest_streak ?? 0, lang)} ${t("streakDays")}`} />
        <Stat icon={<CheckCircle2 size={16} color="#67BD42" />} label={t("doneTasks")} value={toLocalDigits(stats.done, lang)} />
        <Stat icon={<AlertCircle size={16} color="#FF9C5A" />} label={t("in_review")} value={toLocalDigits(stats.inReview, lang)} />
        <Stat icon={<Play size={16} color="#39C0EC" />} label={t("in_progress")} value={toLocalDigits(stats.inProgress, lang)} />
        <Stat icon={<ListTodo size={16} color="var(--muted)" />} label={t("todo")} value={toLocalDigits(stats.todo, lang)} />
        <Stat icon={<Pause size={16} color="var(--muted)" />} label={t("paused")} value={toLocalDigits(stats.paused, lang)} />
        <Stat icon={<TrendingUp size={16} color="#39C0EC" />} label={t("completionRate")} value={`${toLocalDigits(stats.completion, lang)}%`} />
        <Stat icon={<TrendingUp size={16} color="#67BD42" />} label={t("onTimePct")} value={`${toLocalDigits(stats.onTimePct, lang)}%`} />
        <Stat icon={<Clock size={16} color="#39C0EC" />} label={t("hoursLogged")} value={formatMinutes(stats.minutes, lang)} />
        <Stat icon={<Clock size={16} color="var(--muted)" />} label={lang === "ar" ? "عدد الجلسات" : "Sessions"} value={toLocalDigits(stats.sessionCount, lang)} />
      </div>

      {/* Contact + meta */}
      <SectionTitle icon={<Mail size={16} />}>{t("contactInfo")}</SectionTitle>
      <div className="brand-card" style={{ padding: 14, marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12 }}>
        <InfoRow icon={<Mail size={14} />} label={t("email")} value={p.email || "—"} ltr />
        <InfoRow icon={<Phone size={14} />} label={t("phone")} value={p.phone || "—"} ltr />
        <InfoRow icon={<Calendar size={14} />} label={t("joinedAt")} value={formatDate((p as { created_at?: string }).created_at, lang) || "—"} />
        <InfoRow icon={<Calendar size={14} />} label={t("invitedAt")} value={formatDate((p as { invited_at?: string }).invited_at, lang) || "—"} />
        <InfoRow icon={<Calendar size={14} />} label={t("lastTaskDone")} value={formatDate((p as { last_task_done_on?: string }).last_task_done_on, lang) || "—"} />
      </div>

      {/* Suspension */}
      {suspended && (
        <>
          <SectionTitle icon={<Ban size={16} color="#F0676A" />}>{t("suspendedInfo")}</SectionTitle>
          <div className="brand-card" style={{ padding: 14, marginBottom: 18, borderColor: "rgba(240,103,106,.4)" }}>
            <InfoRow icon={<Calendar size={14} />} label={t("suspendedAt")} value={formatDate(p.suspended_at, lang) || "—"} />
            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
              <strong style={{ color: "var(--foreground)" }}>{t("suspendReason")}:</strong> {p.suspend_reason || "—"}
            </div>
          </div>
        </>
      )}

      {/* Badges */}
      <SectionTitle icon={<Award size={16} />}>{t("badges")}</SectionTitle>
      <div className="brand-card" style={{ padding: 14, marginBottom: 18 }}>
        {(data?.badges ?? []).length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 10 }}>{t("noBadges")}</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(data?.badges ?? []).map((b) => (
              <div key={b.code + b.awarded_at} style={{
                padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)",
                border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 18 }}>{badgeIcon(b.code)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{badgeLabel(b.code, lang)}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(b.awarded_at, lang)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overall rank */}
      <SectionTitle icon={<TrendingUp size={16} />}>{t("leaderboard")}</SectionTitle>
      <div className="brand-card" style={{ padding: 14, marginBottom: 18 }}>
        {(() => {
          const list = (data?.ranking ?? []).filter((p) => p.active !== false && p.status !== "suspended");
          const pos = list.findIndex((p) => p.id === id);
          const pts = (list.find((p) => p.id === id)?.total_points as number | null) ?? 0;
          return (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, gap: 10, flexWrap: "wrap",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t("overallRank")}</div>
              <div style={{ display: "flex", gap: 12, fontSize: 13, color: "var(--muted)" }}>
                <span>#{toLocalDigits(pos >= 0 ? pos + 1 : list.length, lang)}</span>
                <span>{toLocalDigits(pts, lang)} {t("points")}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Recent tasks */}
      <SectionTitle icon={<ListTodo size={16} />}>{t("recentTasks")}</SectionTitle>
      <div className="brand-card" style={{ padding: 6, marginBottom: 18 }}>
        {(data?.tasks ?? []).length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 14 }}>—</div>
        ) : (
          <div style={{ maxHeight: 460, overflow: "auto" }}>
            {(data?.tasks ?? []).slice(0, 30).map((tk) => {
              const proj = tk.projects as { name_ar?: string; name_en?: string } | null;
              const projName = lang === "ar" ? proj?.name_ar : proj?.name_en;
              return (
                <div key={tk.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {projName ?? "—"} · {t(tk.status as DictKey)}
                      {tk.completed_at && ` · ${formatDate(tk.completed_at, lang)}`}
                    </div>
                  </div>
                  {tk.points_awarded_amount ? (
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#F5D06B" }}>
                      +{toLocalDigits(tk.points_awarded_amount, lang)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <Link
            to="/team"
            className="brand-btn"
            style={{ background: "var(--grad-blue)", color: "#fff", textDecoration: "none" }}
          >
            <Edit3 size={16} /> {t("editMember")}
          </Link>
        </div>
      )}

      {reportOpen && (
        <GenerateReportDialog member={p} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 2px 8px", color: "var(--muted)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
      {icon} {children}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="brand-card" style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 11, marginBottom: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function InfoRow({ icon, label, value, ltr }: { icon: React.ReactNode; label: string; value: string; ltr?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ color: "var(--muted)", marginTop: 2 }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div dir={ltr ? "ltr" : undefined} style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
      </div>
    </div>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 800 }}>
      {label}
    </span>
  );
}

const BADGE_MAP: Record<string, { ar: string; en: string; icon: string }> = {
  first_blood: { ar: "أول مهمة", en: "First Blood", icon: "🎖" },
  century: { ar: "100 نقطة", en: "Century (100 pts)", icon: "🎖" },
  half_k: { ar: "500 نقطة", en: "Half-K (500 pts)", icon: "🎖" },
  kilo: { ar: "1000 نقطة", en: "Kilo (1000 pts)", icon: "🎖" },
  on_fire: { ar: "مشتعل", en: "On Fire", icon: "🔥" },
  speed_demon: { ar: "سرعة البرق", en: "Speed Demon", icon: "⚡" },
  team_player: { ar: "لاعب فريق", en: "Team Player", icon: "🤝" },
  perfectionist: { ar: "متقن", en: "Perfectionist", icon: "💎" },
  champion: { ar: "بطل الموسم", en: "Champion", icon: "🏆" },
  runner_up: { ar: "الوصيف", en: "Runner-up", icon: "🥈" },
};
function badgeLabel(code: string, lang: "ar" | "en") {
  const b = BADGE_MAP[code];
  if (!b) return code;
  return lang === "ar" ? b.ar : b.en;
}
function badgeIcon(code: string) {
  return BADGE_MAP[code]?.icon ?? "🏅";
}
