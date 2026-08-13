import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { Check, CheckCheck, Trash2, MailOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useBulkSelection, BulkCheckbox } from "@/lib/bulk-selection";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { t, lang, user } = useApp();
  const { data, refetch } = useQuery({
    queryKey: ["notifs", user?.id],
    queryFn: async () => (await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false })).data ?? [],
    enabled: !!user,
  });

  const items = data ?? [];
  const l = lang === "ar";

  const { isSelected, toggle, ids } = useBulkSelection({
    pageId: "notifications",
    items,
    deps: [items.length, lang],
    buildBar: (selectedIds, clearSel) => ({
      count: selectedIds.length,
      totalLabel: l
        ? `${selectedIds.length} إشعار محدد`
        : `${selectedIds.length} notification${selectedIds.length === 1 ? "" : "s"} selected`,
      actions: [
        {
          id: "mark-read",
          label: l ? "تعليم كمقروء" : "Mark read",
          icon: <MailOpen size={14} />,
          onRun: async () => {
            await supabase.from("notifications").update({ read: true }).in("id", selectedIds);
            toast.success(t("saved"));
            clearSel();
            refetch();
          },
        },
        {
          id: "delete",
          label: l ? "حذف" : "Delete",
          icon: <Trash2 size={14} />,
          destructive: true,
          confirm: l
            ? `حذف ${selectedIds.length} إشعار؟`
            : `Delete ${selectedIds.length} notification${selectedIds.length === 1 ? "" : "s"}?`,
          onRun: async () => {
            const { error } = await supabase.from("notifications").delete().in("id", selectedIds);
            if (error) { toast.error(error.message); return; }
            toast.success(l ? "تم الحذف" : "Deleted");
            clearSel();
            refetch();
          },
        },
      ],
    }),
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

  const unread = items.filter((n) => !n.read).length;
  const bulkMode = ids.length > 0;

  return (
    <div>
      <PageHeader
        title={t("notifications")}
        actions={
          unread > 0 ? (
            <button onClick={markAll} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
              <CheckCheck size={18} /> {t("markAllRead")}
            </button>
          ) : null
        }
      />


      <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noNotifications")}</div>
        ) : items.map((n, i) => {
          const checked = isSelected(n.id);
          return (
            <div
              key={n.id}
              onClick={() => bulkMode && toggle(n.id)}
              style={{
                display: "flex", gap: 12, alignItems: "center", padding: 16,
                borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
                background: checked
                  ? "rgba(24,159,209,.12)"
                  : n.read ? "transparent" : "rgba(24,159,209,.06)",
                cursor: bulkMode ? "pointer" : "default",
              }}
            >
              <BulkCheckbox
                checked={checked}
                onChange={() => toggle(n.id)}
                label={l ? "تحديد" : "Select"}
              />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: n.read ? "transparent" : "var(--primary)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{lang === "ar" ? n.title_ar : n.title_en}</div>
                {n.body && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{n.body}</div>}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{relativeTime(n.created_at, lang)}</div>
              </div>
              {!n.read && !bulkMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); markOne(n.id); }}
                  title={t("markRead")}
                  style={{ minWidth: 48, minHeight: 48, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Check size={18} />
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

