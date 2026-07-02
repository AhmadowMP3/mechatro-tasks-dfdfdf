import { STATUS_STYLES, PRIORITY_STYLES, ROLE_STYLES } from "@/lib/ui-tokens";
import { useApp } from "@/lib/app-context";
import type { DictKey } from "@/i18n/dict";

function Pill({ bg, text, children }: { bg: string; text: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: bg, color: text, padding: "4px 12px", borderRadius: 999,
      fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { t } = useApp();
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.todo;
  return <Pill bg={s.bg} text={s.text}>{t(status as DictKey)}</Pill>;
}

export function PriorityPill({ priority }: { priority: string }) {
  const { t } = useApp();
  const s = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal;
  return <Pill bg={s.bg} text={s.text}>{t(priority as DictKey)}</Pill>;
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useApp();
  const s = ROLE_STYLES[role] ?? ROLE_STYLES.viewer;
  return <Pill bg={s.bg} text={s.text}>{t(role as DictKey)}</Pill>;
}

export function OverduePill() {
  const { t } = useApp();
  return <Pill bg="rgba(240,103,106,.2)" text="#F0676A">⚠ {t("overdue")}</Pill>;
}
