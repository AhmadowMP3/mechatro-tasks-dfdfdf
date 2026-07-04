import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { toLocalDigits } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/_authenticated/league")({ component: LeaguePage });

function LeaguePage() {
  const { t, lang, user, users } = useApp();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data } = useQuery({
    queryKey: ["league", month],
    queryFn: async () => {
      const start = new Date(`${month}-01T00:00:00`);
      const end = new Date(start); end.setMonth(end.getMonth() + 1);
      const [tasks, sessions] = await Promise.all([
        supabase.from("tasks").select("assignee_id,status,priority,due_date,completed_at")
          .gte("completed_at", start.toISOString()).lt("completed_at", end.toISOString()),
        supabase.from("work_sessions").select("user_id,duration_minutes,started_at")
          .gte("started_at", start.toISOString()).lt("started_at", end.toISOString()),
      ]);
      return { tasks: tasks.data ?? [], sessions: sessions.data ?? [] };
    },
  });

  const rankings = useMemo(() => {
    const map = new Map<string, number>();
    (data?.tasks ?? []).forEach((tk) => {
      if (tk.status !== "done" || !tk.assignee_id) return;
      const onTime = tk.due_date && tk.completed_at && new Date(tk.completed_at) <= new Date(tk.due_date);
      let pts = onTime ? 10 : 4;
      if (tk.priority === "high" || tk.priority === "urgent") pts += 5;
      map.set(tk.assignee_id, (map.get(tk.assignee_id) ?? 0) + pts);
    });
    (data?.sessions ?? []).forEach((s) => {
      if (!s.user_id || !s.duration_minutes) return;
      map.set(s.user_id, (map.get(s.user_id) ?? 0) + s.duration_minutes / 60);
    });
    return Array.from(map.entries())
      .map(([id, points]) => ({ id, points: Math.round(points), user: users.find((u) => u.id === id) }))
      .filter((r) => r.user)
      .sort((a, b) => b.points - a.points);
  }, [data, users]);

  const podium = rankings.slice(0, 3);
  const rest = rankings.slice(3);
  const medals = ["#FFD700", "#C0C0C0", "#CD7F32"];

  return (
    <div>
      <PageHeader
        title={t("monthlyLeaderboard")}
        actions={
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ minHeight: 44, padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 14 }}
          />
        }
      />


      {/* Podium */}
      {podium.length > 0 && (
        <div className="brand-card" style={{ padding: 24, marginBottom: 20, display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          {[1, 0, 2].map((pos) => {
            const r = podium[pos]; if (!r) return null;
            const h = pos === 0 ? 130 : pos === 1 ? 100 : 80;
            return (
              <div key={r.id} style={{ textAlign: "center" }}>
                <Avatar id={r.id} name={r.user!.full_name} size={pos === 0 ? 72 : 56} />
                <div style={{ fontWeight: 700, marginTop: 8, fontSize: 14 }}>{r.user!.full_name}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: medals[pos] }}>{toLocalDigits(r.points, lang)}</div>
                <div style={{ width: 84, height: h, background: `linear-gradient(180deg, ${medals[pos]}, transparent)`, marginTop: 6, borderRadius: "8px 8px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8 }}>
                  <Trophy size={22} color="#fff" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
        {rankings.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>—</div>
        ) : rankings.map((r, i) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
            borderBottom: i < rankings.length - 1 ? "1px solid var(--border)" : "none",
            background: r.id === user?.id ? "rgba(24,159,209,.08)" : "transparent",
          }}>
            <div style={{ width: 32, fontWeight: 800, textAlign: "center", color: i < 3 ? medals[i] : "var(--muted)" }}>{toLocalDigits(i + 1, lang)}</div>
            <Avatar id={r.id} name={r.user!.full_name} size={40} />
            <div style={{ flex: 1, fontWeight: 700 }}>{r.user!.full_name}</div>
            <div style={{ fontSize: 18, fontWeight: 800, background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{toLocalDigits(r.points, lang)} {t("points")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
