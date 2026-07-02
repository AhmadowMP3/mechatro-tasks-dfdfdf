import { LayoutGrid, Columns3, Table2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import type { DictKey } from "@/i18n/dict";

export type TaskView = "cards" | "kanban" | "table";

const OPTIONS: { key: TaskView; label: DictKey; Icon: typeof LayoutGrid }[] = [
  { key: "cards", label: "viewCards", Icon: LayoutGrid },
  { key: "kanban", label: "viewKanban", Icon: Columns3 },
  { key: "table", label: "viewTable", Icon: Table2 },
];

export function ViewSwitcher({ value, onChange }: { value: TaskView; onChange: (v: TaskView) => void }) {
  const { t } = useApp();
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        padding: 4,
        gap: 2,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      {OPTIONS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              minHeight: 36,
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              color: active ? "#fff" : "var(--muted)",
              background: active ? "var(--grad-blue)" : "transparent",
              transition: "all .18s ease",
            }}
          >
            <Icon size={16} />
            <span className="hide-sm">{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
