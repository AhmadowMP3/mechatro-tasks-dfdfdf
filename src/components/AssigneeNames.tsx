import { Avatar } from "@/components/Avatar";
import { useApp, type Profile } from "@/lib/app-context";
import { toLocalDigits } from "@/lib/format";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

/**
 * Inline assignee names next to small avatars.
 * Shows up to `maxNames` names, then a "+N" chip for the rest.
 * Hovering reveals a popup with the full assignee list.
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
  const overlap = Math.round(size * 0.25);

  const inlineContent = (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {shown.map((u, i) => (
          <span
            key={u.id}
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
              position: "relative",
              zIndex: 0,
            }}
          >
            {toLocalDigits(extra, lang)}
          </span>
        )}
      </span>
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

  if (users.length <= maxNames) return inlineContent;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{inlineContent}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align={lang === "ar" ? "end" : "start"}
        sideOffset={8}
        className="w-auto min-w-[180px] max-w-[280px] rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            direction: lang === "ar" ? "rtl" : "ltr",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {t("assignees")} ({toLocalDigits(users.length, lang)})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Avatar id={u.id} name={u.full_name} size={26} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 210,
                  }}
                >
                  {u.full_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
