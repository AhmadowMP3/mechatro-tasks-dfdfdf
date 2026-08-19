import { AssigneeStack } from "@/components/AssigneeStack";
import { useApp, type Profile } from "@/lib/app-context";
import { toLocalDigits } from "@/lib/format";

/**
 * Inline assignee names next to the avatar stack.
 * Shows up to `maxNames` names, then a "+N" chip for the rest.
 */
export function AssigneeNames({
  users,
  size = 22,
  maxNames = 2,
  className,
}: {
  users: Profile[];
  size?: number;
  maxNames?: number;
  className?: string;
}) {
  const { lang, t } = useApp();
  if (users.length === 0) return null;

  const shown = users.slice(0, maxNames);
  const extra = users.length - shown.length;
  const rest = extra > 0 ? users.slice(maxNames) : [];

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
      }}
    >
      <AssigneeStack users={users} size={size} max={3} />
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
          fontSize: 12,
          color: "var(--foreground)",
          fontWeight: 600,
        }}
      >
        {shown.map((u, i) => (
          <span
            key={u.id}
            title={u.full_name}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 90,
              display: "inline-block",
              verticalAlign: "middle",
            }}
          >
            {u.full_name}
            {i < shown.length - 1 ? (
              <span style={{ color: "var(--muted)", marginInline: 3 }}>,</span>
            ) : null}
          </span>
        ))}
        {extra > 0 && (
          <span
            title={rest.map((u) => u.full_name).join(", ")}
            style={{
              flex: "0 0 auto",
              padding: "2px 7px",
              borderRadius: 999,
              background: "var(--surface-3)",
              color: "var(--muted)",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {t("andMore").replace("{n}", toLocalDigits(extra, lang))}
          </span>
        )}
      </span>
    </span>
  );
}
