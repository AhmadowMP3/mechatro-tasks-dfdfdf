import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Responsive page header used on every authenticated page.
 *
 * Desktop (≥ 768px): flex row, title on one side, actions on the other, wraps if needed.
 * Mobile  (< 768px): title row uses grid-cols-[minmax(0,1fr)_auto] so the title
 *   truncates instead of pushing the action button to a new awkward row. Actions
 *   that don't fit next to the title move to a second row, full-width.
 *
 * Keeps the same tokens, colors, and spacing scale as before — this only
 * changes reflow behavior on small screens.
 */
export function PageHeader({
  title,
  subtitle,
  adornment,
  actions,
  compactActions,
  mobileActionsFullWidth = false,
}: {
  /** Main heading text or node. Truncates on mobile if long. */
  title: ReactNode;
  /** Optional subtitle line below the title. */
  subtitle?: ReactNode;
  /** Small node rendered before the title (icon/avatar block). */
  adornment?: ReactNode;
  /** Right-side actions (buttons, filters, view switchers, badges). */
  actions?: ReactNode;
  /**
   * A compact action that stays inline next to the title on mobile
   * (e.g. a live indicator). Skipped when not provided.
   */
  compactActions?: ReactNode;
  /** If true, `actions` render on a second full-width row on mobile. */
  mobileActionsFullWidth?: boolean;
}) {
  const isMobile = useIsMobile();

  const titleSize = isMobile ? 22 : 28;
  const gap = isMobile ? 10 : 12;

  const titleNode = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 10 : 12,
        minWidth: 0,
      }}
    >
      {adornment}
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1
          style={{
            fontSize: titleSize,
            fontWeight: 900,
            margin: 0,
            lineHeight: 1.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div
            style={{
              fontSize: isMobile ? 12.5 : 13.5,
              color: "var(--muted)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {compactActions}
    </div>
  );

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {titleNode}
        {actions && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              width: mobileActionsFullWidth ? "100%" : undefined,
            }}
          >
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap,
        alignItems: "center",
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{titleNode}</div>
      {actions}
    </div>
  );
}
