// Themed dropdown used across the app.
// Wraps Radix Select with inline styles that match the site's design tokens
// (--surface-2, --border, --card, --foreground, --muted, --grad-blue) so every
// dropdown looks identical whether it's inside a filter drawer, a modal, or a
// page header. Drop-in replacement for the native <select> pattern:
//
//   <ThemedSelect value={v} onChange={setV} options={[{value,label}]} />
//
// The trigger's `style` prop is merged into the default trigger style so
// existing call sites that pass `inp` or `selectStyle` keep working.

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useApp } from "@/lib/app-context";

const NONE = "__none__";

export type ThemedOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export function ThemedSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ThemedOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const { lang } = useApp();
  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  const triggerStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minHeight: 40,
    paddingInline: 12,
    paddingBlock: 0,
    background: "var(--surface-2)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "inherit",
    fontWeight: 600,
    outline: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    textAlign: dir === "rtl" ? "right" : "left",
    ...style,
  };

  const selected = options.find((o) => o.value === value);

  return (
    <SelectPrimitive.Root
      value={value === "" ? NONE : value}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      disabled={disabled}
      dir={dir}
    >
      <SelectPrimitive.Trigger aria-label={ariaLabel} style={triggerStyle}>
        <SelectPrimitive.Value placeholder={placeholder ?? "—"}>
          {selected ? (
            <span style={{ color: "var(--foreground)" }}>{selected.label}</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>{placeholder ?? "—"}</span>
          )}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          style={{
            zIndex: 1000,
            minWidth: "var(--radix-select-trigger-width)",
            maxHeight: "min(360px, var(--radix-select-content-available-height))",
            overflow: "hidden",
            background: "var(--card)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 20px 40px rgba(0,0,0,.35), 0 4px 12px rgba(0,0,0,.2)",
            padding: 6,
          }}
        >
          <SelectPrimitive.Viewport style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {placeholder !== undefined && (
              <ThemedItem value={NONE}>
                <span style={{ color: "var(--muted)" }}>{placeholder}</span>
              </ThemedItem>
            )}
            {options.map((o) => (
              <ThemedItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </ThemedItem>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

const ThemedItem = React.forwardRef<
  HTMLDivElement,
  { value: string; disabled?: boolean; children: React.ReactNode }
>(({ value, disabled, children }, ref) => {
  return (
    <SelectPrimitive.Item
      ref={ref}
      value={value}
      disabled={disabled}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        minHeight: 36,
        paddingInline: 10,
        paddingBlock: 6,
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        color: "var(--foreground)",
        outline: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
      }}
      className="themed-select-item"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check size={14} style={{ color: "#189FD1" }} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});
ThemedItem.displayName = "ThemedItem";
