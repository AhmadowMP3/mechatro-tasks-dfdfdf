import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Award, Flame, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { toLocalDigits } from "@/lib/format";

/** Mini podium of the current active season's top 3, linking to /league. */
export function LeaguePodiumCard() {
  const { t, lang, users, user } = useApp();

  const { data } = useQuery({
    queryKey: ["dashboard-podium"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data: season } = await supabase
        .from("league_seasons").select("id,name")
        .eq("status", "active").eq("scope", "global")
        .lte("starts_at", nowIso).gte("ends_at", nowIso)
        .order("starts_at", { ascending: false }).limit(1).maybeSingle();
      if (!season) return { season: null, scores: [], stats: [] };
      const { data: scores } = await supabase
        .from("season_scores").select("user_id,points,tasks_done,last_rank")
        .eq("season_id", season.id).order("points", { ascending: false }).limit(10);
      const ids = (scores ?? []).map((s) => s.user_id);
      const { data: stats } = ids.length
        ? await supabase.from("profiles").select("id,current_streak").in("id", ids)
        : { data: [] };
      return { season, scores: scores ?? [], stats: stats ?? [] };
    },
  });

  const season = data?.season;
  if (!season) return null;

  const rows = (data.scores ?? []).map((s) => ({
    id: s.user_id,
    points: s.points,
    streak: data.stats?.find((p) => p.id === s.user_id)?.current_streak ?? 0,
    profile: users.find((u) => u.id === s.user_id),
  })).filter((r) => r.profile);

  const podium = rows.slice(0, 3);
  const medals = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const myIdx = rows.findIndex((r) => r.id === user?.id);

  return (
    <Link to="/league" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="brand-card hover-scale" style={{
        padding: 20, position: "relative", overflow: "hidden", cursor: "pointer",
        background: "linear-gradient(135deg, rgba(255,215,0,.05), rgba(66,194,238,.03))",
        borderColor: "rgba(255,215,0,.25)",
      }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(400px 140px at 100% 0%, rgba(255,215,0,.12), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              {t("currentSeason")}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <Trophy size={16} color="#FFD700" /> {season.name}
            </div>
          </div>
          <ChevronRight size={20} style={{ color: "var(--muted)" }} />
        </div>

        {podium.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>—</div>
        ) : (
          <div style={{
            direction: "ltr", display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "auto auto",
            alignItems: "end", justifyItems: "center", gap: 8,
          }}>
            {[1, 0, 2].map((pos) => {
              const r = podium[pos];
              const icon = pos === 0 ? <Trophy size={14} /> : pos === 1 ? <Medal size={12} /> : <Award size={12} />;
              return (
                <div key={`p-${pos}`} style={{
                  gridRow: 1, gridColumn: pos === 1 ? 1 : pos === 0 ? 2 : 3,
                  width: "100%", minWidth: 0, textAlign: "center", minHeight: 96,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                }}>
                  {r && (
                    <>
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <Avatar id={r.id} name={r.profile!.full_name} size={pos === 0 ? 52 : 40} />
                        <div style={{
                          position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: "50%",
                          background: medals[pos], display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.3)",
                        }}>{icon}</div>
                      </div>
                      <div dir="auto" style={{ fontSize: 11, fontWeight: 700, marginTop: 6, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.profile!.full_name.split(" ")[0]}
                      </div>
                      <div dir="auto" style={{ fontSize: 16, fontWeight: 900, color: medals[pos], whiteSpace: "nowrap" }}>
                        {toLocalDigits(r.points, lang)}
                      </div>
                      {r.streak >= 3 && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#F0676A", fontWeight: 700 }}>
                          <Flame size={10} /> {toLocalDigits(r.streak, lang)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {[1, 0, 2].map((pos) => {
              const r = podium[pos];
              const h = pos === 0 ? 80 : pos === 1 ? 60 : 44;
              return (
                <div key={`b-${pos}`} style={{
                  gridRow: 2, gridColumn: pos === 1 ? 1 : pos === 0 ? 2 : 3,
                  width: "100%", height: h, marginTop: 4,
                  background: r
                    ? `linear-gradient(180deg, ${medals[pos]}66, transparent)`
                    : "linear-gradient(180deg, rgba(255,255,255,.05), transparent)",
                  borderRadius: "8px 8px 0 0",
                }} />
              );
            })}
          </div>

        )}

        {myIdx >= 0 && (
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 10,
            background: "rgba(24,159,209,.10)", border: "1px solid rgba(24,159,209,.25)",
            fontSize: 12, fontWeight: 700, display: "flex", justifyContent: "space-between",
          }}>
            <span>{t("yourRank")}: #{toLocalDigits(myIdx + 1, lang)}</span>
            <span style={{ color: "var(--brand-blue)" }}>{toLocalDigits(rows[myIdx].points, lang)} {t("points")}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
