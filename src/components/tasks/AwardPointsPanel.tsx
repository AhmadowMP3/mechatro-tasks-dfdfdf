import { useEffect, useState } from "react";
import { Star, Divide, RotateCcw, Check } from "lucide-react";
import { supabase } from "@/lib/security/db";
import { useApp, type Profile } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import confetti from "canvas-confetti";

type Award = { user_id: string; points: number; awarded_at: string | null; awarded_amount: number | null };

export function AwardPointsPanel({
  taskId,
  taskPoints,
  assigneeIds,
  onApproved,
}: {
  taskId: string;
  taskPoints: number;
  assigneeIds: string[];
  onApproved: () => void;
}) {
  const { t, lang, users, user } = useApp();
  const [rows, setRows] = useState<Record<string, number>>({});
  const [existing, setExisting] = useState<Award[]>([]);
  const [saving, setSaving] = useState(false);

  const base = Math.max(0, Number(taskPoints) || 0);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taskId, assigneeIds.join(",")]);

  const load = async () => {
    const { data } = await supabase.from("task_point_awards").select("*").eq("task_id", taskId);
    const list = (data ?? []) as Award[];
    setExisting(list);
    const map: Record<string, number> = {};
    for (const id of assigneeIds) {
      const r = list.find((x) => x.user_id === id);
      map[id] = r?.points ?? 0;
    }
    // Default: split equally if no drafts yet and we have a base
    if (list.length === 0 && base > 0 && assigneeIds.length > 0) {
      const each = Math.floor(base / assigneeIds.length);
      const rem = base - each * assigneeIds.length;
      assigneeIds.forEach((id, i) => { map[id] = each + (i < rem ? 1 : 0); });
    }
    setRows(map);
  };

  const setAmount = (uid: string, n: number) => {
    const clamped = Math.max(0, Math.min(1000, Math.round(n || 0)));
    setRows((r) => ({ ...r, [uid]: clamped }));
  };

  const splitEqually = () => {
    if (base <= 0 || assigneeIds.length === 0) return;
    const each = Math.floor(base / assigneeIds.length);
    const rem = base - each * assigneeIds.length;
    const map: Record<string, number> = {};
    assigneeIds.forEach((id, i) => { map[id] = each + (i < rem ? 1 : 0); });
    setRows(map);
  };

  const reset = () => setRows(Object.fromEntries(assigneeIds.map((id) => [id, 0])));

  const total = assigneeIds.reduce((s, id) => s + (rows[id] || 0), 0);
  const anyAwarded = existing.some((r) => r.awarded_at);

  const approve = async () => {
    if (anyAwarded) return;
    if (total <= 0) { toast.error(lang === "ar" ? "أدخل نقاط لعضو واحد على الأقل" : "Enter points for at least one member"); return; }
    setSaving(true);
    try {
      // Upsert one row per assignee
      const payload = assigneeIds.map((uid) => ({
        task_id: taskId,
        user_id: uid,
        points: rows[uid] || 0,
        awarded_by: user?.id ?? null,
      }));
      const { error: upErr } = await supabase.from("task_point_awards").upsert(payload, { onConflict: "task_id,user_id" });
      if (upErr) { toast.error(upErr.message); return; }

      // Move task to done — trigger awards each user
      const { error: tErr } = await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", taskId);
      if (tErr) { toast.error(tErr.message); return; }

      try {
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ["#FFD700", "#42C2EE", "#3ECF8E", "#F0676A"] });
      } catch { /* noop */ }
      toast.success(`⭐ +${total} ${t("points")}`);
      onApproved();
    } finally {
      setSaving(false);
    }
  };

  const usersById = new Map(users.map((u) => [u.id, u] as [string, Profile]));

  return (
    <div className="brand-card" style={{
      padding: 16, marginBottom: 16,
      background: "linear-gradient(135deg, rgba(66,194,238,0.06), rgba(255,215,0,0.05))",
      border: "1px solid rgba(66,194,238,0.35)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Star size={18} color="#F5A623" fill="#F5A623" />
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t("awardPointsTitle")}</div>
        </div>
        {!anyAwarded && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={splitEqually} className="brand-btn-sm" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
              <Divide size={14} /> {t("splitEqually")}
            </button>
            <button type="button" onClick={reset} className="brand-btn-sm" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
              <RotateCcw size={14} /> {t("resetAwards")}
            </button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{t("awardPointsHint")}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {assigneeIds.map((uid) => {
          const u = usersById.get(uid);
          const amt = rows[uid] ?? 0;
          const pct = base > 0 ? Math.round((amt / base) * 100) : 0;
          const existingRow = existing.find((r) => r.user_id === uid);
          const locked = !!existingRow?.awarded_at;
          return (
            <div key={uid} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", background: "var(--surface-1)",
              border: "1px solid var(--border)", borderRadius: 10,
              flexWrap: "wrap",
            }}>
              {u && <Avatar id={u.id} name={u.full_name} size={32} />}
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u?.full_name ?? "—"}</div>
                {locked && (
                  <div style={{ fontSize: 11, color: "#3ECF8E", fontWeight: 700 }}>
                    ✓ {t("awardedLabel")}: {toLocalDigits(existingRow?.awarded_amount ?? 0, lang)} {t("points")}
                  </div>
                )}
              </div>
              {!locked ? (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                    <input
                      type="number" min={0} max={1000} value={amt}
                      onChange={(e) => setAmount(uid, Number(e.target.value))}
                      style={{ width: 84, padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 14, fontWeight: 700, textAlign: "center", outline: "none" }}
                    />
                    <span>{t("points")}</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                    <input
                      type="number" min={0} max={100}
                      value={pct}
                      onChange={(e) => setAmount(uid, ((Number(e.target.value) || 0) / 100) * base)}
                      disabled={base <= 0}
                      style={{ width: 68, padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 14, fontWeight: 700, textAlign: "center", outline: "none", opacity: base <= 0 ? 0.5 : 1 }}
                    />
                    <span>%</span>
                  </label>
                </>
              ) : (
                <div style={{ padding: "6px 12px", borderRadius: 999, background: "linear-gradient(135deg,#F5A623,#F0676A)", color: "#fff", fontWeight: 800, fontSize: 13 }}>
                  <Star size={12} fill="#fff" style={{ display: "inline", marginInlineEnd: 4 }} />
                  {toLocalDigits(existingRow?.awarded_amount ?? 0, lang)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!anyAwarded && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: "var(--muted)", fontWeight: 700 }}>{t("totalAllocated")}</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: base > 0 && total !== base ? "#F5A623" : "#3ECF8E", fontVariantNumeric: "tabular-nums" }}>
              {toLocalDigits(total, lang)}{base > 0 && <span style={{ color: "var(--muted)", fontWeight: 600 }}> / {toLocalDigits(base, lang)}</span>}
            </span>
          </div>
          <button
            type="button"
            onClick={approve}
            disabled={saving || total <= 0}
            className="brand-btn"
            style={{
              width: "100%",
              background: total > 0 ? "var(--grad-green)" : "var(--surface-2)",
              color: total > 0 ? "#fff" : "var(--muted)",
              cursor: saving || total <= 0 ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Check size={18} /> {saving ? "…" : t("approveAndAward")}
          </button>
        </>
      )}
    </div>
  );
}
