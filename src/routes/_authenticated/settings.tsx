import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, RotateCcw, AlertTriangle, UserPlus, Trash2, Upload, CloudUpload, CloudOff, Cloud, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { formatDate, toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useServerFn } from "@tanstack/react-start";
import { provisionTestUsers } from "@/lib/provision-test-users.functions";
import { startDriveOAuth } from "@/lib/drive-oauth.functions";
import { useConfirm } from "@/components/confirm-dialog";
import { DriveSetupGuide } from "@/components/settings/DriveSetupGuide";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, user, isAdmin, isMasterAdmin } = useApp();

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

      {isMasterAdmin && <SeedTestUsersSection />}
      {isMasterAdmin && <DriveConnectSection />}
      <BackupsSection />

    </div>
  );
}

function SeedTestUsersSection() {
  const provision = useServerFn(provisionTestUsers);
  const [running, setRunning] = useState(false);
  const [creds, setCreds] = useState<null | Array<{ email: string; password: string; role: string }>>(null);

  const run = async () => {
    setRunning(true);
    try {
      const res = await provision();
      setCreds(res.results.map((r) => ({ email: r.email, password: r.password, role: r.role })));
      toast.success("Test users ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="brand-card" style={{ padding: 20 }}>
      <h2 style={{ margin: 0, marginBottom: 8, fontSize: 18 }}>Test users</h2>
      <p style={{ margin: 0, marginBottom: 12, color: "var(--muted)", fontSize: 13 }}>
        Create/reset two test accounts: one admin, one member. Passwords are reset each run.
      </p>
      <button onClick={run} disabled={running} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
        <UserPlus size={18} /> {running ? "Working…" : "Seed test users"}
      </button>
      {creds && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {creds.map((c) => (
            <div key={c.email} style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, fontFamily: "monospace", fontSize: 13 }}>
              <div><b>{c.role.toUpperCase()}</b></div>
              <div>Email: {c.email}</div>
              <div>Password: {c.password}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type Backup = { name: string; size: number; created_at: string; };

type DriveRow = { file: string; drive_link: string | null; synced_at: string | null; error: string | null };


type BackupRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "completed" | "failed" | "expired";
  requested_by: string | null;
  requested_at: string;
};

function BackupsSection() {
  const { t, lang, isMasterAdmin, user } = useApp();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const [running, setRunning] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [externalRestore, setExternalRestore] = useState<{ name: string; payload: Record<string, unknown[]> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["backups"],
    enabled: !!isMasterAdmin,
    queryFn: async () => {
      const { data } = await supabase.storage.from("backups").list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      return (data ?? []).filter((f) => f.name.endsWith(".json") || f.name.endsWith(".zip")) as unknown as Backup[];
    },
  });

  const { data: pending, refetch: refetchPending } = useQuery({
    queryKey: ["backup_requests", "pending"],
    enabled: !!isMasterAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (t: string) => any)("backup_requests")
        .select("id, status, requested_by, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BackupRequest[];
    },
  });

  const { data: myPending, refetch: refetchMyPending } = useQuery({
    queryKey: ["backup_requests", "mine", user?.id],
    enabled: !isMasterAdmin && !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (t: string) => any)("backup_requests")
        .select("id, status, requested_at")
        .eq("requested_by", user!.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data ?? []) as BackupRequest[];
    },
  });

  // Google Drive sync state
  const { data: driveStatus } = useQuery({
    queryKey: ["backup_drive_status"],
    enabled: !!isMasterAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("backup-snapshot", { body: { drive_status: true } });
      if (error) throw error;
      return data as { configured: boolean; error?: string; files?: Array<{ id: string; name: string }> };
    },
  });

  const { data: driveRows, refetch: refetchDrive } = useQuery({
    queryKey: ["backup_drive_files"],
    enabled: !!isMasterAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (t: string) => any)("backup_drive_files")
        .select("file, drive_link, synced_at, error");
      if (error) throw error;
      return (data ?? []) as DriveRow[];
    },
  });

  const driveByFile = new Map((driveRows ?? []).map((r) => [r.file, r]));

  const syncToDrive = async (b: Backup) => {
    setActingId(b.name);
    const { data, error } = await supabase.functions.invoke("backup-snapshot", { body: { sync_to_drive: true, file: b.name } });
    setActingId(null);
    const resp = data as { ok?: boolean; error?: string } | null;
    if (error || resp?.error) { toast.error(resp?.error ?? error?.message ?? "err"); return; }
    toast.success(t("driveSyncDone"));
    refetchDrive();
  };



  const runBackup = async () => {
    setRunning(true);
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { manual: true } });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    refetch();
  };

  const approveRequest = async (r: BackupRequest) => {
    setActingId(r.id);
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { approve_request_id: r.id } });
    setActingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("backupApproved"));
    refetch(); refetchPending();
  };

  const rejectRequest = async (r: BackupRequest) => {
    setActingId(r.id);
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { reject_request_id: r.id } });
    setActingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("backupRejected"));
    refetchPending();
  };

  const download = async (b: Backup) => {
    const { data, error } = await supabase.storage.from("backups").download(b.name);
    if (error || !data) { toast.error(error?.message ?? "err"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = b.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const deleteBackup = async (b: Backup) => {
    if (!(await confirm({ message: t("confirmDeleteBackup"), danger: true, confirmText: t("delete") }))) return;
    setActingId(b.name);
    const { data: resp, error } = await supabase.functions.invoke("backup-snapshot", { body: { delete: true, file: b.name } });
    setActingId(null);
    if (error || (resp && (resp as { error?: string }).error)) {
      const code = (resp as { error?: string } | null)?.error;
      if (code === "cannot_delete_latest") { toast.error(t("cannotDeleteLatest")); return; }
      toast.error(error?.message ?? code ?? "err");
      return;
    }
    toast.success(t("backupDeleted"));
    refetch();
  };

  const latestBackupName = data?.[0]?.name;



  const requestBackup = async () => {
    if (!user?.id) return;
    setRunning(true);
    const { error } = await supabase.from("backup_requests").insert({
      status: "pending",
      requested_by: user.id,
    } as never);
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("backupRequestSent"));
    refetchMyPending();
  };

  const hasMyPending = (myPending ?? []).length > 0;

  const KNOWN_BACKUP_TABLES = new Set([
    "app_config", "profiles", "projects", "references", "league_seasons",
    "invites", "share_links", "tasks", "task_files", "task_comments",
    "work_sessions", "season_scores", "user_badges", "member_reports",
    "activity_log", "notifications",
  ]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        toast.error(t("invalidBackupFile"));
        return;
      }
      const keys = Object.keys(parsed);
      if (keys.length === 0 || keys.some((k) => !KNOWN_BACKUP_TABLES.has(k))) {
        toast.error(t("invalidBackupFile"));
        return;
      }
      for (const k of keys) {
        if (!Array.isArray((parsed as Record<string, unknown>)[k])) {
          toast.error(t("invalidBackupFile"));
          return;
        }
      }
      setExternalRestore({ name: file.name, payload: parsed as Record<string, unknown[]> });
    } catch {
      toast.error(t("invalidBackupFile"));
    }
  };

  return (
    <section className="brand-card" style={{ padding: 20 }}>
      <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onFileChosen} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 18 }}>{t("backups")}</h2>
        {isMasterAdmin ? (
          <>
            <button onClick={runBackup} disabled={running} className="brand-btn" style={{ background: "var(--grad-green)", color: "#fff", opacity: running ? 0.6 : 1 }}>
              <Play size={16} /> {t("backupNow")}
            </button>
            <button onClick={onPickFile} className="brand-btn" style={{ background: "rgba(232,115,46,.15)", color: "#FF9255", border: "1px solid rgba(232,115,46,.35)" }}>
              <Upload size={16} /> {t("restoreFromFile")}
            </button>
          </>
        ) : (
          <button onClick={requestBackup} disabled={running || hasMyPending} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: (running || hasMyPending) ? 0.6 : 1 }}>
            <Play size={16} /> {t("requestBackup")}
          </button>
        )}
      </div>


      {isMasterAdmin && (() => {
        const last = data?.[0];
        const lastDrive = last ? driveByFile.get(last.name) : undefined;
        const ok = !!last && !lastDrive?.error;
        const color = !last ? "#E7B03A" : ok ? "#5BD6A6" : "#F0676A";
        return (
          <div style={{
            marginBottom: 12, padding: "12px 14px", borderRadius: 12,
            display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13,
            border: `1px solid ${color}59`, background: `${color}14`,
          }}>
            {ok ? <CheckCircle2 size={17} color={color} /> : <AlertTriangle size={17} color={color} />}
            <b style={{ color }}>{t("lastBackup")}</b>
            <span style={{ color: "var(--muted)" }}>
              {last ? formatDate(last.created_at, lang) : t("noBackupsYet")}
            </span>
            {last && (
              <span style={{ color: "var(--muted)" }}>
                · {toLocalDigits((last.size / 1024).toFixed(1), lang)} KB
              </span>
            )}
            {last && (
              <span style={{
                marginInlineStart: "auto", fontSize: 12, padding: "3px 10px", borderRadius: 999,
                color, background: `${color}1f`, border: `1px solid ${color}59`,
              }}>
                {lastDrive?.error
                  ? t("driveSyncFailed")
                  : lastDrive?.synced_at
                    ? t("driveSyncedOk")
                    : t("backupStored")}
              </span>
            )}
          </div>
        );
      })()}

      {isMasterAdmin && (
        <div style={{
          marginBottom: 12, padding: "10px 12px", borderRadius: 10,
          border: "1px solid var(--border)", background: "var(--surface-2)",
          display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12, color: "var(--muted)",
        }}>
          <span>🗓 {t("nextScheduledBackup")}: {(() => {
            const latest = data?.[0]?.created_at ? new Date(data[0].created_at) : null;
            const next = latest ? new Date(latest.getTime() + 10 * 24 * 60 * 60 * 1000) : null;
            return next ? formatDate(next.toISOString(), lang) : "—";
          })()}</span>
          <span>· 📦 {t("retentionPolicy")}</span>
          <span>· 📎 {t("includesAllFiles")}</span>
          <span style={{ width: "100%", height: 0 }} />
          <span style={{ color: driveStatus?.configured ? "#5BD6A6" : "#E7B03A" }}>
            ☁️ {t("driveSync")}: {driveStatus?.configured
              ? (driveStatus.error ? driveStatus.error : t("driveAutoNote"))
              : t("driveNotConfigured")}
          </span>
        </div>

      )}

      {!isMasterAdmin && (
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, color: "var(--muted)" }}>
          {hasMyPending ? t("backupRequestPending") : t("backupsMasterOnlyNote")}
        </div>
      )}


      {isMasterAdmin && (
        <div style={{
          marginBottom: 16, padding: 14, borderRadius: 12,
          border: "1px solid rgba(231,176,58,.45)",
          background: "rgba(231,176,58,.08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontWeight: 700, fontSize: 14 }}>
            <AlertTriangle size={16} color="#E7B03A" />
            {t("pendingBackupRequests")}
          </div>
          {(pending ?? []).length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("noPendingBackups")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pending!.map((r) => (
                <div key={r.id} style={{
                  padding: 12, borderRadius: 10,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {r.requested_by ? t("byUser") : t("bySystem")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {t("backupRequestedAt")}: {formatDate(r.requested_at, lang)}
                    </div>
                    {(() => {
                      const runsAt = new Date(r.requested_at).getTime() + 24 * 60 * 60 * 1000;
                      const hoursLeft = Math.max(0, Math.round((runsAt - Date.now()) / (60 * 60 * 1000)));
                      return (
                        <div style={{ fontSize: 11, color: "#E7B03A", marginTop: 4 }}>
                          ⏳ {hoursLeft > 0 ? `${t("autoApprovesIn")} ~${hoursLeft} ${t("hours")}` : t("autoApprovesSoon")}
                        </div>
                      );
                    })()}
                  </div>
                  <button
                    onClick={() => approveRequest(r)}
                    disabled={actingId === r.id}
                    className="brand-btn-sm"
                    style={{ background: "var(--grad-green)", color: "#fff", opacity: actingId === r.id ? 0.6 : 1 }}
                  >
                    <Play size={14} /> {t("approveAndRun")}
                  </button>
                  <button
                    onClick={() => rejectRequest(r)}
                    disabled={actingId === r.id}
                    className="brand-btn-sm"
                    style={{ background: "var(--surface-3)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                  >
                    {t("rejectRequest")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isMasterAdmin && (isMobile ? (
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
                <DriveBadge row={driveByFile.get(b.name)} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => download(b)} className="brand-btn-sm" style={{ flex: 1, minHeight: 44, background: "var(--surface-3)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                  <Download size={14} /> {t("download")}
                </button>
                <button onClick={() => setRestoreTarget(b)} className="brand-btn-sm" style={{ flex: 1, minHeight: 44, background: "rgba(232,115,46,.15)", color: "#FF9255", border: "1px solid rgba(232,115,46,.35)" }}>
                  <RotateCcw size={14} /> {t("restore")}
                </button>
                <button onClick={() => deleteBackup(b)} disabled={actingId === b.name || b.name === latestBackupName} title={b.name === latestBackupName ? t("latestBackupProtected") : undefined} className="brand-btn-sm" style={{ flex: 1, minHeight: 44, background: "rgba(217,72,75,.15)", color: "#F0676A", border: "1px solid rgba(217,72,75,.4)", opacity: (actingId === b.name || b.name === latestBackupName) ? 0.5 : 1, cursor: b.name === latestBackupName ? "not-allowed" : undefined }}>
                  <Trash2 size={14} /> {t("delete")}
                </button>
                {driveStatus?.configured && (
                  <button onClick={() => syncToDrive(b)} disabled={actingId === b.name} className="brand-btn-sm" style={{ flex: 1, minHeight: 44, background: "rgba(66,194,238,.15)", color: "#42C2EE", border: "1px solid rgba(66,194,238,.35)", opacity: actingId === b.name ? 0.5 : 1 }}>
                    <CloudUpload size={14} /> {t("driveSyncNow")}
                  </button>
                )}
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
              <th style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{t("driveSync")}</th>
              <th style={{ padding: 10, borderBottom: "1px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>—</td></tr>
            ) : (data ?? []).map((b) => (
              <tr key={b.name}>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{formatDate(b.created_at, lang)} · <span style={{ color: "var(--muted)" }}>{b.name}</span></td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{toLocalDigits(Math.round(b.size / 1024), lang)} KB</td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}><DriveBadge row={driveByFile.get(b.name)} /></td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", textAlign: lang === "ar" ? "left" : "right" }}>
                  <button onClick={() => download(b)} className="brand-btn-sm" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", marginInlineEnd: 6 }}>
                    <Download size={14} /> {t("download")}
                  </button>
                  {driveStatus?.configured && (
                    <button onClick={() => syncToDrive(b)} disabled={actingId === b.name} className="brand-btn-sm" style={{ background: "rgba(66,194,238,.15)", color: "#42C2EE", border: "1px solid rgba(66,194,238,.35)", marginInlineEnd: 6, opacity: actingId === b.name ? 0.5 : 1 }}>
                      <CloudUpload size={14} /> {t("driveSyncNow")}
                    </button>
                  )}
                  <button onClick={() => setRestoreTarget(b)} className="brand-btn-sm" style={{ background: "rgba(232,115,46,.15)", color: "#FF9255", border: "1px solid rgba(232,115,46,.35)", marginInlineEnd: 6 }}>
                    <RotateCcw size={14} /> {t("restore")}
                  </button>
                  <button onClick={() => deleteBackup(b)} disabled={actingId === b.name || b.name === latestBackupName} title={b.name === latestBackupName ? t("latestBackupProtected") : undefined} className="brand-btn-sm" style={{ background: "rgba(217,72,75,.15)", color: "#F0676A", border: "1px solid rgba(217,72,75,.4)", opacity: (actingId === b.name || b.name === latestBackupName) ? 0.5 : 1, cursor: b.name === latestBackupName ? "not-allowed" : undefined }}>
                    <Trash2 size={14} /> {t("delete")}
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ))}
      {restoreTarget && <RestoreDialog source={{ kind: "cloud", name: restoreTarget.name }} onClose={() => setRestoreTarget(null)} onDone={() => { setRestoreTarget(null); refetch(); }} />}
      {externalRestore && <RestoreDialog source={{ kind: "external", name: externalRestore.name, payload: externalRestore.payload }} onClose={() => setExternalRestore(null)} onDone={() => { setExternalRestore(null); refetch(); }} />}
    </section>
  );
}

type RestoreSource =
  | { kind: "cloud"; name: string }
  | { kind: "external"; name: string; payload: Record<string, unknown[]> };

function RestoreDialog({ source, onClose, onDone }: { source: RestoreSource; onClose: () => void; onDone: () => void }) {
  const { t } = useApp();
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const confirm = async () => {
    if (text !== "RESTORE") return;
    setRunning(true);
    const body = source.kind === "cloud"
      ? { restore: true, file: source.name }
      : { restore_inline: true, payload: source.payload };
    const { data, error } = await supabase.functions.invoke("backup-snapshot", { body });
    setRunning(false);
    const resp = data as { ok?: boolean; error?: string; counts?: Record<string, number>; files?: { restored: number; skipped: number; mirrored: boolean } } | null;
    if (error || resp?.error) { toast.error(resp?.error ?? error?.message ?? "err"); return; }
    const counts = resp?.counts ?? {};
    const tables = Object.keys(counts).filter((k) => (counts[k] ?? 0) > 0).length;
    const rows = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
    let msg = t("restoreDone").replace("{rows}", String(rows)).replace("{tables}", String(tables));
    if (resp?.files?.mirrored) {
      msg += " " + t("restoreFilesRestored").replace("{n}", String(resp.files.restored));
    } else if (source.kind === "cloud") {
      msg += " " + t("restoreFilesNone");
    }
    toast.success(msg);
    onDone();
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 400, display: "flex", justifyContent: "center", alignItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} className="brand-card" style={{ maxWidth: 480, width: "100%", padding: "clamp(16px, 3vw, 24px)", borderColor: "rgba(232,115,46,.5)", maxHeight: "calc(100dvh - 24px)", overflowY: "auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "#FF9255" }}>
          <AlertTriangle size={24} />
          <h2 style={{ margin: 0 }}>{source.kind === "external" ? t("restoreFromFile") : t("restore")}</h2>
        </div>
        <p style={{ color: "var(--foreground)", fontSize: 14 }}>{t("restoreWarn")}</p>
        <p style={{ color: "var(--muted)", fontSize: 12, wordBreak: "break-all" }}>{source.name}</p>
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

function DriveBadge({ row }: { row?: DriveRow }) {
  const { t, lang } = useApp();
  if (!row || (!row.synced_at && !row.error)) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
        <CloudOff size={14} /> {t("driveNotSynced")}
      </span>
    );
  }
  if (row.error) {
    return (
      <span title={row.error} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#F0676A" }}>
        <CloudOff size={14} /> {row.error.slice(0, 40)}
      </span>
    );
  }
  const label = `${t("driveSynced")} · ${formatDate(row.synced_at!, lang)}`;
  return row.drive_link ? (
    <a href={row.drive_link} target="_blank" rel="noreferrer" title={t("driveOpen")}
       style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5BD6A6", textDecoration: "none" }}>
      <Cloud size={14} /> {label}
    </a>
  ) : (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5BD6A6" }}>
      <Cloud size={14} /> {label}
    </span>
  );
}

type DriveTarget = {
  id: string;
  folder_id: string;
  folder_name: string | null;
  enabled: boolean;
  keep: number;
  last_error: string | null;
  last_synced_at: string | null;
};

type DriveStatus = {
  linked?: boolean;
  configured: boolean;
  auth_mode?: "oauth" | "service_account";
  oauth_available?: boolean;
  error?: string | null;
  client_email?: string | null;
  account_email?: string | null;
  folder_id?: string | null;
  folder_name?: string | null;
  connected_at?: string | null;
  targets?: DriveTarget[];
  files?: Array<{ id: string; name: string }>;
};

type TestResult = {
  folder_id: string;
  folder_name: string | null;
  ok: boolean;
  link?: string;
  verified_bytes?: number;
  error?: string;
};

type BackupErrorRow = {
  id: string;
  kind: string;
  message: string;
  file: string | null;
  folder_id: string | null;
  created_at: string;
};

function BackupErrorsPanel() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["backup_error_log"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (tbl: string) => any)("backup_error_log")
        .select("id, kind, message, file, folder_id, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as BackupErrorRow[];
    },
  });

  const list = rows ?? [];

  const clearAll = async () => {
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { errors_clear: true } });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["backup_error_log"] });
  };

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setOpen((v) => !v)} className="brand-btn"
          style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)", fontSize: 13 }}>
          <AlertTriangle size={15} color={list.length ? "#F0676A" : "var(--muted)"} />
          {t("backupErrors")} ({toLocalDigits(String(list.length), lang)})
        </button>
        {open && list.length > 0 && (
          <button onClick={clearAll} className="brand-btn"
            style={{ background: "rgba(240,103,106,.12)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", fontSize: 12 }}>
            <Trash2 size={14} /> {t("clearLog")}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 300, overflowY: "auto" }}>
          {list.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("noBackupErrors")}</div>
          )}
          {list.map((r) => (
            <div key={r.id} style={{
              padding: "9px 12px", borderRadius: 10, fontSize: 12,
              border: "1px solid rgba(240,103,106,.3)", background: "rgba(240,103,106,.07)",
            }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--muted)", marginBottom: 4 }}>
                <b style={{ color: "#F0676A", textTransform: "uppercase" }}>{r.kind}</b>
                <span>{formatDate(r.created_at, lang)}</span>
                {r.file && <span>· {r.file}</span>}
              </div>
              <div style={{ wordBreak: "break-word", color: "var(--fg)" }}>{r.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


const DRIVE_ERR_KEYS: Record<string, string> = {
  invalid_sa_json: "driveErrInvalidJson",
  bad_folder_id: "driveErrBadFolder",
  folder_not_shared: "driveErrNotShared",
  drive_api_disabled: "driveErrApiDisabled",
  invalid_credentials: "driveErrCredentials",
  drive_connect_failed: "driveErrGeneric",
};

type DriveFn = Record<string, unknown>;

async function driveCall<T = Record<string, unknown>>(body: DriveFn): Promise<{ data: T | null; code?: string; detail?: string }> {
  const { data, error } = await supabase.functions.invoke("backup-snapshot", { body });
  const resp = (data ?? null) as (T & { error?: string; detail?: string }) | null;
  if (resp?.error) return { data: null, code: resp.error, detail: resp.detail };
  if (error) return { data: null, code: "drive_connect_failed", detail: error.message };
  return { data: resp as T };
}

function DriveConnectSection() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const startOAuth = useServerFn(startDriveOAuth);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);

  const { data: status } = useQuery({
    queryKey: ["backup_drive_status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("backup-snapshot", { body: { drive_status: true } });
      if (error) throw error;
      return data as DriveStatus;
    },
  });

  const linked = !!status?.linked;
  const connected = !!status?.configured;
  const targets = status?.targets ?? [];
  const oauthReady = status ? !!status.oauth_available : undefined;

  // Folder picker list (only once an account is linked).
  const { data: folders, refetch: refetchFolders, isFetching: loadingFolders } = useQuery({
    queryKey: ["backup_drive_folders", search],
    enabled: linked,
    queryFn: async () => {
      const { data, code, detail } = await driveCall<{ folders: Array<{ id: string; name: string }> }>({
        drive_folders: true, search: search.trim() || undefined,
      });
      if (!data) throw new Error(detail ?? code ?? "failed");
      return data.folders ?? [];
    },
  });

  // Toast the result of the OAuth round-trip.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const res = params.get("drive");
    if (!res) return;
    if (res === "connected") toast.success(t("driveOauthConnected"));
    else toast.error(t("driveErrGeneric"), { description: params.get("detail") ?? undefined });
    window.history.replaceState({}, "", window.location.pathname);
    qc.invalidateQueries({ queryKey: ["backup_drive_status"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["backup_drive_status"] });
    qc.invalidateQueries({ queryKey: ["backup_drive_folders"] });
    qc.invalidateQueries({ queryKey: ["backup_drive_files"] });
  };

  const showErr = (code?: string, detail?: string) =>
    toast.error(t((DRIVE_ERR_KEYS[code ?? ""] ?? "driveErrGeneric") as Parameters<typeof t>[0]), {
      description: detail?.slice(0, 180),
    });

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const { url } = await startOAuth({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/oauth_not_configured/.test(msg) ? t("driveOauthUnavailable") : t("driveErrGeneric"), {
        description: msg.slice(0, 180),
      });
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResults(null);
    const { data, error } = await supabase.functions.invoke("backup-snapshot", { body: { drive_test: true } });
    setTesting(false);
    const resp = data as { ok?: boolean; results?: TestResult[]; error?: string; detail?: string } | null;
    if (error && !resp?.results) { toast.error(error.message); return; }
    if (resp?.error) { showErr(resp.error, resp.detail); return; }
    setTestResults(resp?.results ?? []);
    if (resp?.ok) toast.success(t("driveTestOk"));
    else toast.error(t("driveTestFailed"));
    qc.invalidateQueries({ queryKey: ["backup_error_log"] });
    refresh();
  };

  const addTarget = async (folderRef: string) => {
    if (!folderRef.trim()) { toast.error(t("driveErrBadFolder")); return; }
    setBusy(true);
    const { data, code, detail } = await driveCall({ drive_target_add: true, folder: folderRef.trim() });
    setBusy(false);
    if (!data) { showErr(code, detail); return; }
    toast.success(t("driveFolderAdded"));
    setFolder("");
    refresh();
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    const { data, code, detail } = await driveCall<{ folder: { id: string; name: string } }>({
      drive_create_folder: true, name,
    });
    if (!data) { setBusy(false); showErr(code, detail); return; }
    setNewFolderName("");
    setBusy(false);
    await addTarget(data.folder.id);
  };

  const toggleTarget = async (target: DriveTarget) => {
    const { data, code, detail } = await driveCall({
      drive_target_toggle: true, target_id: target.id, enabled: !target.enabled,
    });
    if (!data) { showErr(code, detail); return; }
    refresh();
  };

  const removeTarget = async (target: DriveTarget) => {
    const ok = await confirm({
      title: t("driveRemove"),
      message: target.folder_name ?? target.folder_id,
      confirmText: t("driveRemove"),
      danger: true,
    });
    if (!ok) return;
    const { data, code, detail } = await driveCall({ drive_target_remove: true, target_id: target.id });
    if (!data) { showErr(code, detail); return; }
    refresh();
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: t("driveDisconnect"), message: t("driveConnectTitle"),
      confirmText: t("driveDisconnect"), danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("backup-snapshot", { body: { drive_disconnect: true } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("driveDisconnected"));
    refresh();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13,
    border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg)",
  };

  const statusColor = connected ? "#5BD6A6" : linked ? "#E7B03A" : "#E7B03A";
  const statusLabel = connected ? t("driveConnected") : linked ? t("driveLinkedNoFolder") : t("driveNotConfigured");

  return (
    <section className="brand-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <Cloud size={18} color={connected ? "#5BD6A6" : "var(--muted)"} />
        <h2 style={{ margin: 0, flex: 1, fontSize: 18 }}>{t("driveConnectTitle")}</h2>
        <span style={{
          fontSize: 12, padding: "4px 10px", borderRadius: 999, color: statusColor,
          background: `${statusColor}1f`, border: `1px solid ${statusColor}59`,
        }}>
          {statusLabel}
        </span>
      </div>

      {!linked && (
        <>
          <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>{t("driveSignInHint")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={signInWithGoogle} disabled={busy || oauthReady === false} className="brand-btn"
              title={oauthReady === false ? t("driveOauthSetupNeeded") : undefined}
              style={{ background: "var(--grad-blue)", color: "#fff", opacity: busy || oauthReady === false ? 0.5 : 1, cursor: oauthReady === false ? "not-allowed" : "pointer" }}>
              <Cloud size={16} /> {busy ? t("driveConnecting") : t("driveSignIn")}
            </button>
          </div>
          {oauthReady === false && (
            <p style={{
              margin: "10px 0 0", fontSize: 12.5, color: "#E7B03A",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <AlertTriangle size={14} /> {t("driveOauthSetupNeeded")}
            </p>
          )}
        </>
      )}


      {linked && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10,
          padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)",
          fontSize: 13, marginBottom: 14,
        }}>
          <div style={{ wordBreak: "break-all" }}>
            <b>{t("driveAccount")}:</b> {status?.account_email ?? "—"}
          </div>
          <div><b>{t("driveFilesCount")}:</b> {toLocalDigits(String(status?.files?.length ?? 0), lang)}</div>
          {status?.connected_at && <div><b>{t("driveConnected")}:</b> {formatDate(status.connected_at, lang)}</div>}
          {status?.error && <div style={{ color: "#F0676A", gridColumn: "1 / -1" }}>{status.error}</div>}
        </div>
      )}

      {linked && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{t("driveTargets")}</h3>
          {targets.length === 0 && (
            <p style={{ margin: "0 0 10px", color: "#E7B03A", fontSize: 13 }}>{t("driveTargetsEmpty")}</p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {targets.map((tg) => (
              <div key={tg.id} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--border)", background: "var(--surface-2)",
              }}>
                <Cloud size={15} color={tg.enabled ? "#5BD6A6" : "var(--muted)"} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{tg.folder_name ?? tg.folder_id}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {t("driveKeep")}: {toLocalDigits(String(tg.keep), lang)}
                    {tg.last_synced_at ? ` · ${t("driveSynced")} ${formatDate(tg.last_synced_at, lang)}` : ""}
                  </div>
                  {tg.last_error && <div style={{ fontSize: 11, color: "#F0676A" }}>{tg.last_error}</div>}
                </div>
                <button onClick={() => toggleTarget(tg)} className="brand-btn"
                  style={{ fontSize: 12, padding: "6px 10px", background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--border)" }}>
                  {tg.enabled ? t("driveEnabled") : t("driveDisabled")}
                </button>
                <button onClick={() => removeTarget(tg)} className="brand-btn"
                  style={{ fontSize: 12, padding: "6px 10px", background: "rgba(240,103,106,.12)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={() => setPickerOpen(true)} disabled={busy} className="brand-btn"
              style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)" }}>
              <Cloud size={15} /> {t("drivePickFolder")}
            </button>
            <button onClick={() => setLinkOpen(true)} disabled={busy} className="brand-btn"
              style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)" }}>
              <CloudUpload size={15} /> {t("driveAddByLink")}
            </button>
            <button onClick={() => setCreateOpen(true)} disabled={busy} className="brand-btn"
              style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)" }}>
              <FolderPlus size={15} /> {t("driveNewFolder")}
            </button>
          </div>

          {pickerOpen && (
            <ResponsiveModal title={t("drivePickFolder")} onClose={() => setPickerOpen(false)}>
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("driveSearchFolders")} style={inputStyle} />
                <button onClick={() => refetchFolders()} className="brand-btn" title={t("driveRefreshFolders")}
                  style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)" }}>
                  <RotateCcw size={15} />
                </button>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 10, display: "grid", gap: 6 }}>
                {loadingFolders && <span style={{ fontSize: 12, color: "var(--muted)" }}>…</span>}
                {!loadingFolders && (availableFolders.length === 0) && (
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{t("driveNoFolders")}</span>
                )}
                {availableFolders.map((f) => (
                  <button key={f.id} onClick={() => addTarget(f.id, () => setPickerOpen(false))} disabled={busy}
                    style={{
                      textAlign: "start", padding: "10px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                      border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg)",
                    }}>
                    {f.name}
                  </button>
                ))}
              </div>
            </ResponsiveModal>
          )}

          {linkOpen && (
            <ResponsiveModal title={t("driveAddByLink")} onClose={() => setLinkOpen(false)}>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{t("driveFolderLabel")}</label>
              <input autoFocus value={folder} onChange={(e) => setFolder(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..." style={inputStyle} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => addTarget(folder, () => setLinkOpen(false))} disabled={busy || !folder.trim()} className="brand-btn"
                  style={{ background: "var(--grad-blue)", color: "#fff", opacity: busy || !folder.trim() ? 0.6 : 1 }}>
                  <CloudUpload size={15} /> {t("driveAddAction")}
                </button>
              </div>
            </ResponsiveModal>
          )}

          {createOpen && (
            <ResponsiveModal title={t("driveNewFolder")} onClose={() => setCreateOpen(false)}>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{t("driveNewFolderName")}</label>
              <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t("driveNewFolder")} style={inputStyle} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => createFolder(() => setCreateOpen(false))} disabled={busy || !newFolderName.trim()} className="brand-btn"
                  style={{ background: "var(--grad-blue)", color: "#fff", opacity: busy || !newFolderName.trim() ? 0.6 : 1 }}>
                  <FolderPlus size={15} /> {t("driveCreateFolder")}
                </button>
              </div>
            </ResponsiveModal>
          )}
        </div>
      )}

      {linked && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={runTest} disabled={busy || testing || targets.length === 0} className="brand-btn"
            style={{
              background: "var(--grad-green)", color: "#fff",
              opacity: busy || testing || targets.length === 0 ? 0.6 : 1,
            }}>
            <CloudUpload size={16} /> {testing ? t("driveTesting") : t("driveTestBackup")}
          </button>
          <button onClick={disconnect} disabled={busy} className="brand-btn"
            style={{ background: "rgba(240,103,106,.12)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)" }}>
            <CloudOff size={16} /> {t("driveDisconnect")}
          </button>
        </div>
      )}

      {testResults && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {testResults.map((r) => (
            <div key={r.folder_id} style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              padding: "9px 12px", borderRadius: 10, fontSize: 12.5,
              border: `1px solid ${r.ok ? "rgba(91,214,166,.35)" : "rgba(240,103,106,.35)"}`,
              background: r.ok ? "rgba(91,214,166,.10)" : "rgba(240,103,106,.10)",
              color: r.ok ? "#5BD6A6" : "#F0676A",
            }}>
              {r.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <b>{r.folder_name ?? r.folder_id}</b>
              <span>
                {r.ok
                  ? `${t("driveTestOk")} · ${toLocalDigits(String(r.verified_bytes ?? 0), lang)} B`
                  : t((DRIVE_ERR_KEYS[r.error ?? ""] ?? "driveErrGeneric") as Parameters<typeof t>[0])}
              </span>
            </div>
          ))}
        </div>
      )}

      <BackupErrorsPanel />

      <DriveSetupGuide
        defaultOpen={!linked}
        accountEmail={status?.account_email ?? null}
        clientEmail={null}
      />
    </section>
  );
}


