import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Play, RotateCcw, AlertTriangle, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { formatDate, toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useServerFn } from "@tanstack/react-start";
import { provisionTestUsers } from "@/lib/provision-test-users.functions";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, user, isAdmin } = useApp();

  if (!isAdmin) {
    return <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("cannotEdit")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title={t("settings")} />

      <section className="brand-card" style={{ padding: 20 }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>{t("companyInfo")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, fontSize: 14 }}>
          <div><b>{t("companyName")}:</b> Mechatro</div>
          <div><b>{t("currentUser")}:</b> {user?.full_name}</div>
        </div>
      </section>

      <BackupsSection />
    </div>
  );
}

type Backup = { name: string; size: number; created_at: string; };

function BackupsSection() {
  const { t, lang } = useApp();
  const isMobile = useIsMobile();
  const [running, setRunning] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const { data } = await supabase.storage.from("backups").list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      return (data ?? []).filter((f) => f.name.endsWith(".json")) as unknown as Backup[];
    },
  });

  const runBackup = async () => {
    setRunning(true);
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { manual: true } });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    refetch();
  };

  const download = async (b: Backup) => {
    const { data, error } = await supabase.storage.from("backups").createSignedUrl(b.name, 300);
    if (error || !data) { toast.error(error?.message ?? "err"); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <section className="brand-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 18 }}>{t("backups")}</h2>
        <button onClick={runBackup} disabled={running} className="brand-btn" style={{ background: "var(--grad-green)", color: "#fff", opacity: running ? 0.6 : 1 }}>
          <Play size={16} /> {t("backupNow")}
        </button>
      </div>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(data ?? []).length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>—</div>
          ) : (data ?? []).map((b) => (
            <div key={b.name} style={{
              padding: 14, borderRadius: 12, border: "1px solid var(--border)",
              background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{formatDate(b.created_at, lang)}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>{b.name}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{toLocalDigits(Math.round(b.size / 1024), lang)} KB</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => download(b)} className="brand-btn-sm" style={{ flex: 1, minHeight: 44, background: "var(--surface-3)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                  <Download size={14} /> {t("download")}
                </button>
                <button onClick={() => setRestoreTarget(b)} className="brand-btn-sm" style={{ flex: 1, minHeight: 44, background: "rgba(232,115,46,.15)", color: "#FF9255", border: "1px solid rgba(232,115,46,.35)" }}>
                  <RotateCcw size={14} /> {t("restore")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: lang === "ar" ? "right" : "left" }}>
              <th style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{t("when")}</th>
              <th style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{t("size")}</th>
              <th style={{ padding: 10, borderBottom: "1px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 ? (
              <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>—</td></tr>
            ) : (data ?? []).map((b) => (
              <tr key={b.name}>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{formatDate(b.created_at, lang)} · <span style={{ color: "var(--muted)" }}>{b.name}</span></td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{toLocalDigits(Math.round(b.size / 1024), lang)} KB</td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", textAlign: lang === "ar" ? "left" : "right" }}>
                  <button onClick={() => download(b)} className="brand-btn-sm" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", marginInlineEnd: 6 }}>
                    <Download size={14} /> {t("download")}
                  </button>
                  <button onClick={() => setRestoreTarget(b)} className="brand-btn-sm" style={{ background: "rgba(232,115,46,.15)", color: "#FF9255", border: "1px solid rgba(232,115,46,.35)" }}>
                    <RotateCcw size={14} /> {t("restore")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {restoreTarget && <RestoreDialog backup={restoreTarget} onClose={() => setRestoreTarget(null)} onDone={() => { setRestoreTarget(null); refetch(); }} />}
    </section>
  );
}

function RestoreDialog({ backup, onClose, onDone }: { backup: Backup; onClose: () => void; onDone: () => void }) {
  const { t } = useApp();
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const confirm = async () => {
    if (text !== "RESTORE") return;
    setRunning(true);
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { restore: true, file: backup.name } });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    onDone();
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 400, display: "flex", justifyContent: "center", alignItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} className="brand-card" style={{ maxWidth: 480, width: "100%", padding: "clamp(16px, 3vw, 24px)", borderColor: "rgba(232,115,46,.5)", maxHeight: "calc(100dvh - 24px)", overflowY: "auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "#FF9255" }}>
          <AlertTriangle size={24} />
          <h2 style={{ margin: 0 }}>{t("restore")}</h2>
        </div>
        <p style={{ color: "var(--foreground)", fontSize: 14 }}>{t("restoreWarn")}</p>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>{backup.name}</p>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="RESTORE"
          style={{ width: "100%", minHeight: 48, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 14, marginTop: 8 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={confirm} disabled={text !== "RESTORE" || running} className="brand-btn"
            style={{ background: "linear-gradient(135deg,#D9484B,#F0676A)", color: "#fff", flex: 1, opacity: text !== "RESTORE" || running ? 0.5 : 1 }}>
            {t("restore")}
          </button>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}
