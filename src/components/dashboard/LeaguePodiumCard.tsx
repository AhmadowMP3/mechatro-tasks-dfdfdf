import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Award, Flame, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { toLocalDigits } from "@/lib/format";

/** Mini podium of the overall top 3, linking to /league. */
export function LeaguePodiumCard() {
  const { t, lang, users, user } = useApp();

  const { data } = useQuery({
    queryKey: ["dashboard-podium"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id,full_name,total_points,current_streak,active,status")
        .order("total_points", { ascending: false })
        .limit(50);
      return { rows: rows ?? [] };
    },
  });

  const rows = (data?.rows ?? [])
    .filter((p) => p.active !== false && p.status !== "suspended")
    .map((p) => ({
      id: p.id,
      points: p.total_points ?? 0,
      streak: p.current_streak ?? 0,
      full_name: p.full_name,
    }))
    .sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name));

  if (rows.length === 0) return null;

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
              {t("leaderboard")}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <Trophy size={16} color="#FFD700" /> {t("points")}
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
                        <Avatar id={r.id} name={r.full_name} size={pos === 0 ? 52 : 40} />
                        <div style={{
                          position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: "50%",
                          background: medals[pos], display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.3)",
                        }}>{icon}</div>
                      </div>
                      <div dir="auto" style={{ fontSize: 11, fontWeight: 700, marginTop: 6, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.full_name.split(" ")[0]}
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
