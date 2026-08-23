import type { Editor } from "@tiptap/react";
import { createPortal } from "react-dom";
import { useApp } from "@/lib/app-context";
import { FileText, CalendarCheck2, Flag, Briefcase, Table2 } from "lucide-react";

type Template = { key: string; label: string; icon: React.ReactNode; html: (isAr: boolean) => string };

const TEMPLATES: Template[] = [
  {
    key: "meeting",
    label: "templateMeeting",
    icon: <CalendarCheck2 size={20} />,
    html: (ar) => ar
      ? `<h1>محضر اجتماع</h1><p><strong>التاريخ:</strong> </p><p><strong>الحضور:</strong> </p><h2>جدول الأعمال</h2><ul><li></li></ul><h2>القرارات</h2><ul><li></li></ul><h2>المهام</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>`
      : `<h1>Meeting notes</h1><p><strong>Date:</strong> </p><p><strong>Attendees:</strong> </p><h2>Agenda</h2><ul><li></li></ul><h2>Decisions</h2><ul><li></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>`,
  },
  {
    key: "weekly",
    label: "templateWeekly",
    icon: <FileText size={20} />,
    html: (ar) => ar
      ? `<h1>تقرير أسبوعي</h1><h2>ما تم إنجازه</h2><ul><li></li></ul><h2>قيد التنفيذ</h2><ul><li></li></ul><h2>معوقات</h2><ul><li></li></ul><h2>الأسبوع القادم</h2><ul><li></li></ul>`
      : `<h1>Weekly report</h1><h2>Done this week</h2><ul><li></li></ul><h2>In progress</h2><ul><li></li></ul><h2>Blockers</h2><ul><li></li></ul><h2>Next week</h2><ul><li></li></ul>`,
  },
  {
    key: "decision",
    label: "templateDecision",
    icon: <Flag size={20} />,
    html: (ar) => ar
      ? `<h1>قرار</h1><p><strong>السياق:</strong> </p><p><strong>الخيارات:</strong></p><ol><li></li></ol><p><strong>القرار:</strong> </p><p><strong>الأثر:</strong> </p>`
      : `<h1>Decision</h1><p><strong>Context:</strong> </p><p><strong>Options considered:</strong></p><ol><li></li></ol><p><strong>Decision:</strong> </p><p><strong>Impact:</strong> </p>`,
  },
  {
    key: "brief",
    label: "templateBrief",
    icon: <Briefcase size={20} />,
    html: (ar) => ar
      ? `<h1>ملخص عميل</h1><p><strong>العميل:</strong> </p><p><strong>الهدف:</strong> </p><h2>النطاق</h2><ul><li></li></ul><h2>الجدول الزمني</h2><ul><li></li></ul><h2>الميزانية</h2><p></p>`
      : `<h1>Client brief</h1><p><strong>Client:</strong> </p><p><strong>Goal:</strong> </p><h2>Scope</h2><ul><li></li></ul><h2>Timeline</h2><ul><li></li></ul><h2>Budget</h2><p></p>`,
  },
  {
    key: "spreadsheet",
    label: "templateSpreadsheet",
    icon: <Table2 size={20} />,
    html: (ar) => ar
      ? `<h1>جدول بيانات</h1><table><thead><tr><th>البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr></tbody></table>`
      : `<h1>Spreadsheet</h1><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr></tbody></table>`,
  },
];

export function TemplatesPopup({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const { t, lang } = useApp();
  if (!editor) return null;
  const isAr = lang === "ar";

  const apply = (tpl: Template) => {
    editor.chain().focus().insertContent(tpl.html(isAr)).run();
    onClose();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet-panel"
        style={{
          width: "100%", maxWidth: 640, background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 16, padding: 20,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{t("templatesTitle")}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{t("emptyStateHint")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => apply(tpl)}
              style={{
                textAlign: "start", padding: 14, borderRadius: 12,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                color: "var(--foreground)", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: 10, minHeight: 100,
              }}
            >
              <span style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(24,159,209,.14)", color: "#189FD1", borderRadius: 8 }}>
                {tpl.icon}
              </span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t(tpl.label as never)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
