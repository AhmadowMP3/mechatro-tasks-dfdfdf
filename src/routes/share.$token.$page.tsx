import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Trophy, Library, ScrollText, ShieldAlert, Loader2, Eye, Menu, X, Moon, Sun, RefreshCw, Activity, Clock, TrendingUp, Zap, Flame, Crown, Medal, Award, ExternalLink } from "lucide-react";
import logo from "@/assets/mechatro-logo.png";
import { shareApi, SHARE_PAGES } from "@/lib/share-links";

type ResolvedLink = { label: string; allowed_pages: string[]; expires_at: string | null };

export const Route = createFileRoute("/share/$token/$page")({
  component: ShareView,
});

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard, projects: FolderKanban, tasks: CheckSquare,
  team: Users, league: Trophy, references: Library, activity: ScrollText,
};

const STATUS_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  todo:        { bg: "rgba(134,161,183,.15)",  text: "#86A1B7", ring: "rgba(134,161,183,.4)" },
  in_progress: { bg: "rgba(66,194,238,.15)",   text: "#42C2EE", ring: "rgba(66,194,238,.45)" },
  paused:      { bg: "rgba(255,146,85,.15)",   text: "#FF9255", ring: "rgba(255,146,85,.45)" },
  in_review:   { bg: "rgba(168,85,247,.15)",   text: "#A855F7", ring: "rgba(168,85,247,.45)" },
  done:        { bg: "rgba(80,200,120,.15)",   text: "#50C878", ring: "rgba(80,200,120,.45)" },
};
const PRIORITY_COLOR: Record<string, string> = { urgent: "#F0676A", high: "#FF9255", normal: "#42C2EE", low: "#86A1B7" };

const PROJECT_COLORS: Record<string, string> = {
  blue: "linear-gradient(135deg,#42C2EE,#2B6FB2)",
  purple: "linear-gradient(135deg,#7B61FF,#4B37B8)",
  green: "linear-gradient(135deg,#50C878,#2C8F52)",
  orange: "linear-gradient(135deg,#FF9255,#C45E1E)",
  red: "linear-gradient(135deg,#F0676A,#B33A3D)",
  gold: "linear-gradient(135deg,#F4CF6B,#D4AF37)",
};

function statusLabel(k: string, ar: boolean) {
  const ar_map: Record<string, string> = { todo: "لم تبدأ", in_progress: "قيد التنفيذ", paused: "متوقفة", in_review: "قيد المراجعة", done: "مكتملة" };
  const en_map: Record<string, string> = { todo: "To do", in_progress: "In progress", paused: "Paused", in_review: "In review", done: "Done" };
  return (ar ? ar_map[k] : en_map[k]) ?? k;
}

function initials(name: string) { return (name || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase(); }

function AvatarChip({ name, url, size = 30 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: url ? `url(${url}) center/cover` : "var(--grad-blue)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.4), flexShrink: 0,
      border: "2px solid var(--card)",
    }}>{!url && initials(name)}</div>
  );
}

function relativeTime(iso: string, ar: boolean) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return ar ? "الآن" : "just now";
  if (abs < 3600) return `${Math.round(abs / 60)}${ar ? " د" : "m"}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}${ar ? " س" : "h"}`;
  return `${Math.round(abs / 86400)}${ar ? " ي" : "d"}`;
}

function ShareView() {
  const { token, page } = Route.useParams();
  const navigate = useNavigate();
  const [link, setLink] = useState<ResolvedLink | null>(null);
  const [checking, setChecking] = useState(true);
  const [lang, setLang] = useState<"ar" | "en">((typeof window !== "undefined" && (localStorage.getItem("lang") as "ar" | "en")) || "ar");
  const [theme, setTheme] = useState<"dark" | "light">((typeof window !== "undefined" && (localStorage.getItem("theme") as "dark" | "light")) || "dark");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const ar = lang === "ar";

  useEffect(() => {
    const cached = sessionStorage.getItem(`share:${token}`);
    if (cached) { try { setLink(JSON.parse(cached)); setChecking(false); return; } catch { /* */ } }
    shareApi.resolve(token).then(({ link }) => {
      sessionStorage.setItem(`share:${token}`, JSON.stringify(link));
      setLink(link); setChecking(false);
    }).catch(() => { navigate({ to: "/share/$token", params: { token }, replace: true }); });
  }, [token, navigate]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = ar ? "rtl" : "ltr";
      document.documentElement.lang = ar ? "ar" : "en";
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(theme);
    }
  }, [ar, theme]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    handler(); window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const allowed = link?.allowed_pages ?? [];
  const notAllowed = !!link && !allowed.includes(page);

  if (checking) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)", color: "var(--foreground)" }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (!link) return null;

  const shell = (
    <aside style={{
      width: 260, background: "linear-gradient(180deg,#050D17,#0A1A2B)", color: "#EAF2F9",
      display: "flex", flexDirection: "column", borderInlineEnd: "1px solid #1E364D",
      height: "100dvh", position: isMobile ? "relative" : "sticky", top: 0, flexShrink: 0,
    }}>
      <div style={{ padding: "22px 18px 12px", textAlign: "center", position: "relative" }}>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} aria-label="close" style={{
            position: "absolute", insetInlineEnd: 8, top: 8, width: 40, height: 40,
            background: "transparent", color: "#EAF2F9", border: "none", cursor: "pointer",
          }}><X size={20} /></button>
        )}
        <img src={logo} alt="Mechatro" style={{ width: 160, maxWidth: "100%" }} />
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#D4AF37", letterSpacing: 1 }}>
          {ar ? "عرض للقراءة فقط" : "READ-ONLY PREVIEW"}
        </div>
        {link.label && <div style={{ marginTop: 4, fontSize: 12, color: "#9FB7C9" }}>{link.label}</div>}
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {allowed.map((key) => {
          const meta = SHARE_PAGES.find((p) => p.key === key);
          const Icon = ICONS[key] ?? Eye;
          const active = key === page;
          return (
            <Link key={key} to="/share/$token/$page" params={{ token, page: key }}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                marginBottom: 4, borderRadius: 12, minHeight: 48,
                background: active ? "var(--grad-blue)" : "transparent",
                color: active ? "#fff" : "#B9CBDA", fontWeight: 700, fontSize: 14.5,
                textDecoration: "none",
                flexDirection: ar ? "row-reverse" : "row",
              }}>
              <span style={{ flex: 1, textAlign: ar ? "right" : "left" }}>{meta ? (ar ? meta.ar : meta.en) : key}</span>
              <Icon size={20} />
            </Link>
          );
        })}
      </nav>

      {link.expires_at && (
        <div style={{ padding: 12, borderTop: "1px solid #1E364D", fontSize: 11, color: "#9FB7C9", textAlign: "center" }}>
          {ar ? "ينتهي" : "Expires"}: {new Date(link.expires_at).toLocaleString(ar ? "ar-EG" : "en-US")}
        </div>
      )}
    </aside>
  );

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--background)", color: "var(--foreground)" }}>
      {!isMobile && shell}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200,
          display: "flex", justifyContent: ar ? "flex-end" : "flex-start",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ height: "100dvh" }}>{shell}</div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          borderBottom: "1px solid var(--border)", background: "var(--card)",
          position: "sticky", top: 0, zIndex: 40, minHeight: 60,
        }}>
          {isMobile && (
            <button onClick={() => setMobileOpen(true)} style={{
              width: 44, height: 44, borderRadius: 12, background: "var(--surface-2)",
              color: "var(--foreground)", border: "1px solid var(--border)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}><Menu size={22} /></button>
          )}
          <div style={{
            padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
            background: "linear-gradient(135deg,rgba(212,175,55,.15),rgba(212,175,55,.05))",
            color: "#D4AF37", border: "1px solid rgba(212,175,55,.3)",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Eye size={13} /> {ar ? "عرض للقراءة فقط · لا يمكن إجراء تغييرات" : "Read-only preview · no changes possible"}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { sessionStorage.removeItem(`share:data:${token}:${page}`); setRefreshKey((n) => n + 1); }}
            title={ar ? "تحديث" : "Refresh"}
            style={{ width: 44, height: 44, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={18} />
          </button>
          <div style={{ display: "inline-flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: 3 }}>
            <button onClick={() => { setLang("ar"); localStorage.setItem("lang", "ar"); }} style={topChip(ar)}>عربي</button>
            <button onClick={() => { setLang("en"); localStorage.setItem("lang", "en"); }} style={topChip(!ar)}>EN</button>
          </div>
          <button onClick={() => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); localStorage.setItem("theme", t); }}
            style={{ width: 44, height: 44, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <main style={{ flex: 1, padding: isMobile ? 14 : "28px 32px", overflow: "auto" }}>
          {notAllowed ? <AccessRestricted ar={ar} /> : <PageBody key={refreshKey} token={token} page={page} ar={ar} />}
        </main>
      </div>
    </div>
  );
}

function topChip(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", minHeight: 40, borderRadius: 999,
    background: active ? "var(--grad-blue)" : "transparent",
    color: active ? "#fff" : "var(--foreground)",
    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
    fontWeight: 700, fontSize: 13, cursor: "pointer",
  };
}

function AccessRestricted({ ar }: { ar: boolean }) {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--muted-foreground)" }}>
      <ShieldAlert size={44} style={{ color: "#F0676A", marginBottom: 10 }} />
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--foreground)" }}>
        {ar ? "غير مصرح بالوصول" : "Access restricted"}
      </div>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        {ar ? "هذه الصفحة غير مدرجة في هذا الرابط." : "This page is not included in this share link."}
      </div>
    </div>
  );
}

function PageBody({ token, page, ar }: { token: string; page: string; ar: boolean }) {
  const [data, setData] = useState<unknown>(null);
  const [err, setErr] = useState<string>("");
  useEffect(() => {
    setData(null); setErr("");
    const cacheKey = `share:data:${token}:${page}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed._at < 60_000) { setData(parsed.d); return; }
      } catch { /* */ }
    }
    shareApi.data(token, page).then((d) => {
      sessionStorage.setItem(cacheKey, JSON.stringify({ _at: Date.now(), d }));
      setData(d);
    }).catch((e) => setErr(String((e as Error).message)));
  }, [token, page]);

  if (err) return <div style={{ padding: 24, color: "#F0676A" }}>{err}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /></div>;

  switch (page) {
    case "dashboard": return <DashboardView data={data as DashboardData} ar={ar} />;
    case "projects": return <ProjectsView data={data as ProjectsData} ar={ar} />;
    case "tasks": return <TasksView data={data as TasksData} ar={ar} />;
    case "team": return <TeamView data={data as TeamData} ar={ar} />;
    case "league": return <LeagueView data={data as LeagueData} ar={ar} />;
    case "references": return <ReferencesView data={data as { references: ReferenceRow[] }} ar={ar} />;
    case "activity": return <ActivityView data={data as ActivityData} ar={ar} />;
    default: return <AccessRestricted ar={ar} />;
  }
}

/* ============================ DASHBOARD ============================ */

type DashboardData = {
  kpis: { activeTasks: number; doneTasks: number; overdue: number; activeProjects: number };
  distribution: Record<string, number>;
  trend: { d: string; count: number }[];
  projectStats: { id: string; name_ar: string | null; name_en: string | null; color: string | null; total: number; done: number; pct: number }[];
  teamPulse: { id: string; full_name: string; avatar_url: string | null; role: string; active: number; overdue: number; done: number }[];
  liveNow: number; totalHours: number;
  recent: { id: string; action: string; entity_type: string; created_at: string; actor_id: string | null; meta: Record<string, unknown> }[];
  actors: Record<string, { name: string; avatar_url: string | null }>;
};

function DashboardView({ data, ar }: { data: DashboardData; ar: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);

  const kpis = [
    { k: ar ? "المهام النشطة" : "Active tasks", v: data.kpis.activeTasks, c: "linear-gradient(135deg,#42C2EE,#2B6FB2)", icon: Activity },
    { k: ar ? "المشاريع النشطة" : "Active projects", v: data.kpis.activeProjects, c: "linear-gradient(135deg,#7B61FF,#4B37B8)", icon: FolderKanban },
    { k: ar ? "منجزة" : "Completed", v: data.kpis.doneTasks, c: "linear-gradient(135deg,#50C878,#2C8F52)", icon: CheckSquare },
    { k: ar ? "متأخرة" : "Overdue", v: data.kpis.overdue, c: "linear-gradient(135deg,#F0676A,#B33A3D)", icon: Flame },
  ];
  const dist = ["todo", "in_progress", "paused", "in_review", "done"].map((s) => ({ k: s, v: data.distribution[s] ?? 0 }));
  const distTotal = dist.reduce((s, x) => s + x.v, 0) || 1;
  const trendMax = Math.max(1, ...data.trend.map((x) => x.count));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "لوحة التحكم" : "Dashboard"}</h1>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-foreground)" }}>
            {ar ? "نظرة حية على أداء الفريق" : "A live snapshot of team performance"}
          </div>
        </div>
        <div style={{ padding: "10px 16px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <Clock size={18} style={{ color: "#D4AF37" }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{now.toLocaleTimeString(ar ? "ar-EG" : "en-US")}</div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{now.toLocaleDateString(ar ? "ar-EG" : "en-US", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
        {kpis.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.k} style={{ padding: 20, borderRadius: 18, background: c.c, color: "#fff", position: "relative", overflow: "hidden", boxShadow: "0 20px 40px -22px rgba(0,0,0,.5)" }}>
              <Icon size={72} style={{ position: "absolute", insetInlineEnd: -10, top: -10, opacity: .15 }} />
              <div style={{ fontSize: 12, opacity: .92, fontWeight: 700, textTransform: "uppercase", letterSpacing: .8 }}>{c.k}</div>
              <div style={{ fontSize: 38, fontWeight: 900, marginTop: 6, lineHeight: 1 }}>{c.v}</div>
            </div>
          );
        })}
      </div>

      {/* Live strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
        <LiveStat icon={Zap} label={ar ? "جلسات حية الآن" : "Live sessions"} value={String(data.liveNow)} color="#42C2EE" />
        <LiveStat icon={Clock} label={ar ? "إجمالي ساعات العمل" : "Total tracked hours"} value={`${data.totalHours}h`} color="#D4AF37" />
        <LiveStat icon={TrendingUp} label={ar ? "أفضل يوم إنجاز" : "Best completion day"} value={String(Math.max(...data.trend.map((x) => x.count), 0))} color="#50C878" />
      </div>

      {/* Trend + Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 16 }} className="share-grid">
        <div style={{ padding: 20, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{ar ? "إنجاز آخر ١٤ يوم" : "14-day completion trend"}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{ar ? "مهام مكتملة يوميًا" : "Tasks completed per day"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {data.trend.map((b) => (
              <div key={b.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} title={`${b.d}: ${b.count}`}>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 700 }}>{b.count || ""}</div>
                <div style={{ width: "100%", height: `${(b.count / trendMax) * 100}%`, minHeight: 3, background: b.count ? "var(--grad-blue)" : "var(--surface-2)", borderRadius: 6, transition: "height .3s" }} />
                <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{new Date(b.d).getDate()}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 20, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>{ar ? "توزيع المهام" : "Task distribution"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dist.map((d) => {
              const c = STATUS_COLORS[d.k];
              return (
                <div key={d.k}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: c.text }}>{statusLabel(d.k, ar)}</span>
                    <span style={{ fontWeight: 800 }}>{d.v}</span>
                  </div>
                  <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${(d.v / distTotal) * 100}%`, height: "100%", background: c.text, borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Project progress + Team pulse */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div style={{ padding: 20, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>{ar ? "تقدم المشاريع" : "Project progress"}</div>
          {data.projectStats.length === 0 && <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>—</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.projectStats.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, minWidth: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: PROJECT_COLORS[p.color ?? "blue"] ?? "var(--grad-blue)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ar ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</span>
                  </div>
                  <span style={{ fontWeight: 800, color: "#D4AF37" }}>{p.pct}%</span>
                </div>
                <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${p.pct}%`, height: "100%", background: PROJECT_COLORS[p.color ?? "blue"] ?? "var(--grad-blue)" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>
                  {p.done} / {p.total} {ar ? "مهمة" : "tasks"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 20, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>{ar ? "نبض الفريق" : "Team pulse"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.teamPulse.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, background: "var(--surface-2)" }}>
                <AvatarChip name={m.full_name} url={m.avatar_url} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                    {m.active} {ar ? "نشطة" : "active"} · {m.done} {ar ? "منجزة" : "done"}
                    {m.overdue > 0 && <span style={{ color: "#F0676A", marginInlineStart: 6, fontWeight: 700 }}>· {m.overdue} {ar ? "متأخرة" : "overdue"}</span>}
                  </div>
                </div>
              </div>
            ))}
            {data.teamPulse.length === 0 && <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>—</div>}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ padding: 20, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>{ar ? "النشاط الأخير" : "Recent activity"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {data.recent.map((r) => {
            const actor = r.actor_id ? data.actors[r.actor_id] : null;
            const title = (r.meta?.title as string) ?? "";
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
                <AvatarChip name={actor?.name ?? "?"} url={actor?.avatar_url} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {actor?.name ?? (ar ? "مستخدم" : "User")} <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>· {r.action} · {r.entity_type}</span>
                  </div>
                  {title && <div style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{relativeTime(r.created_at, ar)}</div>
              </div>
            );
          })}
          {data.recent.length === 0 && <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>—</div>}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) { .share-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

function LiveStat({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; label: string; value: string; color: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}22`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

/* ============================ PROJECTS ============================ */

type ProjectRow = { id: string; name_ar: string | null; name_en: string | null; description: string | null; status: string; color: string | null; created_at: string; archived?: boolean; total: number; done: number; pct: number; memberIds: string[] };
type ProjectsData = { projects: ProjectRow[]; members: Record<string, { full_name: string; avatar_url: string | null }> };
function ProjectsView({ data, ar }: { data: ProjectsData; ar: boolean }) {
  const [view, setView] = useState<"active" | "archived">("active");
  const list = data.projects.filter((p) => view === "active" ? !p.archived : p.archived);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "المشاريع" : "Projects"}</h1>
        <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: 999, padding: 4, border: "1px solid var(--border)" }}>
          {(["active", "archived"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: view === v ? "var(--grad-blue)" : "transparent", color: view === v ? "#fff" : "var(--foreground)", border: "none",
            }}>{ar ? (v === "active" ? "نشطة" : "مؤرشفة") : (v === "active" ? "Active" : "Archived")}</button>
          ))}
        </div>
      </div>
      {list.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>—</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {list.map((p) => {
          const grad = PROJECT_COLORS[p.color ?? "blue"] ?? PROJECT_COLORS.blue;
          const members = p.memberIds.slice(0, 4).map((id) => data.members[id]).filter(Boolean);
          const more = Math.max(0, p.memberIds.length - members.length);
          return (
            <div key={p.id} style={{ padding: 20, borderRadius: 18, background: "var(--card)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, height: 5, background: grad }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 6, gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{ar ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</div>
                  {p.description && <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{p.description}</div>}
                </div>
                <ProgressRing pct={p.pct} color={grad} />
              </div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ padding: "4px 10px", borderRadius: 999, background: "var(--surface-2)", fontSize: 11, fontWeight: 700 }}>{p.status}</span>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{p.done}/{p.total}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {members.map((m, i) => <div key={i} style={{ marginInlineStart: i ? -8 : 0 }}><AvatarChip name={m.full_name} url={m.avatar_url} size={26} /></div>)}
                  {more > 0 && <span style={{ marginInlineStart: -8, width: 26, height: 26, borderRadius: "50%", background: "var(--surface-2)", border: "2px solid var(--card)", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>+{more}</span>}
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted-foreground)" }}>
                📅 {new Date(p.created_at).toLocaleDateString(ar ? "ar-EG" : "en-US")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const size = 54; const stroke = 6; const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={`g-${pct}`} x1="0" x2="1"><stop offset="0" stopColor="#42C2EE" /><stop offset="1" stopColor="#D4AF37" /></linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--surface-2)" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={`url(#g-${pct})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{pct}%</div>
    </div>
  );
}

/* ============================ TASKS ============================ */

type TaskRow = { id: string; title: string; description: string | null; status: string; priority: string; due_date: string | null; start_date: string | null; project_id: string | null; assignee_id: string | null; created_at: string; tags: string[] | null };
type TasksData = { tasks: TaskRow[]; projects: Record<string, { name_ar: string | null; name_en: string | null; color: string | null }>; members: Record<string, { full_name: string; avatar_url: string | null }> };

function TasksView({ data, ar }: { data: TasksData; ar: boolean }) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const COLS = ["todo", "in_progress", "paused", "in_review", "done"] as const;
  const cols = useMemo(() => {
    const m: Record<string, TaskRow[]> = { todo: [], in_progress: [], paused: [], in_review: [], done: [] };
    data.tasks.forEach((t) => { m[t.status]?.push(t); });
    return m;
  }, [data.tasks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "المهام" : "Tasks"}</h1>
        <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: 999, padding: 4, border: "1px solid var(--border)" }}>
          {(["kanban", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: view === v ? "var(--grad-blue)" : "transparent", color: view === v ? "#fff" : "var(--foreground)", border: "none",
            }}>{ar ? (v === "kanban" ? "كانبان" : "جدول") : (v === "kanban" ? "Kanban" : "Table")}</button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(min(82vw, 280px), 1fr)", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
          {COLS.map((col) => {
            const c = STATUS_COLORS[col];
            const list = cols[col] ?? [];
            return (
              <div key={col} style={{
                padding: 12, minHeight: 200, borderRadius: 14,
                background: "var(--card)",
                border: `1px solid ${col === "in_review" ? "rgba(168,85,247,.35)" : "var(--border)"}`,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: `2px solid ${c.text}` }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.text }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, flex: 1, color: c.text }}>{statusLabel(col, ar)}</h3>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: c.bg, color: c.text }}>{list.length}</span>
                </div>
                {list.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", padding: "14px 6px" }}>—</div>}
                {list.map((t) => <TaskCardShare key={t.id} t={t} data={data} ar={ar} />)}
              </div>
            );
          })}
        </div>
      ) : (
        <TasksTable data={data} ar={ar} />
      )}
    </div>
  );
}

function TaskCardShare({ t, data, ar }: { t: TaskRow; data: TasksData; ar: boolean }) {
  const proj = t.project_id ? data.projects[t.project_id] : null;
  const asg = t.assignee_id ? data.members[t.assignee_id] : null;
  const overdue = !!t.due_date && new Date(t.due_date).getTime() < Date.now() && t.status !== "done";
  const grad = proj ? (PROJECT_COLORS[proj.color ?? "blue"] ?? PROJECT_COLORS.blue) : "var(--grad-blue)";

  // Elapsed timeline
  let elapsed = 0;
  if (t.start_date && t.due_date) {
    const s = new Date(t.start_date).getTime();
    const e = new Date(t.due_date).getTime();
    const n = Date.now();
    if (e > s) elapsed = Math.max(0, Math.min(100, ((n - s) / (e - s)) * 100));
  }

  return (
    <div style={{
      padding: 12, borderRadius: 12, background: "var(--surface-2)",
      border: `1px solid ${overdue ? "rgba(240,103,106,.5)" : "var(--border)"}`,
      borderInlineStart: `3px solid transparent`,
      backgroundImage: `linear-gradient(var(--surface-2),var(--surface-2)), ${grad}`,
      backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box",
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{t.title}</div>
      {t.tags && t.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {t.tags.slice(0, 3).map((tag) => <span key={tag} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--card)", color: "var(--muted-foreground)", fontWeight: 700 }}>#{tag}</span>)}
        </div>
      )}
      {elapsed > 0 && (
        <div style={{ height: 4, background: "var(--card)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ width: `${elapsed}%`, height: "100%", background: overdue ? "#F0676A" : grad }} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: overdue ? "#F0676A" : "var(--muted-foreground)", fontWeight: overdue ? 700 : 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLOR[t.priority] ?? "#86A1B7" }} />
          <span>{t.due_date ? new Date(t.due_date).toLocaleDateString(ar ? "ar-EG" : "en-US", { month: "short", day: "numeric" }) : "—"}</span>
        </div>
        {asg && <AvatarChip name={asg.full_name} url={asg.avatar_url} size={24} />}
      </div>
    </div>
  );
}

function TasksTable({ data, ar }: { data: TasksData; ar: boolean }) {
  return (
    <div style={{ padding: 0, borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", textAlign: ar ? "right" : "left" }}>
              {["title", "status", "priority", "project", "assignee", "due"].map((h) => (
                <th key={h} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .6, color: "var(--muted-foreground)" }}>
                  {ar ? ({ title: "العنوان", status: "الحالة", priority: "الأولوية", project: "المشروع", assignee: "المسند إليه", due: "الاستحقاق" } as Record<string, string>)[h] : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => {
              const proj = t.project_id ? data.projects[t.project_id] : null;
              const asg = t.assignee_id ? data.members[t.assignee_id] : null;
              const c = STATUS_COLORS[t.status];
              return (
                <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 700, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</td>
                  <td style={{ padding: "12px 14px" }}><span style={{ padding: "3px 10px", borderRadius: 999, background: c.bg, color: c.text, fontWeight: 700, fontSize: 11 }}>{statusLabel(t.status, ar)}</span></td>
                  <td style={{ padding: "12px 14px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLOR[t.priority] ?? "#86A1B7" }} />{t.priority}</span></td>
                  <td style={{ padding: "12px 14px", fontSize: 12 }}>{proj ? (ar ? (proj.name_ar || proj.name_en) : (proj.name_en || proj.name_ar)) : "—"}</td>
                  <td style={{ padding: "12px 14px" }}>{asg ? <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><AvatarChip name={asg.full_name} url={asg.avatar_url} size={22} /><span style={{ fontSize: 12 }}>{asg.full_name}</span></div> : "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted-foreground)" }}>{t.due_date ? new Date(t.due_date).toLocaleDateString(ar ? "ar-EG" : "en-US") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ TEAM ============================ */

type TeamData = { members: { id: string; full_name: string; avatar_url: string | null; role: string; is_master_admin: boolean; total: number; done: number; active: number; completion: number }[] };
function TeamView({ data, ar }: { data: TeamData; ar: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "الفريق" : "Team"}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 16 }}>
        {data.members.map((m) => {
          const roleLabel = m.is_master_admin ? (ar ? "مدير النظام" : "Master admin") : m.role === "admin" ? (ar ? "نائب مدير" : "Admin") : (ar ? "عضو" : "Member");
          const roleColor = m.is_master_admin ? "linear-gradient(135deg,#D4AF37,#8B6914)" : m.role === "admin" ? "linear-gradient(135deg,#7B61FF,#4B37B8)" : "linear-gradient(135deg,#42C2EE,#2B6FB2)";
          return (
            <div key={m.id} style={{ padding: 22, borderRadius: 18, background: "var(--card)", border: "1px solid var(--border)", textAlign: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, height: 60, background: roleColor, opacity: .12 }} />
              <div style={{ position: "relative" }}>
                <AvatarChip name={m.full_name} url={m.avatar_url} size={76} />
                <div style={{ marginTop: 10, fontWeight: 800, fontSize: 15 }}>{m.full_name}</div>
                <div style={{ marginTop: 4, display: "inline-block", padding: "3px 10px", borderRadius: 999, background: roleColor, color: "#fff", fontSize: 11, fontWeight: 700 }}>{roleLabel}</div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "space-around", fontSize: 12 }}>
                  <Stat label={ar ? "نشطة" : "Active"} v={m.active} c="#42C2EE" />
                  <Stat label={ar ? "منجزة" : "Done"} v={m.done} c="#50C878" />
                  <Stat label={ar ? "إجمالي" : "Total"} v={m.total} c="#D4AF37" />
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${m.completion}%`, height: "100%", background: "var(--grad-gold)" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>{m.completion}% {ar ? "معدل الإنجاز" : "completion rate"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ============================ LEAGUE ============================ */

type LeagueData = { board: { id: string; full_name: string; avatar_url: string | null; role: string; is_master_admin: boolean; done: number; points: number }[] };
function LeagueView({ data, ar }: { data: LeagueData; ar: boolean }) {
  const top3 = data.board.slice(0, 3);
  const rest = data.board.slice(3);
  const podiumIcons = [Crown, Medal, Award];
  const podiumColors = ["linear-gradient(135deg,#F4CF6B,#D4AF37)", "linear-gradient(135deg,#C0C7D1,#8B95A3)", "linear-gradient(135deg,#D89465,#A56637)"];
  const podiumHeights = [140, 110, 90];
  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd for visual centering

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "الدوري" : "League"}</h1>

      {top3.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 14, padding: "30px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18 }}>
          {podiumOrder.map((idx) => {
            const p = top3[idx];
            if (!p) return <div key={idx} style={{ width: 100 }} />;
            const Icon = podiumIcons[idx];
            return (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 110 }}>
                <Icon size={28} style={{ color: idx === 0 ? "#D4AF37" : idx === 1 ? "#C0C7D1" : "#D89465" }} />
                <AvatarChip name={p.full_name} url={p.avatar_url} size={64} />
                <div style={{ fontWeight: 800, fontSize: 13, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{p.full_name}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#D4AF37" }}>{p.points}</div>
                <div style={{ width: "100%", height: podiumHeights[idx], background: podiumColors[idx], borderRadius: "10px 10px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8, color: "#0B1116", fontWeight: 900, fontSize: 22 }}>#{idx + 1}</div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div style={{ padding: 16, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
          {rest.map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 10px", borderBottom: i < rest.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "var(--muted-foreground)" }}>#{i + 4}</div>
              <AvatarChip name={r.full_name} url={r.avatar_url} size={36} />
              <div style={{ flex: 1, fontWeight: 700 }}>{r.full_name}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{r.done} {ar ? "منجزة" : "done"}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#D4AF37", minWidth: 40, textAlign: "end" }}>{r.points}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ REFERENCES ============================ */

type ReferenceRow = { id: string; title: string; url: string; description: string | null; category: string | null; created_at: string };
function ReferencesView({ data, ar }: { data: { references: ReferenceRow[] }; ar: boolean }) {
  const cats = useMemo(() => {
    const s = new Set<string>();
    data.references.forEach((r) => { if (r.category) s.add(r.category); });
    return Array.from(s);
  }, [data.references]);
  const [cat, setCat] = useState<string | null>(null);
  const list = cat ? data.references.filter((r) => r.category === cat) : data.references;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "المراجع" : "References"}</h1>
      {cats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setCat(null)} style={catChip(cat === null)}>{ar ? "الكل" : "All"}</button>
          {cats.map((c) => <button key={c} onClick={() => setCat(c)} style={catChip(cat === c)}>#{c}</button>)}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {list.map((r) => {
          const domain = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return r.url; } })();
          return (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" style={{
              padding: 18, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)",
              color: "var(--foreground)", textDecoration: "none", display: "flex", flexDirection: "column", gap: 8,
              transition: "transform .15s, border-color .15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{r.title}</div>
                <ExternalLink size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
              </div>
              {r.description && <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{r.description}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{domain}</span>
                {r.category && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(212,175,55,.15)", color: "#D4AF37", fontWeight: 700 }}>#{r.category}</span>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
function catChip(active: boolean): React.CSSProperties {
  return { padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", background: active ? "var(--grad-gold)" : "var(--surface-2)", color: active ? "#0B1116" : "var(--foreground)", border: "1px solid var(--border)" };
}

/* ============================ ACTIVITY ============================ */

type ActivityData = { activity: { id: string; action: string; entity_type: string; entity_id: string | null; meta: Record<string, unknown>; created_at: string; actor_id: string | null }[]; actors: Record<string, { name: string; avatar_url: string | null }> };
function ActivityView({ data, ar }: { data: ActivityData; ar: boolean }) {
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const entities = useMemo(() => {
    const s = new Set<string>();
    data.activity.forEach((a) => s.add(a.entity_type));
    return Array.from(s);
  }, [data.activity]);
  const list = entityFilter === "all" ? data.activity : data.activity.filter((a) => a.entity_type === entityFilter);
  const actionColor: Record<string, string> = {
    created: "#50C878", updated: "#42C2EE", deleted: "#F0676A",
    archived: "#86A1B7", status_changed: "#7B61FF", assigned: "#FF9255",
    commented: "#A855F7", file_added: "#D4AF37",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>{ar ? "سجل النشاط" : "Activity log"}</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={() => setEntityFilter("all")} style={catChip(entityFilter === "all")}>{ar ? "الكل" : "All"}</button>
        {entities.map((e) => <button key={e} onClick={() => setEntityFilter(e)} style={catChip(entityFilter === e)}>{e}</button>)}
      </div>
      <div style={{ padding: 8, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
        {list.map((r, i) => {
          const actor = r.actor_id ? data.actors[r.actor_id] : null;
          const c = actionColor[r.action] ?? "#86A1B7";
          const title = (r.meta?.title as string) ?? "";
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 10px", borderBottom: i < list.length - 1 ? "1px solid var(--border)" : "none" }}>
              <AvatarChip name={actor?.name ?? "?"} url={actor?.avatar_url} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {actor?.name ?? (ar ? "مستخدم" : "User")}
                  <span style={{ marginInlineStart: 8, padding: "2px 8px", borderRadius: 999, background: `${c}22`, color: c, fontSize: 11, fontWeight: 800 }}>{r.action}</span>
                  <span style={{ marginInlineStart: 6, fontSize: 11, color: "var(--muted-foreground)" }}>· {r.entity_type}</span>
                </div>
                {title && <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap", textAlign: "end" }}>
                <div>{relativeTime(r.created_at, ar)}</div>
                <div style={{ fontSize: 10, marginTop: 2 }}>{new Date(r.created_at).toLocaleDateString(ar ? "ar-EG" : "en-US")}</div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>—</div>}
      </div>
    </div>
  );
}
