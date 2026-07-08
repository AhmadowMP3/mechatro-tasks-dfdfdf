import { Avatar } from "@/components/Avatar";
import type { Profile } from "@/lib/app-context";

/**
 * Overlapping avatar group. Shows up to `max` avatars followed by a "+N" chip.
 */
export function AssigneeStack({
  users,
  size = 24,
  max = 3,
}: {
  users: Profile[];
  size?: number;
  max?: number;
}) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const overlap = Math.round(size * 0.35);

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {shown.map((u, i) => (
        <span
          key={u.id}
          title={u.full_name}
          style={{
            marginInlineStart: i === 0 ? 0 : -overlap,
            borderRadius: "50%",
            outline: "2px solid var(--card)",
            display: "inline-flex",
            position: "relative",
            zIndex: shown.length - i,
          }}
        >
          <Avatar id={u.id} name={u.full_name} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          title={users.slice(max).map((u) => u.full_name).join(", ")}
          style={{
            marginInlineStart: -overlap,
            width: size,
            height: size,
            borderRadius: "50%",
            outline: "2px solid var(--card)",
            background: "var(--surface-3)",
            color: "var(--foreground)",
            fontSize: Math.max(9, Math.round(size * 0.42)),
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
