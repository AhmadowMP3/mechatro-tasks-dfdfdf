import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { Check, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { t, lang, user } = useApp();
  const { data, refetch } = useQuery({
    queryKey: ["notifs", user?.id],
    queryFn: async () => (await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false })).data ?? [],
    enabled: !!user,
  });

  const markAll = async () => {
    await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    toast.success(t("saved"));
    refetch();
  };
  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    refetch();
  };

  const unread = (data ?? []).filter((n) => !n.read).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, margin: 0, flex: 1 }}>{t("notifications")}</h1>
        {unread > 0 && (
          <button onClick={markAll} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
            <CheckCheck size={18} /> {t("markAllRead")}
          </button>
        )}
      </div>

      <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
        {(data ?? []).length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noNotifications")}</div>
        ) : (data ?? []).map((n, i) => (
          <div key={n.id} style={{
            display: "flex", gap: 12, alignItems: "center", padding: 16,
            borderBottom: i < data!.length - 1 ? "1px solid var(--border)" : "none",
            background: n.read ? "transparent" : "rgba(24,159,209,.06)",
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: n.read ? "transparent" : "var(--primary)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{lang === "ar" ? n.title_ar : n.title_en}</div>
              {n.body && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{n.body}</div>}
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{relativeTime(n.created_at, lang)}</div>
            </div>
            {!n.read && (
              <button onClick={() => markOne(n.id)} title={t("markRead")}
                style={{ minWidth: 48, minHeight: 48, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
