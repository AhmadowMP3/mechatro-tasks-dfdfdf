import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Trophy, Flame, Award, Medal } from "lucide-react";
import { supabase } from "@/lib/security/db";
import { fetchLeaderboard } from "@/lib/leaderboard";

import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { toLocalDigits } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/_authenticated/league")({ component: LeaguePage });

const BADGE_META: Record<string, { emoji: string; ar: string; en: string }> = {
  first_blood: { emoji: "🎖", ar: "أول مهمة", en: "First Blood" },
  century: { emoji: "💯", ar: "١٠٠ نقطة", en: "Century" },
  half_k: { emoji: "🏅", ar: "٥٠٠ نقطة", en: "Half-K" },
  kilo: { emoji: "👑", ar: "١٠٠٠ نقطة", en: "Kilo" },
  on_fire: { emoji: "🔥", ar: "مشتعل", en: "On Fire" },
  speed_demon: { emoji: "⚡", ar: "سرعة البرق", en: "Speed Demon" },
  team_player: { emoji: "🤝", ar: "لاعب فريق", en: "Team Player" },
  perfectionist: { emoji: "💎", ar: "متقن", en: "Perfectionist" },
  champion: { emoji: "🏆", ar: "بطل", en: "Champion" },
  runner_up: { emoji: "🥈", ar: "الوصيف", en: "Runner-up" },
};

type Row = { id: string; full_name: string; points: number; streak: number };

function LeaguePage() {
  const { t, lang, user } = useApp();

  const { data: people } = useQuery({
    queryKey: ["leaderboard-profiles"],
    queryFn: fetchLeaderboard,
  });

  const { data: badges } = useQuery({
    queryKey: ["user-badges"],
    queryFn: async () => (await supabase.from("user_badges").select("user_id,code")).data ?? [],
  });

  const rankings: Row[] = useMemo(
    () =>
      (people ?? [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          points: p.total_points ?? 0,
          streak: p.current_streak ?? 0,
        }))
        .sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name)),
    [people],
  );


  const badgesByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    (badges ?? []).forEach((b) => {
      if (!m.has(b.user_id)) m.set(b.user_id, []);
      m.get(b.user_id)!.push(b.code);
    });
    return m;
  }, [badges]);

  const podium = rankings.slice(0, 3);
  const rest = rankings.slice(3);
  const medals = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const myRank = rankings.findIndex((r) => r.id === user?.id);

  return (
    <div>
      <PageHeader title={t("leaderboard")} />

      {rankings.length === 0 && (
        <div className="brand-card" style={{ padding: 40, textAlign: "center" }}>
          <Trophy size={48} color="#FFD700" style={{ margin: "0 auto 12px" }} />
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
            {lang === "ar"
              ? "لا توجد بيانات ترتيب حالياً. إذا كنت مسؤولاً، تأكد من تطبيق سكربت قاعدة البيانات scripts/sql/2026-08-26-leaderboard-function.sql على السيرفر."
              : "No ranking data available. If you are an admin, make sure scripts/sql/2026-08-26-leaderboard-function.sql has been applied to the server."}
          </div>
        </div>
      )}


      {/* Podium */}
      {podium.length > 0 && (
        <div className="brand-card animate-fade-in" style={{
          padding: 24, marginBottom: 20, overflow: "hidden",
          background: "linear-gradient(135deg, rgba(255,215,0,.06), rgba(66,194,238,.04))",
        }}>
          <div style={{
            direction: "ltr",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gridTemplateRows: "auto auto",
            alignItems: "end",
            justifyItems: "center",
            gap: 12,
            maxWidth: 520,
            margin: "0 auto",
          }}>
            {[1, 0, 2].map((pos) => {
              const r = podium[pos];
              const medalIcon = pos === 0 ? <Trophy size={22} /> : pos === 1 ? <Medal size={20} /> : <Award size={18} />;
              return (
                <div key={pos} style={{
                  gridRow: 1, gridColumn: pos === 1 ? 1 : pos === 0 ? 2 : 3,
                  width: "100%", minWidth: 0, textAlign: "center",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "flex-end", minHeight: 150,
                }}>
                  {r && (
                    <>
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <Avatar id={r.id} name={r.full_name} size={pos === 0 ? 80 : 60} />
                        <div style={{
                          position: "absolute", top: -6, right: -6, width: 28, height: 28, borderRadius: "50%",
                          background: medals[pos], display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 4px 12px rgba(0,0,0,.3)", color: "#fff",
                        }}>{medalIcon}</div>
                      </div>
                      <div dir="auto" style={{
                        fontWeight: 800, marginTop: 10, fontSize: 14, lineHeight: 1.3,
                        width: "100%", overflowWrap: "anywhere",
                      }}>{r.full_name}</div>
                      <div dir="auto" style={{ fontSize: 22, fontWeight: 900, color: medals[pos], whiteSpace: "nowrap" }}>
                        {toLocalDigits(r.points, lang)} <span style={{ fontSize: 12, opacity: .8 }}>{t("points")}</span>
                      </div>
                      {r.streak >= 3 && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, marginTop: 2, color: "#F0676A", fontWeight: 700 }}>
                          <Flame size={12} /> {toLocalDigits(r.streak, lang)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {[1, 0, 2].map((pos) => {
              const r = podium[pos];
              const h = pos === 0 ? 140 : pos === 1 ? 105 : 80;
              return (
                <div key={`bar-${pos}`} style={{
                  gridRow: 2, gridColumn: pos === 1 ? 1 : pos === 0 ? 2 : 3,
                  width: "100%", maxWidth: 110, height: h, marginTop: 8,
                  background: r
                    ? `linear-gradient(180deg, ${medals[pos]}, transparent)`
                    : "linear-gradient(180deg, rgba(255,255,255,.06), transparent)",
                  borderRadius: "12px 12px 0 0",
                  display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10,
                }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", opacity: r ? .9 : .25 }}>#{pos + 1}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Your rank */}
      {myRank >= 0 && (
        <div className="brand-card" style={{
          padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 12,
          flexWrap: "wrap", background: "rgba(24,159,209,.08)", borderColor: "rgba(24,159,209,.3)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("yourRank")}</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>#{toLocalDigits(myRank + 1, lang)}</div>
          <div style={{ marginInlineStart: "auto", fontWeight: 800, color: "var(--brand-blue)" }}>
            {toLocalDigits(rankings[myRank].points, lang)} {t("points")}
          </div>
        </div>
      )}

      {/* Table */}
      {rest.length > 0 && (
        <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
          {rest.map((r, i) => {
            const userBadges = badgesByUser.get(r.id) ?? [];
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderBottom: i < rest.length - 1 ? "1px solid var(--border)" : "none",
                background: r.id === user?.id ? "rgba(24,159,209,.08)" : "transparent",
              }}>
                <div style={{ width: 36, fontWeight: 800, textAlign: "center", color: "var(--muted)" }}>{toLocalDigits(i + 4, lang)}</div>
                <Avatar id={r.id} name={r.full_name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span dir="auto" style={{ overflowWrap: "anywhere" }}>{r.full_name}</span>
                    {r.streak >= 3 && (
                      <span title={`${r.streak} ${t("streakDays")}`} style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "#F0676A", fontSize: 12 }}>
                        <Flame size={12} /> {toLocalDigits(r.streak, lang)}
                      </span>
                    )}
                  </div>
                  {userBadges.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                      {userBadges.slice(0, 5).map((code) => {
                        const b = BADGE_META[code];
                        if (!b) return null;
                        return (
                          <span key={code} title={lang === "ar" ? b.ar : b.en} style={{ fontSize: 14, lineHeight: 1 }}>{b.emoji}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {toLocalDigits(r.points, lang)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
