import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, toLocalDigits } from "@/lib/format";
import type { Lang } from "@/i18n/dict";

type Props = {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  min?: string;
  lang: Lang;
  placeholder?: string;
};

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function DatePickerField({ value, onChange, min, lang, placeholder }: Props) {
  const l = lang === "ar";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseISO(value);
  const minDate = min ? parseISO(min) : null;
  const [viewDate, setViewDate] = useState<Date>(selected ?? minDate ?? new Date());

  useEffect(() => {
    if (open && selected) setViewDate(selected);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const weekdays = useMemo(() => {
    const base = new Date(2024, 5, 2); // Sunday
    const fmt = new Intl.DateTimeFormat(l ? "ar-EG" : "en-US", { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      return fmt.format(d);
    });
  }, [l]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(l ? "ar-EG-u-nu-latn" : "en-US", { month: "long", year: "numeric" });
    return fmt.format(viewDate);
  }, [viewDate, l]);

  const grid = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [viewDate]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const displayText = selected ? formatDate(value, lang) : (placeholder ?? (l ? "اختر التاريخ" : "Pick a date"));

  function shiftMonth(n: number) {
    const d = new Date(viewDate); d.setMonth(d.getMonth() + n); setViewDate(d);
  }
  function pick(d: Date) {
    if (minDate && d < minDate) return;
    onChange(toISO(d));
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          width: "100%", minHeight: 42, padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, borderRadius: 10,
          background: "var(--surface-2)", color: "var(--foreground)",
          border: "1px solid var(--border)", cursor: "pointer",
          fontSize: 14, fontWeight: 600, textAlign: "start",
          boxSizing: "border-box",
        }}
      >
        <span style={{ color: selected ? "var(--foreground)" : "var(--muted)", fontWeight: selected ? 700 : 500 }}>
          {displayText}
        </span>
        <span style={{
          display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, rgba(240,180,41,.18), rgba(240,159,38,.12))",
          border: "1px solid rgba(240,180,41,.35)", color: "#F0B429",
        }}>
          <CalendarDays size={16} />
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", insetInlineStart: 0, zIndex: 61,
            width: 300, padding: 14, borderRadius: 14,
            background: "var(--surface-1, #0F2033)", border: "1px solid var(--border, #1E364D)",
            boxShadow: "0 20px 48px rgba(0,0,0,.55)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button type="button" onClick={() => shiftMonth(-1)} style={navBtn} aria-label="prev">
                <ChevronLeft size={16} />
              </button>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{monthLabel}</div>
              <button type="button" onClick={() => shiftMonth(1)} style={navBtn} aria-label="next">
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => { const t = new Date(); pick(t); }}
              style={{
                width: "100%", padding: "6px 10px", marginBottom: 10,
                borderRadius: 8, border: "none", cursor: "pointer",
                background: "var(--grad-blue, linear-gradient(135deg,#1D9BF0,#0F6BB8))",
                color: "#fff", fontWeight: 700, fontSize: 12,
              }}
            >{l ? "اليوم" : "Today"}</button>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
              {weekdays.map((w) => (
                <div key={w} style={{
                  textAlign: "center", fontSize: 10.5, fontWeight: 700,
                  color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5, padding: "4px 0",
                }}>{w}</div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
              {grid.map((d, i) => {
                if (!d) return <div key={i} />;
                const iso = toISO(d);
                const isSel = value === iso;
                const isToday = d.getTime() === today.getTime();
                const disabled = !!(minDate && d < minDate);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(d)}
                    style={{
                      aspectRatio: "1", borderRadius: 8, border: "none",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? .3 : 1,
                      background: isSel
                        ? "var(--grad-blue, linear-gradient(135deg,#1D9BF0,#0F6BB8))"
                        : "transparent",
                      color: isSel ? "#fff" : "var(--foreground)",
                      fontSize: 12.5, fontWeight: isSel ? 800 : 600,
                      boxShadow: !isSel && isToday ? "inset 0 0 0 1.5px #F0B429" : "none",
                      transition: "background .15s",
                    }}
                    onMouseEnter={(e) => { if (!isSel && !disabled) e.currentTarget.style.background = "var(--surface-3, #13283D)"; }}
                    onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  >{toLocalDigits(d.getDate(), lang)}</button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  background: "var(--surface-2, #13283D)", color: "var(--foreground)",
  border: "1px solid var(--border, #1E364D)", cursor: "pointer",
  display: "grid", placeItems: "center",
};
