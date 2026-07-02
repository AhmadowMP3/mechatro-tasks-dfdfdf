import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Trophy, Library, ScrollText, ShieldAlert, Loader2, Eye, Menu, X, Moon, Sun } from "lucide-react";
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

function ShareView() {
  const { token, page } = Route.useParams();
  const navigate = useNavigate();
  const [link, setLink] = useState<ResolvedLink | null>(null);
  const [checking, setChecking] = useState(true);
  const [lang, setLang] = useState<"ar" | "en">((typeof window !== "undefined" && (localStorage.getItem("lang") as "ar" | "en")) || "ar");
  const [theme, setTheme] = useState<"dark" | "light">((typeof window !== "undefined" && (localStorage.getItem("theme") as "dark" | "light")) || "dark");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ar = lang === "ar";

  useEffect(() => {
    const cached = sessionStorage.getItem(`share:${token}`);
    if (cached) { try { setLink(JSON.parse(cached)); setChecking(false); return; } catch { /* */ } }
    // No cached session — re-resolve without password; if password required, bounce to entry.
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
          {notAllowed ? <AccessRestricted ar={ar} /> : <PageBody token={token} page={page} ar={ar} />}
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
    shareApi.data(token, page).then(setData).catch((e) => setErr(String((e as Error).message)));
  }, [token, page]);

  if (err) return <div style={{ padding: 24, color: "#F0676A" }}>{err}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /></div>;

  switch (page) {
    case "dashboard": return <DashboardView data={data as DashboardData} ar={ar} />;
    case "projects": return <ProjectsView data={data as { projects: ProjectRow[] }} ar={ar} />;
    case "tasks": return <TasksView data={data as { tasks: TaskRow[] }} ar={ar} />;
    case "team": return <TeamView data={data as { members: MemberRow[] }} ar={ar} />;
    case "league": return <LeagueView data={data as { board: LeagueRow[] }} ar={ar} />;
    case "references": return <ReferencesView data={data as { references: ReferenceRow[] }} ar={ar} />;
    case "activity": return <ActivityView data={data as { activity: ActivityRow[]; actors: Record<string,string> }} ar={ar} />;
    default: return <AccessRestricted ar={ar} />;
  }
}

/* ---------- read-only page views ---------- */
type DashboardData = { kpis: { activeTasks: number; doneTasks: number; overdue: number; activeProjects: number }; distribution: Record<string, number> };
function DashboardView({ data, ar }: { data: DashboardData; ar: boolean }) {
  const cards = [
    { k: ar ? "المهام النشطة" : "Active tasks", v: data.kpis.activeTasks, c: "var(--grad-blue)" },
    { k: ar ? "المشاريع النشطة" : "Active projects", v: data.kpis.activeProjects, c: "linear-gradient(135deg,#7B61FF,#4B37B8)" },
    { k: ar ? "منجزة" : "Completed", v: data.kpis.doneTasks, c: "linear-gradient(135deg,#50C878,#2C8F52)" },
    { k: ar ? "متأخرة" : "Overdue", v: data.kpis.overdue, c: "linear-gradient(135deg,#F0676A,#B33A3D)" },
  ];
  const dist = Object.entries(data.distribution);
  const total = dist.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "لوحة التحكم" : "Dashboard"}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.k} style={{ padding: 20, borderRadius: 16, background: c.c, color: "#fff", boxShadow: "0 12px 30px -12px rgba(0,0,0,.4)" }}>
            <div style={{ fontSize: 12, opacity: .9, fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{c.v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 20, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{ar ? "توزيع المهام" : "Task distribution"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dist.map(([k, v]) => (
            <div key={k}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{k}</span><span>{v}</span>
              </div>
              <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
                <div style={{ width: `${(v / total) * 100}%`, height: "100%", background: "var(--grad-gold)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ProjectRow = { id: string; name_ar: string | null; name_en: string | null; description: string | null; status: string; color: string | null; created_at: string };
function ProjectsView({ data, ar }: { data: { projects: ProjectRow[] }; ar: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "المشاريع" : "Projects"}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {data.projects.map((p) => (
          <div key={p.id} style={{ padding: 18, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)", borderTop: `4px solid ${p.color ?? "#2B6FB2"}` }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{ar ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</div>
            {p.description && <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted-foreground)" }}>{p.description}</div>}
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
              <span style={{ padding: "3px 10px", borderRadius: 999, background: "var(--surface-2)", fontWeight: 700 }}>{p.status}</span>
              <span>{new Date(p.created_at).toLocaleDateString(ar ? "ar-EG" : "en-US")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type TaskRow = { id: string; title: string; description: string | null; status: string; priority: string; due_date: string | null; project_id: string | null; assignee_id: string | null; created_at: string };
function TasksView({ data, ar }: { data: { tasks: TaskRow[] }; ar: boolean }) {
  const cols = useMemo(() => ({
    todo: [] as TaskRow[], in_progress: [] as TaskRow[], paused: [] as TaskRow[], in_review: [] as TaskRow[], done: [] as TaskRow[],
  }), []);
  data.tasks.forEach((t) => { (cols as Record<string, TaskRow[]>)[t.status]?.push(t); });
  const titles: Record<string, string> = ar
    ? { todo: "لم تبدأ", in_progress: "قيد التنفيذ", paused: "متوقفة", in_review: "قيد المراجعة", done: "مكتملة" }
    : { todo: "To do", in_progress: "In progress", paused: "Paused", in_review: "In review", done: "Done" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "المهام" : "Tasks"}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(220px, 1fr))", gap: 12, overflowX: "auto" }}>
        {Object.entries(cols).map(([k, arr]) => (
          <div key={k} style={{ padding: 12, borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px 8px" }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{titles[k]}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{arr.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 600, overflowY: "auto" }}>
              {arr.map((t) => (
                <div key={t.id} style={{ padding: 10, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, fontSize: 11, color: "var(--muted-foreground)" }}>
                    <span style={{ padding: "2px 6px", borderRadius: 6, background: "var(--card)" }}>{t.priority}</span>
                    {t.due_date && <span>{new Date(t.due_date).toLocaleDateString(ar ? "ar-EG" : "en-US")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type MemberRow = { id: string; full_name: string; role: string; avatar_url: string | null; is_master_admin: boolean };
function TeamView({ data, ar }: { data: { members: MemberRow[] }; ar: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "الفريق" : "Team"}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
        {data.members.map((m) => (
          <div key={m.id} style={{ padding: 18, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{
              width: 68, height: 68, borderRadius: "50%", margin: "0 auto",
              background: m.avatar_url ? `url(${m.avatar_url}) center/cover` : "var(--grad-blue)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 24,
            }}>
              {!m.avatar_url && m.full_name.charAt(0)}
            </div>
            <div style={{ marginTop: 10, fontWeight: 800 }}>{m.full_name}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-foreground)" }}>
              {m.is_master_admin ? (ar ? "مدير النظام" : "Master admin") : m.role}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type LeagueRow = { id: string; full_name: string; avatar_url: string | null; done: number };
function LeagueView({ data, ar }: { data: { board: LeagueRow[] }; ar: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "الدوري" : "League"}</h1>
      <div style={{ padding: 16, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
        {data.board.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 8px", borderBottom: i < data.board.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              background: i === 0 ? "var(--grad-gold)" : i < 3 ? "var(--surface-2)" : "transparent",
              color: i === 0 ? "#0B1116" : "var(--foreground)", fontWeight: 900,
            }}>{i + 1}</div>
            <div style={{ flex: 1, fontWeight: 700 }}>{r.full_name}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#D4AF37" }}>{r.done}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ReferenceRow = { id: string; title: string; url: string; description: string | null; category: string | null; created_at: string };
function ReferencesView({ data, ar }: { data: { references: ReferenceRow[] }; ar: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "المراجع" : "References"}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
        {data.references.map((r) => (
          <a key={r.id} href={r.url} target="_blank" rel="noreferrer" style={{
            padding: 16, borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)",
            color: "var(--foreground)", textDecoration: "none", display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontWeight: 800 }}>{r.title}</div>
            {r.description && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{r.description}</div>}
            {r.category && <div style={{ fontSize: 11, color: "#D4AF37", fontWeight: 700 }}>#{r.category}</div>}
          </a>
        ))}
      </div>
    </div>
  );
}

type ActivityRow = { id: string; action: string; entity_type: string; entity_id: string | null; meta: Record<string, unknown>; created_at: string; actor_id: string | null };
function ActivityView({ data, ar }: { data: { activity: ActivityRow[]; actors: Record<string,string> }; ar: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{ar ? "سجل النشاط" : "Activity log"}</h1>
      <div style={{ padding: 12, borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)" }}>
        {data.activity.map((row, i) => (
          <div key={row.id} style={{ display: "flex", gap: 12, padding: "10px 6px", borderBottom: i < data.activity.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--grad-gold)", marginTop: 8, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {(data.actors[row.actor_id ?? ""] ?? (ar ? "مستخدم" : "User"))} · {row.action} · <span style={{ color: "var(--muted-foreground)" }}>{row.entity_type}</span>
              </div>
              {(row.meta?.title as string) && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{row.meta.title as string}</div>}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
              {new Date(row.created_at).toLocaleString(ar ? "ar-EG" : "en-US")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
