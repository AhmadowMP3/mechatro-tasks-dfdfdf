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
//
// When the options list is longer than 6, a sticky search field is rendered
// at the top of the popup so the user can filter items by typing. Can be
// forced on/off via the `searchable` prop.

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Search as SearchIcon } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";

const NONE = "__none__";
const SEARCH_THRESHOLD = 6;

export type ThemedOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

function labelToText(label: React.ReactNode): string {
  if (typeof label === "string" || typeof label === "number") return String(label);
  if (label == null || typeof label === "boolean") return "";
  if (Array.isArray(label)) return label.map(labelToText).join(" ");
  // React element fallback: try to read children
  if (typeof label === "object" && "props" in (label as object)) {
    const children = (label as { props?: { children?: React.ReactNode } }).props?.children;
    return labelToText(children);
  }
  return "";
}

export function ThemedSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style,
  ariaLabel,
  searchable,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ThemedOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
  searchable?: boolean;
}) {
  const { lang } = useApp();
  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => labelToText(o.label).toLowerCase().includes(q));
  }, [query, options]);

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
  const searchPlaceholder = lang === "ar" ? "بحث…" : "Search…";
  const emptyText = lang === "ar" ? "لا نتائج" : "No results";

  const isMobile = useIsMobile();

  React.useEffect(() => {
    if (!isMobile || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, open]);

  // ---- Mobile: bottom sheet instead of an anchored popper ----
  if (isMobile) {
    const pick = (v: string) => { onChange(v === NONE ? "" : v); setOpen(false); };
    return (
      <>
        <button
          type="button"
          dir={dir}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          style={triggerStyle}
        >
          {selected ? (
            <span style={{ color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.label}</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>{placeholder ?? "—"}</span>
          )}
          <ChevronDown size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
        </button>

        {open && typeof document !== "undefined" && createPortal(
          <div
            dir={dir}
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 1200,
              background: "rgba(0,0,0,.55)",
              display: "flex", alignItems: "flex-end", justifyContent: "center",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxHeight: "70dvh",
                background: "var(--card)",
                color: "var(--foreground)",
                borderTop: "1px solid var(--border)",
                borderRadius: "20px 20px 0 0",
                boxShadow: "0 -12px 40px rgba(0,0,0,.45)",
                display: "flex", flexDirection: "column", overflow: "hidden",
                paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
                <div style={{ width: 40, height: 4, borderRadius: 999, background: "var(--border)" }} />
              </div>

              {showSearch && (
                <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ position: "relative" }}>
                    <SearchIcon size={14} style={{ position: "absolute", top: "50%", insetInlineStart: 10, transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      style={{
                        width: "100%", minHeight: 40,
                        background: "var(--surface-2)", color: "var(--foreground)",
                        border: "1px solid var(--border)", borderRadius: 8,
                        paddingInlineStart: 30, paddingInlineEnd: 10,
                        fontSize: 14, fontFamily: "inherit", outline: "none",
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 4, WebkitOverflowScrolling: "touch" }}>
                {placeholder !== undefined && (
                  <SheetItem selected={value === ""} onSelect={() => pick(NONE)}>
                    <span style={{ color: "var(--muted)" }}>{placeholder}</span>
                  </SheetItem>
                )}
                {filtered.map((o) => (
                  <SheetItem key={o.value} selected={o.value === value} disabled={o.disabled} onSelect={() => !o.disabled && pick(o.value)}>
                    {o.label}
                  </SheetItem>
                ))}
                {filtered.length === 0 && (
                  <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{emptyText}</div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }



  return (
    <SelectPrimitive.Root
      value={value === "" ? NONE : value}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      open={open}
      onOpenChange={setOpen}
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
          avoidCollisions
          collisionPadding={12}
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
            display: "flex",
            flexDirection: "column",
          }}
          onCloseAutoFocus={() => setQuery("")}
        >
          {showSearch && (
            <div
              style={{
                position: "sticky",
                top: 0,
                padding: 8,
                borderBottom: "1px solid var(--border)",
                background: "var(--card)",
                zIndex: 1,
              }}
              // Keep focus inside the input; stop Radix's typeahead from stealing key events.
              onKeyDown={(e) => {
                const k = e.key;
                if (
                  k.length === 1 ||
                  k === "Backspace" ||
                  k === "Delete" ||
                  k === " " ||
                  k === "Home" ||
                  k === "End"
                ) {
                  e.stopPropagation();
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div style={{ position: "relative" }}>
                <SearchIcon
                  size={14}
                  style={{
                    position: "absolute",
                    top: "50%",
                    insetInlineStart: 10,
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  ref={searchRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{
                    width: "100%",
                    minHeight: 36,
                    background: "var(--surface-2)",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    paddingInlineStart: 30,
                    paddingInlineEnd: 10,
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          )}

          <SelectPrimitive.Viewport
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 6,
              overflowY: "auto",
              flex: 1,
            }}
          >
            {placeholder !== undefined && (
              <ThemedItem value={NONE}>
                <span style={{ color: "var(--muted)" }}>{placeholder}</span>
              </ThemedItem>
            )}
            {filtered.map((o) => (
              <ThemedItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </ThemedItem>
            ))}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                {emptyText}
              </div>
            )}
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
