import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp, type Profile } from "@/lib/app-context";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { toLocalDigits, isOverdue } from "@/lib/format";
import type { TaskRow } from "@/components/TaskCard";
import type { DictKey } from "@/i18n/dict";

type Project = { id: string; name_ar: string; name_en: string; color: string };

const DOW_KEYS: DictKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export function CalendarView({
  tasks, projects, users, onOpen,
}: {
  tasks: TaskRow[];
  projects: Project[];
  users: Profile[];
  onOpen: (id: string) => void;
}) {
  const { t, lang } = useApp();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const { cells, undated } = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const startPad = first.getDay(); // 0 = Sun
    const totalDays = last.getDate();
    const totalCells = Math.ceil((startPad + totalDays) / 7) * 7;
    const map = new Map<string, TaskRow[]>();
    const undatedArr: TaskRow[] = [];
    for (const tk of tasks) {
      if (!tk.due_date) { undatedArr.push(tk); continue; }
      const k = tk.due_date.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(tk);
      map.set(k, arr);
    }
    const cells: { date: Date | null; inMonth: boolean; tasks: TaskRow[] }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startPad + 1;
      if (dayNum < 1 || dayNum > totalDays) {
        cells.push({ date: null, inMonth: false, tasks: [] });
      } else {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), dayNum);
        cells.push({ date: d, inMonth: true, tasks: map.get(ymd(d)) ?? [] });
      }
    }
    return { cells, undated: undatedArr };
  }, [cursor, tasks]);

  const monthLabel = cursor.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric" });
  const todayKey = ymd(new Date());

  const TaskChip = ({ tk }: { tk: TaskRow }) => {
    const project = projects.find((p) => p.id === tk.project_id);
    const assignee = users.find((u) => u.id === tk.assignee_id);
    const overdue = isOverdue(tk.due_date, tk.status);
    const bg = project ? (PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue) : "var(--surface-3)";
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(tk.id); }}
        title={tk.title + (assignee ? ` — ${assignee.full_name}` : "")}
        style={{
          display: "block", width: "100%", textAlign: lang === "ar" ? "right" : "left",
          padding: "3px 6px", borderRadius: 6, border: "none", cursor: "pointer",
          background: bg, color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          opacity: tk.status === "done" ? 0.55 : 1,
          textDecoration: tk.status === "done" ? "line-through" : "none",
          outline: overdue ? "1.5px solid #F0676A" : "none",
        }}
      >
        {tk.title}
      </button>
    );
  };

  return (
    <div className="brand-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={navBtn} aria-label="prev">
          <ChevronLeft size={18} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1, textAlign: "center", textTransform: "capitalize" }}>
          {monthLabel}
        </h2>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={navBtn} aria-label="next">
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() => setCursor(startOfMonth(new Date()))}
          style={{ ...navBtn, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 700 }}
        >
          {t("today")}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {DOW_KEYS.map((k) => (
          <div key={k} style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t(k)}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {cells.map((cell, i) => {
          const key = cell.date ? ymd(cell.date) : `pad-${i}`;
          const isToday = cell.date && ymd(cell.date) === todayKey;
          const shown = cell.tasks.slice(0, 3);
          const extra = cell.tasks.length - shown.length;
          return (
            <div
              key={key}
              style={{
                minHeight: 96,
                padding: 6,
                borderRadius: 10,
                background: cell.inMonth ? "var(--surface-2)" : "transparent",
                border: `1px solid ${isToday ? "var(--primary,#189FD1)" : "var(--border)"}`,
                opacity: cell.inMonth ? 1 : 0.35,
                display: "flex", flexDirection: "column", gap: 4,
                boxShadow: isToday ? "0 0 0 2px color-mix(in oklab, #189FD1 30%, transparent) inset" : undefined,
              }}
            >
              {cell.date && (
                <div style={{
                  fontSize: 11, fontWeight: 800,
                  color: isToday ? "#42C2EE" : "var(--muted)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span>{toLocalDigits(cell.date.getDate(), lang)}</span>
                  {cell.tasks.length > 0 && (
                    <span style={{
                      background: "var(--surface-3)", color: "var(--foreground)",
                      padding: "1px 6px", borderRadius: 999, fontSize: 10,
                    }}>
                      {toLocalDigits(cell.tasks.length, lang)}
                    </span>
                  )}
                </div>
              )}
              {shown.map((tk) => <TaskChip key={tk.id} tk={tk} />)}
              {extra > 0 && (
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
                  +{toLocalDigits(extra, lang)} {t("moreTasks")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("noDueDate")} · {toLocalDigits(undated.length, lang)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {undated.map((tk) => (
              <div key={tk.id} style={{ maxWidth: 220 }}><TaskChip tk={tk} /></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--foreground)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
