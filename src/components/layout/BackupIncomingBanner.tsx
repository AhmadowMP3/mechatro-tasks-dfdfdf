import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";

/**
 * Global banner shown to every signed-in user while a backup request is pending
 * (i.e. within the 24h auto-approve window). Warns members to save their work.
 */
export function BackupIncomingBanner() {
  const { t } = useApp();
  const { data } = useQuery({
    queryKey: ["backup-incoming-banner"],
    refetchInterval: 5 * 60 * 1000, // 5 min
    queryFn: async () => {
      const { data } = await (supabase.from as unknown as (t: string) => any)("backup_requests")
        .select("id, status, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1);
      return (data ?? [])[0] as { id: string; requested_at: string } | undefined;
    },
  });

  if (!data) return null;

  const requestedAt = new Date(data.requested_at).getTime();
  const runsAt = requestedAt + 24 * 60 * 60 * 1000;
  const hoursLeft = Math.max(0, Math.round((runsAt - Date.now()) / (60 * 60 * 1000)));

  return (
    <div
      style={{
        margin: "0 0 14px 0",
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid rgba(231,176,58,.45)",
        background: "rgba(231,176,58,.10)",
        color: "var(--foreground)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
      }}
      role="status"
    >
      <AlertTriangle size={16} color="#E7B03A" />
      <span style={{ flex: 1 }}>{t("backupIncomingBanner")}</span>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
        {hoursLeft > 0 ? `${t("autoApprovesIn")} ~${hoursLeft} ${t("hours")}` : t("autoApprovesSoon")}
      </span>
    </div>
  );
}
