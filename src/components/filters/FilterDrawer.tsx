// Reusable filter drawer + supporting controls.
// All 4 major pages share these primitives.

import * as React from "react";
import { Filter, RotateCcw, X, Check, ChevronDown, Download } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger,
} from "@/components/ui/sheet";
import { useApp } from "@/lib/app-context";
import { useIsMobile } from "@/hooks/use-mobile";

/* ---------------- Trigger button ---------------- */

export function FilterTriggerButton({
  activeCount, onClick, label,
}: { activeCount: number; onClick?: () => void; label?: string }) {
  const { t } = useApp();
  return (
    <button
      onClick={onClick}
      className="brand-btn"
      style={{
        background: "var(--surface-2)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <Filter size={16} /> {label ?? t("filters")}
      {activeCount > 0 && (
        <span
          style={{
            display: "inline-grid", placeItems: "center",
            minWidth: 22, height: 22, padding: "0 6px",
            borderRadius: 999, background: "var(--grad-blue)",
            color: "#fff", fontSize: 12, fontWeight: 800,
            marginInlineStart: 4,
          }}
        >
          {activeCount}
        </span>
      )}
    </button>
  );
}

/* ---------------- Export button ---------------- */

export function ExportXlsxButton({
  onExport, disabled,
}: { onExport: () => Promise<void> | void; disabled?: boolean }) {
  const { t } = useApp();
  const [busy, setBusy] = React.useState(false);
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try { await onExport(); } finally { setBusy(false); }
  };
  return (
    <button
      onClick={click}
      disabled={disabled || busy}
      className="brand-btn"
      style={{
        background: "linear-gradient(135deg,#217346,#2ea165)",
        color: "#fff",
        opacity: (disabled || busy) ? 0.6 : 1,
      }}
    >
      <Download size={16} /> {busy ? t("exporting") : t("exportXlsx")}
    </button>
  );
}

/* ---------------- Drawer shell ---------------- */

export function FilterDrawer({
  open, onOpenChange, activeCount, onReset, children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activeCount: number;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const { t, lang } = useApp();
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : (lang === "ar" ? "left" : "right")}
        className={isMobile ? "w-full max-h-[92dvh] overflow-y-auto rounded-t-2xl" : "w-full sm:max-w-md overflow-y-auto"}
        style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        <SheetHeader>
          <SheetTitle style={{ color: "var(--foreground)", display: "flex", alignItems: "center", gap: 10 }}>
            <Filter size={20} /> {t("filtersTitle")}
            {activeCount > 0 && (
              <span style={{
                display: "inline-grid", placeItems: "center",
                minWidth: 22, height: 22, padding: "0 6px",
                borderRadius: 999, background: "var(--grad-blue)",
                color: "#fff", fontSize: 12, fontWeight: 800,
              }}>{activeCount}</span>
            )}
          </SheetTitle>
          <SheetDescription style={{ color: "var(--muted)" }}>
            {t("filtersDescription")}
          </SheetDescription>
        </SheetHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBlock: 18 }}>
          {children}
        </div>

        <SheetFooter style={{ display: "flex", gap: 8, flexDirection: "row" }}>
          <button
            onClick={onReset}
            className="brand-btn"
            style={{
              flex: 1, background: "transparent", color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            <RotateCcw size={16} /> {t("clearAll")}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="brand-btn"
            style={{ flex: 1, background: "var(--grad-blue)", color: "#fff" }}
          >
            <Check size={16} /> {t("applyFilters")}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Section ---------------- */

export function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
        color: "var(--muted)", textTransform: "uppercase", marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  );
}

/* ---------------- Chip multi-select ---------------- */

export function ChipMultiSelect<T extends string>({
  value, onChange, options,
}: {
  value: T[];
  onChange: (v: T[]) => void;
  options: { value: T; label: string; color?: string }[];
}) {
  const toggle = (v: T) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            style={{
              padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${on ? (o.color ?? "#189FD1") : "var(--border)"}`,
              background: on ? (o.color ?? "#189FD1") : "var(--surface-2)",
              color: on ? "#fff" : "var(--foreground)",
              fontSize: 12, fontWeight: 700, minHeight: 32,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Single select ---------------- */

export function FilterSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", minHeight: 40, appearance: "none",
          padding: "0 32px 0 12px",
          background: "var(--surface-2)", color: "var(--foreground)",
          border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none",
        }}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: "absolute", top: "50%", insetInlineEnd: 10, transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
    </div>
  );
}

/* ---------------- Date range with presets ---------------- */

export type Preset = "all" | "today" | "7d" | "30d" | "custom";

export function DateRangeControl({
  preset, from, to, onChange,
}: {
  preset: Preset;
  from: string;
  to: string;
  onChange: (p: { preset: Preset; from: string; to: string }) => void;
}) {
  const { t } = useApp();
  const presets: { key: Preset; label: string }[] = [
    { key: "all", label: t("allTime") },
    { key: "today", label: t("today") },
    { key: "7d", label: t("last7Days") },
    { key: "30d", label: t("last30Days") },
    { key: "custom", label: t("customRange") },
  ];
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange({ preset: p.key, from, to })}
            style={{
              padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${preset === p.key ? "#189FD1" : "var(--border)"}`,
              background: preset === p.key ? "#189FD1" : "var(--surface-2)",
              color: preset === p.key ? "#fff" : "var(--foreground)",
              fontSize: 12, fontWeight: 700, minHeight: 32,
            }}
          >{p.label}</button>
        ))}
      </div>
      {preset === "custom" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={from} onChange={(e) => onChange({ preset, from: e.target.value, to })}
            style={{ flex: 1, minHeight: 40, padding: "0 10px", background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13 }} />
          <input type="date" value={to} onChange={(e) => onChange({ preset, from, to: e.target.value })}
            style={{ flex: 1, minHeight: 40, padding: "0 10px", background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13 }} />
        </div>
      )}
    </div>
  );
}

export function resolveDateRange(preset: Preset, from: string, to: string): { since?: Date; until?: Date } {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (preset === "all") return {};
  if (preset === "today") return { since: start };
  if (preset === "7d") { const d = new Date(now); d.setDate(d.getDate() - 7); return { since: d }; }
  if (preset === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return { since: d }; }
  if (preset === "custom") {
    const out: { since?: Date; until?: Date } = {};
    if (from) out.since = new Date(from);
    if (to) { const u = new Date(to); u.setHours(23, 59, 59, 999); out.until = u; }
    return out;
  }
  return {};
}

/* ---------------- Active-filter chips (removable) ---------------- */

export type ActiveChip = { key: string; label: string; onRemove: () => void };

export function ActiveFilterChips({ chips, onClearAll }: { chips: ActiveChip[]; onClearAll: () => void }) {
  const { t } = useApp();
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {t("activeFilters")}:
      </span>
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.onRemove}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            border: "1px solid var(--border-2)",
            background: "var(--surface-2)",
            color: "var(--foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          {c.label} <X size={12} />
        </button>
      ))}
      <button
        onClick={onClearAll}
        style={{
          padding: "4px 10px", borderRadius: 999,
          border: "1px dashed var(--border-2)",
          background: "transparent", color: "var(--muted)",
          fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}
      >
        {t("clearAll")}
      </button>
    </div>
  );
}

/* ---------------- Simple search field (page header) ---------------- */

import { Search as SearchIcon } from "lucide-react";

export function SearchField({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const { t } = useApp();
  return (
    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 220, maxWidth: 360 }}>
      <SearchIcon size={16} style={{ position: "absolute", top: "50%", insetInlineStart: 10, transform: "translateY(-50%)", color: "var(--muted)" }} />
      <input
        placeholder={placeholder ?? t("searchPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", minHeight: 40, borderRadius: 10,
          padding: "0 12px 0 34px",
          background: "var(--surface-2)", color: "var(--foreground)",
          border: "1px solid var(--border)", outline: "none", fontSize: 14,
        }}
      />
    </div>
  );
}

/* Fun trigger + export cluster used by every page header */

export function FilterBarCluster({
  activeCount, onOpen, onReset, onExport, exportDisabled, children,
}: {
  activeCount: number;
  onOpen: () => void;
  onReset: () => void;
  onExport: () => Promise<void> | void;
  exportDisabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {children}
      <FilterTriggerButton activeCount={activeCount} onClick={onOpen} />
      {activeCount > 0 && (
        <button
          onClick={onReset}
          className="brand-btn-sm"
          style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}
        >
          <RotateCcw size={14} /> Reset
        </button>
      )}
      <ExportXlsxButton onExport={onExport} disabled={exportDisabled} />
    </div>
  );
}
