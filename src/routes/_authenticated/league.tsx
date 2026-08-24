import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Trophy, Flame, Plus, Calendar, Award, Medal } from "lucide-react";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { toLocalDigits, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModalShell, Field, inp } from "@/routes/_authenticated/projects.index";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/league")({ component: LeaguePage });

type Season = {
  id: string; name: string; scope: "global" | "project"; project_id: string | null;
  starts_at: string; ends_at: string; status: "upcoming" | "active" | "ended";
  winner_user_id: string | null;
};
type Score = { season_id: string; user_id: string; points: number; tasks_done: number; last_rank: number | null };

const BADGE_META: Record<string, { emoji: string; ar: string; en: string; color: string }> = {
  first_blood: { emoji: "🎖", ar: "أول مهمة", en: "First Blood", color: "#42C2EE" },
  century: { emoji: "💯", ar: "١٠٠ نقطة", en: "Century", color: "#3ECF8E" },
  half_k: { emoji: "🏅", ar: "٥٠٠ نقطة", en: "Half-K", color: "#F5A623" },
  kilo: { emoji: "👑", ar: "١٠٠٠ نقطة", en: "Kilo", color: "#FFD700" },
  on_fire: { emoji: "🔥", ar: "مشتعل", en: "On Fire", color: "#F0676A" },
  speed_demon: { emoji: "⚡", ar: "سرعة البرق", en: "Speed Demon", color: "#A855F7" },
  team_player: { emoji: "🤝", ar: "لاعب فريق", en: "Team Player", color: "#42C2EE" },
  perfectionist: { emoji: "💎", ar: "متقن", en: "Perfectionist", color: "#3ECF8E" },
  champion: { emoji: "🏆", ar: "بطل الموسم", en: "Champion", color: "#FFD700" },
  runner_up: { emoji: "🥈", ar: "الوصيف", en: "Runner-up", color: "#C0C0C0" },
};

function LeaguePage() {
  const { t, lang, user, users, isAdmin } = useApp();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"current" | "alltime" | "history">("current");
  const [showManage, setShowManage] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const { data: seasons } = useQuery({
    queryKey: ["league-seasons"],
    queryFn: async () => (await supabase.from("league_seasons").select("*").order("starts_at", { ascending: false })).data as Season[] ?? [],
  });

  const activeSeason = seasons?.find((s) => s.status === "active") ?? null;
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const currentSeasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { data: scores } = useQuery({
    enabled: !!currentSeasonId,
    queryKey: ["season-scores", currentSeasonId],
    queryFn: async () => (await supabase.from("season_scores").select("*").eq("season_id", currentSeasonId!)).data as Score[] ?? [],
  });

  const { data: badges } = useQuery({
    queryKey: ["user-badges"],
    queryFn: async () => (await supabase.from("user_badges").select("user_id,code")).data ?? [],
  });

  const { data: profileStats } = useQuery({
    queryKey: ["profile-stats"],
    queryFn: async () => (await supabase.from("profiles").select("id,total_points,current_streak,longest_streak")).data ?? [],
  });

  const rankings = useMemo(() => {
    if (tab === "alltime") {
      return (profileStats ?? [])
        .map((p) => ({ id: p.id, points: p.total_points ?? 0, tasks_done: 0, streak: p.current_streak ?? 0, user: users.find((u) => u.id === p.id) }))
        .filter((r) => r.user && r.points > 0)
        .sort((a, b) => b.points - a.points);
    }
    return (scores ?? [])
      .map((s) => {
        const stats = profileStats?.find((p) => p.id === s.user_id);
        return { id: s.user_id, points: s.points, tasks_done: s.tasks_done, streak: stats?.current_streak ?? 0, user: users.find((u) => u.id === s.user_id) };
      })
      .filter((r) => r.user)
      .sort((a, b) => b.points - a.points || b.tasks_done - a.tasks_done);
  }, [scores, profileStats, users, tab]);

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

  const closeEnded = async () => {
    const { error } = await supabase.rpc("close_ended_seasons" as never);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); qc.invalidateQueries(); }
  };

  const activeSeasons = (seasons ?? []).filter((s) => s.status === "active");
  const endedSeasons = (seasons ?? []).filter((s) => s.status === "ended");

  return (
    <div>
      <PageHeader
        title={t("monthlyLeaderboard")}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isAdmin && (
              <button className="brand-btn" onClick={() => setShowNew(true)}
                style={{ background: "var(--grad-blue)", color: "#fff" }}>
                <Plus size={16} /> {t("newSeason")}
              </button>
            )}
            {isAdmin && (
              <button className="brand-btn" onClick={() => setShowManage(true)}
                style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                {t("manageSeasons")}
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {([["current", t("currentSeason")], ["alltime", t("allTimeLeague")], ["history", t("seasonsHistory")]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "10px 16px", borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer",
            background: tab === k ? "var(--grad-blue)" : "var(--surface-2)",
            color: tab === k ? "#fff" : "var(--foreground)",
            border: `1px solid ${tab === k ? "transparent" : "var(--border)"}`,
          }}>{label}</button>
        ))}
      </div>

      {tab === "current" && activeSeasons.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {activeSeasons.map((s) => (
            <button key={s.id} onClick={() => setSelectedSeasonId(s.id)}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: currentSeasonId === s.id ? "var(--grad-blue)" : "var(--surface-2)",
                color: currentSeasonId === s.id ? "#fff" : "var(--foreground)",
                border: `1px solid ${currentSeasonId === s.id ? "transparent" : "var(--border)"}`,
              }}>{s.name}</button>
          ))}
        </div>
      )}

      {tab === "current" && !activeSeason && (
        <div className="brand-card" style={{ padding: 40, textAlign: "center" }}>
          <Trophy size={48} color="#FFD700" style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{t("noActiveSeason")}</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("createFirstSeason")}</div>
          {isAdmin && (
            <button className="brand-btn" onClick={() => setShowNew(true)}
              style={{ background: "var(--grad-blue)", color: "#fff", marginTop: 16, display: "inline-flex" }}>
              <Plus size={16} /> {t("newSeason")}
            </button>
          )}
        </div>
      )}

      {tab === "history" && (
        <div style={{ display: "grid", gap: 10 }}>
          {endedSeasons.length === 0 && (
            <div className="brand-card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>—</div>
          )}
          {endedSeasons.map((s) => {
            const winner = users.find((u) => u.id === s.winner_user_id);
            return (
              <div key={s.id} className="brand-card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#FFD700,#F5A623)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trophy size={20} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(s.starts_at, lang)} — {formatDate(s.ends_at, lang)}</div>
                </div>
                {winner && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "rgba(255,215,0,.15)", border: "1px solid rgba(255,215,0,.4)" }}>
                    <Avatar id={winner.id} name={winner.full_name} size={28} />
                    <div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>{t("seasonWinner")}</div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{winner.full_name}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(tab === "current" && activeSeason) || tab === "alltime" ? (
        <>
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
                            <Avatar id={r.id} name={r.user!.full_name} size={pos === 0 ? 80 : 60} />
                            <div style={{
                              position: "absolute", top: -6, right: -6, width: 28, height: 28, borderRadius: "50%",
                              background: medals[pos], display: "flex", alignItems: "center", justifyContent: "center",
                              boxShadow: "0 4px 12px rgba(0,0,0,.3)", color: "#fff",
                            }}>{medalIcon}</div>
                          </div>
                          <div dir="auto" style={{
                            fontWeight: 800, marginTop: 10, fontSize: 14, lineHeight: 1.3,
                            width: "100%", overflowWrap: "anywhere",
                          }}>{r.user!.full_name}</div>
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


          {/* Your rank card */}
          {myRank >= 0 && (
            <div className="brand-card" style={{
              padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 12,
              background: "linear-gradient(135deg, rgba(24,159,209,.10), rgba(24,159,209,.02))",
              border: "1px solid rgba(24,159,209,.3)",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: "var(--grad-blue)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18,
              }}>#{toLocalDigits(myRank + 1, lang)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{t("yourRank")}</div>
                <div style={{ fontWeight: 800 }}>
                  {toLocalDigits(rankings[myRank].points, lang)} {t("points")}
                  {rankings[myRank].streak >= 3 && (
                    <span style={{ marginInlineStart: 8, color: "#F0676A" }}>
                      <Flame size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> {toLocalDigits(rankings[myRank].streak, lang)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
            {rest.length === 0 && podium.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>—</div>
            ) : rest.map((r, i) => {
              const idx = i + 3;
              const userBadges = badgesByUser.get(r.id) ?? [];
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  borderBottom: i < rest.length - 1 ? "1px solid var(--border)" : "none",
                  background: r.id === user?.id ? "rgba(24,159,209,.08)" : "transparent",
                }}>
                  <div style={{ width: 36, fontWeight: 800, textAlign: "center", color: "var(--muted)" }}>{toLocalDigits(idx + 1, lang)}</div>
                  <Avatar id={r.id} name={r.user!.full_name} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.user!.full_name}
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
                            <span key={code} title={lang === "ar" ? b.ar : b.en}
                              style={{ fontSize: 14, lineHeight: 1 }}>{b.emoji}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {tab === "current" && (
                    <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", minWidth: 40 }}>
                      {toLocalDigits(r.tasks_done, lang)}<br /><span style={{ fontSize: 10 }}>{t("tasksDone")}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 18, fontWeight: 800, background: "var(--grad-blue)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    {toLocalDigits(r.points, lang)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {isAdmin && showManage && (
        <ManageSeasonsModal seasons={seasons ?? []} onClose={() => setShowManage(false)}
          onCloseEnded={closeEnded} onChanged={() => qc.invalidateQueries()} />
      )}
      {isAdmin && showNew && (
        <NewSeasonModal onClose={() => setShowNew(false)} onCreated={() => { qc.invalidateQueries(); setShowNew(false); }} />
      )}
    </div>
  );
}

// ---------- Modals ----------

function NewSeasonModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t, user } = useApp();
  const { data: projects } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name_ar,name_en").eq("archived", false)).data ?? [],
  });
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [preset, setPreset] = useState<"weekly" | "monthly" | "quarterly" | "custom">("monthly");
  const [form, setForm] = useState(() => {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setMonth(end.getMonth() + 1);
    return { name: "", scope: "global" as "global" | "project", project_id: "", starts_at: iso(start), ends_at: iso(end) };
  });

  const applyPreset = (p: typeof preset) => {
    setPreset(p);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    if (p === "weekly") end.setDate(end.getDate() + 7);
    else if (p === "monthly") end.setMonth(end.getMonth() + 1);
    else if (p === "quarterly") end.setMonth(end.getMonth() + 3);
    else return;
    setForm((f) => ({ ...f, starts_at: iso(start), ends_at: iso(end) }));
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error(t("seasonName")); return; }
    const { error } = await supabase.from("league_seasons").insert({
      name: form.name.trim(),
      scope: form.scope,
      project_id: form.scope === "project" ? form.project_id || null : null,
      starts_at: new Date(form.starts_at + "T00:00:00").toISOString(),
      ends_at: new Date(form.ends_at + "T23:59:59").toISOString(),
      status: "active",
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("created"));
    onCreated();
  };

  return (
    <ModalShell title={t("newSeason")} onClose={onClose}>
      <Field label={t("seasonName")}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="October Sprint..." style={inp} />
      </Field>

      <Field label={t("dateRange")}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {(["weekly", "monthly", "quarterly", "custom"] as const).map((p) => (
            <button key={p} type="button" onClick={() => applyPreset(p)}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: preset === p ? "var(--grad-blue)" : "var(--surface-2)",
                color: preset === p ? "#fff" : "var(--foreground)",
                border: `1px solid ${preset === p ? "transparent" : "var(--border)"}`,
              }}>{t(p)}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input type="date" value={form.starts_at}
            onChange={(e) => { setForm({ ...form, starts_at: e.target.value }); setPreset("custom"); }}
            style={inp} />
          <input type="date" value={form.ends_at}
            onChange={(e) => { setForm({ ...form, ends_at: e.target.value }); setPreset("custom"); }}
            style={inp} />
        </div>
      </Field>

      <Field label={t("scope")}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["global", "project"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setForm({ ...form, scope: s })}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
                background: form.scope === s ? "var(--grad-blue)" : "var(--surface-2)",
                color: form.scope === s ? "#fff" : "var(--foreground)",
                border: `1px solid ${form.scope === s ? "transparent" : "var(--border)"}`,
              }}>{s === "global" ? t("globalScope") : t("projectScope")}</button>
          ))}
        </div>
      </Field>

      {form.scope === "project" && (
        <Field label={t("filterProject")}>
          <ThemedSelect
            value={form.project_id}
            onChange={(v) => setForm({ ...form, project_id: v })}
            placeholder="—"
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name_en }))}
          />
        </Field>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={submit} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1 }}>{t("create")}</button>
        <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
      </div>
    </ModalShell>
  );
}

function ManageSeasonsModal({ seasons, onClose, onCloseEnded, onChanged }: { seasons: Season[]; onClose: () => void; onCloseEnded: () => void; onChanged: () => void }) {
  const { t, lang } = useApp();
  const confirm = useConfirm();
  const del = async (id: string) => {
    if (!(await confirm({ message: t("confirmDeleteSeason"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("league_seasons").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); onChanged(); }
  };
  return (
    <ModalShell title={t("manageSeasons")} onClose={onClose}>
      <button onClick={onCloseEnded} className="brand-btn"
        style={{ background: "var(--grad-orange)", color: "#fff", marginBottom: 12, width: "100%" }}>
        <Calendar size={16} /> {t("closeEndedSeasons")}
      </button>
      <div style={{ display: "grid", gap: 8 }}>
        {seasons.length === 0 && <div style={{ color: "var(--muted)", textAlign: "center", padding: 20 }}>—</div>}
        {seasons.map((s) => (
          <div key={s.id} className="brand-card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {formatDate(s.starts_at, lang)} — {formatDate(s.ends_at, lang)} · {s.scope}
              </div>
            </div>
            <span style={{
              padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
              background: s.status === "active" ? "rgba(62,207,142,.15)" : s.status === "ended" ? "rgba(240,103,106,.15)" : "rgba(66,194,238,.15)",
              color: s.status === "active" ? "#3ECF8E" : s.status === "ended" ? "#F0676A" : "#42C2EE",
            }}>{s.status === "active" ? t("seasonActive") : s.status === "ended" ? t("seasonEnded") : s.status}</span>
            <button onClick={() => del(s.id)}
              style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "#F0676A", fontSize: 12, cursor: "pointer" }}>×</button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
