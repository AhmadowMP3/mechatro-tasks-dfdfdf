import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { AssigneeMultiSelect } from "@/components/ui/AssigneeMultiSelect";
import { useApp, type Profile } from "@/lib/app-context";
import { bulkUpdateAssignees, type BulkAssigneeMode } from "@/lib/task-assignees";
import { toast } from "sonner";

export function BulkAssigneeModal({
  taskIds, users, onClose, onDone,
}: {
  taskIds: string[];
  users: Profile[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang, user } = useApp();
  const [mode, setMode] = useState<BulkAssigneeMode>("add");
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const modeLabels: Record<BulkAssigneeMode, string> = {
    add: lang === "ar" ? "إضافة" : "Add",
    replace: lang === "ar" ? "استبدال" : "Replace",
    remove: lang === "ar" ? "إزالة" : "Remove",
  };
  const modeHints: Record<BulkAssigneeMode, string> = {
    add: lang === "ar"
      ? "إضافة المحددين إلى المكلفين الحاليين لكل مهمة."
      : "Add selected people to each task's current assignees.",
    replace: lang === "ar"
      ? "استبدال المكلفين الحاليين بالمحددين."
      : "Overwrite each task's assignees with the selected people.",
    remove: lang === "ar"
      ? "إزالة المحددين من المكلفين الحاليين لكل مهمة."
      : "Remove the selected people from each task's assignees.",
  };

  const apply = async () => {
    if (mode !== "replace" && ids.length === 0) {
      toast.error(lang === "ar" ? "اختر شخصًا واحدًا على الأقل" : "Pick at least one person");
      return;
    }
    setBusy(true);
    const res = await bulkUpdateAssignees(taskIds, ids, mode, { assignedBy: user?.id ?? null });
    setBusy(false);
    if (res.failed.length === 0) {
      toast.success(
        lang === "ar"
          ? `تم تحديث ${res.ok.length} مهمة`
          : `Updated ${res.ok.length} task${res.ok.length === 1 ? "" : "s"}`,
      );
    } else {
      toast.error(
        lang === "ar"
          ? `تم تحديث ${res.ok.length} من ${taskIds.length}، فشل ${res.failed.length}`
          : `Updated ${res.ok.length} of ${taskIds.length}, ${res.failed.length} failed`,
      );
    }
    onDone();
    onClose();
  };

  return (
    <ResponsiveModal
      title={
        lang === "ar"
          ? `تعيين ${taskIds.length} مهمة`
          : `Assign ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}`
      }
      onClose={onClose}
      size="md"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>{lang === "ar" ? "الوضع" : "Mode"}</label>
          <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: 10, border: "1px solid var(--border)" }}>
            {(["add", "replace", "remove"] as const).map((m) => {
              const on = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8,
                    border: "none", cursor: "pointer",
                    background: on ? "var(--grad-blue, #189FD1)" : "transparent",
                    color: on ? "#fff" : "var(--foreground)",
                    fontWeight: 700, fontSize: 13,
                  }}
                >
                  {modeLabels[m]}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>{modeHints[mode]}</div>
        </div>

        <div>
          <label style={labelStyle}>
            {mode === "remove"
              ? (lang === "ar" ? "أشخاص للإزالة" : "People to remove")
              : (lang === "ar" ? "الأشخاص" : "People")}
          </label>
          <AssigneeMultiSelect
            users={users}
            value={ids}
            onChange={setIds}
            placeholder={lang === "ar" ? "اختر…" : "Pick…"}
          />
          {mode === "replace" && ids.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#F0A852" }}>
              {lang === "ar"
                ? "سيؤدي هذا إلى إزالة جميع المكلفين من المهام المحددة."
                : "This will clear all assignees on the selected tasks."}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="brand-btn"
            style={{
              flex: 1, background: "var(--grad-blue)", color: "#fff",
              opacity: busy ? 0.7 : 1, cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? (lang === "ar" ? "جاري…" : "Working…") : t("save" as never) ?? (lang === "ar" ? "تطبيق" : "Apply")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          >
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700,
  color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4,
};
