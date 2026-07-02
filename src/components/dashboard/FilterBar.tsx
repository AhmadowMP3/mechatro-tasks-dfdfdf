import { useMemo, useRef, useState, useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { toLocalDigits } from "@/lib/format";
import type { DictKey } from "@/i18n/dict";

export type DashboardFilters = {
  range: "today" | "7d" | "30d" | "90d" | "all" | "custom";
  from?: string; // yyyy-mm-dd
  to?: string;
  projects: string[];
  statuses: string[];
};

export const DEFAULT_FILTERS: DashboardFilters = {
  range: "30d",
  projects: [],
  statuses: [],
};

export function isDefaultFilters(f: DashboardFilters) {
  return f.range === DEFAULT_FILTERS.range && f.projects.length === 0 && f.statuses.length === 0 && !f.from && !f.to;
}

export function resolveRange(f: DashboardFilters): { start: Date | null; end: Date | null } {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (f.range === "today") return { start, end };
  if (f.range === "7d") { start.setDate(start.getDate() - 6); return { start, end }; }
  if (f.range === "30d") { start.setDate(start.getDate() - 29); return { start, end }; }
  if (f.range === "90d") { start.setDate(start.getDate() - 89); return { start, end }; }
  if (f.range === "all") return { start: null, end: null };
  // custom
  const s = f.from ? new Date(f.from + "T00:00:00") : null;
  const e = f.to ? new Date(f.to + "T23:59:59") : null;
  return { start: s, end: e };
}

const STATUS_OPTIONS = ["todo", "in_progress", "paused", "in_review", "done"] as const;
const RANGE_OPTIONS: DashboardFilters["range"][] = ["today", "7d", "30d", "90d", "all", "custom"];

export function FilterBar({
  value,
  onChange,
  projects,
}: {
  value: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  projects: { id: string; name_ar: string; name_en: string; color: string | null }[];
}) {
  const { t, lang } = useApp();
  const activeCount =
    (value.range !== DEFAULT_FILTERS.range ? 1 : 0) +
    (value.projects.length > 0 ? 1 : 0) +
    (value.statuses.length > 0 ? 1 : 0);

  const rangeLabel = (r: DashboardFilters["range"]): string => {
    switch (r) {
      case "today": return t("today");
      case "7d": return t("last7Days");
      case "30d": return t("last30Days");
      case "90d": return t("last90Days");
      case "all": return t("allTime");
      case "custom": return t("customRange");
    }
  };

  return (
    <div
      className="brand-card"
      style={{
        padding: 14,
        position: "sticky",
        top: 8,
        zIndex: 20,
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Range presets */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {RANGE_OPTIONS.map((r) => {
          const selected = value.range === r;
          return (
            <button
              key={r}
              onClick={() => onChange({ ...value, range: r, ...(r === "custom" ? {} : { from: undefined, to: undefined }) })}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                border: `1px solid ${selected ? "transparent" : "var(--border)"}`,
                background: selected ? "var(--grad-blue)" : "var(--surface-2)",
                color: selected ? "#fff" : "var(--foreground)",
                boxShadow: selected ? "0 4px 14px color-mix(in oklab, var(--brand-blue) 35%, transparent)" : "none",
                transform: selected ? "translateY(-1px)" : "none",
                transition: "all .15s ease",
                cursor: "pointer",
                minHeight: 32,
              }}
            >
              {rangeLabel(r)}
            </button>
          );
        })}
      </div>

      {/* Custom date pickers */}
      {value.range === "custom" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{t("fromDate")}</label>
          <input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            style={dateInputStyle}
          />
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{t("toDate")}</label>
          <input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            style={dateInputStyle}
          />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 8 }} />

      {/* Project multi-select */}
      <MultiSelect
        label={t("allProjects")}
        selected={value.projects}
        onChange={(next) => onChange({ ...value, projects: next })}
        options={projects.map((p) => ({ id: p.id, label: lang === "ar" ? p.name_ar : p.name_en, color: p.color ?? "#42C2EE" }))}
        lang={lang}
      />

      {/* Status multi-select */}
      <MultiSelect
        label={t("allStatuses")}
        selected={value.statuses}
        onChange={(next) => onChange({ ...value, statuses: next })}
        options={STATUS_OPTIONS.map((s) => ({ id: s, label: t(s as DictKey), color: statusColor(s) }))}
        lang={lang}
      />

      {activeCount > 0 && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            border: "1px solid rgba(240,103,106,.4)",
            background: "rgba(240,103,106,.08)",
            color: "#F0676A",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            minHeight: 32,
          }}
        >
          ✕ {t("clearFilters")}
          <span style={{ background: "#F0676A", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 11 }}>
            {toLocalDigits(activeCount, lang)}
          </span>
        </button>
      )}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--foreground)",
  fontSize: 12,
  fontFamily: "inherit",
  colorScheme: "dark",
  minHeight: 32,
};

function statusColor(s: string) {
  return { todo: "#86A1B7", in_progress: "#42C2EE", paused: "#FF9255", done: "#73C94E" }[s] ?? "#86A1B7";
}

function MultiSelect({
  label,
  selected,
  onChange,
  options,
  lang,
}: {
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
  options: { id: string; label: string; color?: string }[];
  lang: "ar" | "en";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);

  const summary = useMemo(() => {
    if (selected.length === 0) return label;
    if (selected.length === 1) return options.find((o) => o.id === selected[0])?.label ?? label;
    return `${label} · ${toLocalDigits(selected.length, lang)}`;
  }, [selected, label, options, lang]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const active = selected.length > 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          border: `1px solid ${active ? "var(--brand-blue)" : "var(--border)"}`,
          background: active ? "color-mix(in oklab, var(--brand-blue) 18%, transparent)" : "var(--surface-2)",
          color: active ? "var(--brand-blue)" : "var(--foreground)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minHeight: 32,
        }}
      >
        {summary}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: lang === "ar" ? 0 : "auto",
            right: lang === "ar" ? "auto" : 0,
            minWidth: 220,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,.4)",
            padding: 6,
            zIndex: 30,
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>—</div>
          )}
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                onClick={() => toggle(o.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: on ? "color-mix(in oklab, var(--brand-blue) 12%, transparent)" : "transparent",
                  border: "none",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontSize: 13,
                  textAlign: lang === "ar" ? "right" : "left",
                  minHeight: 36,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1.5px solid ${on ? "var(--brand-blue)" : "var(--border)"}`,
                    background: on ? "var(--brand-blue)" : "transparent",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    flex: "0 0 auto",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                {o.color && <span style={{ width: 8, height: 8, borderRadius: 999, background: o.color, flex: "0 0 auto" }} />}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
