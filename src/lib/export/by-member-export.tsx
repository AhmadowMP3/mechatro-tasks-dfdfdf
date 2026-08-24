// Exports for the "By member" tasks board — branded dark PDF (browser print,
// correct Arabic shaping) and branded Excel sheet, matching the rest of the app.

import { printReactDocument } from "@/lib/pdf/print-document";
import { exportToBrandedXlsx } from "@/lib/export/xlsx";
import logoUrl from "@/assets/mechatro-logo.png";
import type { Lang } from "@/i18n/dict";
import type { MemberGroup, MemberProject } from "@/components/tasks/MemberBoard";

const C = {
  page: "#081320",
  navy: "#0F2031",
  surface2: "#13283D",
  blue: "#42C2EE",
  gold: "#D4A017",
  ink: "#E6EEF7",
  muted: "#94A3B8",
  border: "#1E3A57",
  zebra: "#0B1A2A",
  green: "#73C94E",
  red: "#EF4444",
};

const A4_WIDTH_PX = 794;
const STATUSES = ["todo", "in_progress", "paused", "in_review", "done"] as const;

export type ByMemberExportInput = {
  groups: MemberGroup[];
  projects: MemberProject[];
  lang: Lang;
  title: string;
  subtitle?: string;
  filtersSummary?: string;
  generatedBy?: string;
  /** Localised labels for statuses/priorities/columns. */
  labels: Record<string, string>;
};

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function projectName(projects: MemberProject[], id: string | null, lang: Lang): string {
  if (!id) return "—";
  const p = projects.find((x) => x.id === id);
  if (!p) return "—";
  return (lang === "ar" ? p.name_ar : p.name_en) || p.name_en || p.name_ar || "—";
}

/* ------------------------------- PDF ------------------------------- */

function ByMemberDocument({ groups, projects, lang, title, subtitle, filtersSummary, generatedBy, labels }: ByMemberExportInput) {
  const ar = lang === "ar";
  const generatedAt = new Date().toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-GB");
  const totalTasks = groups.reduce((s, g) => s + g.tasks.length, 0);
  const totalOverdue = groups.reduce((s, g) => s + g.overdue, 0);
  const totalPoints = groups.reduce((s, g) => s + g.points, 0);

  return (
    <div style={{
      width: A4_WIDTH_PX,
      background: C.page,
      color: C.ink,
      fontFamily: ar
        ? "'Montserrat Arabic', 'Almarai', 'Segoe UI', sans-serif"
        : "'Montserrat', 'Montserrat Arabic', system-ui, sans-serif",
      padding: "36px 40px 40px",
      direction: ar ? "rtl" : "ltr",
      fontSize: 12,
      lineHeight: 1.55,
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>
            {subtitle ?? (ar ? "تقرير المهام" : "Tasks Report")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.4 }}>{title}</div>
          {filtersSummary && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{filtersSummary}</div>}
          <div style={{ width: 60, height: 5, background: C.blue, borderRadius: 3, marginTop: 8 }} />
        </div>
        <div style={{ textAlign: ar ? "left" : "right", fontSize: 10.5, color: C.muted, lineHeight: 1.7 }}>
          <img src={logoUrl} alt="Mechatro" style={{ height: 34, objectFit: "contain", marginBottom: 6 }} />
          <div>{ar ? "أُنشئ" : "Generated"}: {generatedAt}</div>
          {generatedBy && <div>{ar ? "بواسطة" : "By"}: {generatedBy}</div>}
        </div>
      </div>

      <div style={{ height: 1, background: `linear-gradient(90deg, ${C.blue}, transparent)`, marginBottom: 16 }} />

      {/* Overall KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        {[
          { label: labels.members, value: String(groups.length), tone: C.blue },
          { label: labels.tasks, value: String(totalTasks), tone: C.ink },
          { label: labels.overdue, value: String(totalOverdue), tone: totalOverdue ? C.red : C.green },
          { label: labels.points, value: String(totalPoints), tone: C.gold },
        ].map((k) => (
          <div key={k.label} style={{
            flex: 1, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px",
          }}>
            <div style={{ fontSize: 9.5, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{k.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: k.tone }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Per-member sections */}
      {groups.map((g) => (
        <section key={g.id} className="avoid-break" style={{
          background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 14, marginBottom: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{g.name}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: C.muted, fontWeight: 700 }}>
              <span>{labels.tasks}: <b style={{ color: C.ink }}>{g.tasks.length}</b></span>
              <span>{labels.overdue}: <b style={{ color: g.overdue ? C.red : C.green }}>{g.overdue}</b></span>
              <span>{labels.completionRate}: <b style={{ color: C.green }}>{g.completionRate}%</b></span>
              <span>{labels.points}: <b style={{ color: C.gold }}>{g.points}</b></span>
              <span>{labels.loggedHours}: <b style={{ color: C.blue }}>{g.hours}</b></span>
            </div>
          </div>

          {/* Status breakdown */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {STATUSES.map((s) => (g.counts[s] ? (
              <span key={s} style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: C.surface2, color: C.blue, border: `1px solid ${C.border}`,
              }}>{labels[s] ?? s}: {g.counts[s]}</span>
            ) : null))}
          </div>

          {g.tasks.length === 0 ? (
            <div style={{ fontSize: 11, color: C.muted }}>—</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {[labels.task, labels.project, labels.status, labels.priority, labels.dueDate, labels.points].map((h, i) => (
                    <th key={h + i} style={{
                      textAlign: ar ? "right" : "left", padding: "6px 8px", color: C.muted,
                      fontWeight: 800, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.tasks.map((tk, i) => (
                  <tr key={tk.id} style={{ background: i % 2 ? C.zebra : "transparent" }}>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>{tk.title}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>{projectName(projects, tk.project_id, lang)}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>{labels[tk.status] ?? tk.status}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>{labels[tk.priority] ?? tk.priority}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, color: C.muted, whiteSpace: "nowrap" }}>{tk.due_date ?? "—"}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, color: C.gold, fontWeight: 700 }}>{tk.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}

export async function exportByMemberPdf(input: ByMemberExportInput): Promise<void> {
  const title = `tasks-by-member_${stamp()}`;
  await printReactDocument(<ByMemberDocument {...input} />, {
    title,
    lang: input.lang,
    share: { kind: "by_member_report", refId: title, title },
  });
}

/* ------------------------------ Excel ------------------------------ */

type FlatRow = {
  member: string;
  title: string;
  project: string;
  status: string;
  priority: string;
  due: string;
  points: number;
  progress: number;
};

export async function exportByMemberXlsx(input: ByMemberExportInput): Promise<void> {
  const { groups, projects, lang, labels } = input;
  const rows: FlatRow[] = [];
  for (const g of groups) {
    for (const tk of g.tasks) {
      rows.push({
        member: g.name,
        title: tk.title,
        project: projectName(projects, tk.project_id, lang),
        status: tk.status,
        priority: tk.priority,
        due: tk.due_date ?? "",
        points: tk.points ?? 0,
        progress: tk.progress ?? 0,
      });
    }
  }

  await exportToBrandedXlsx<FlatRow>({
    sheetName: labels.byMemberReport ?? "By member",
    title: input.title,
    subtitle: input.subtitle,
    filtersSummary: input.filtersSummary,
    generatedBy: input.generatedBy,
    lang,
    rows,
    fileName: `tasks-by-member_${stamp()}.xlsx`,
    columns: [
      { key: "member", header: labels.member ?? "Member", width: 24, get: (r) => r.member },
      { key: "title", header: labels.task, width: 42, get: (r) => r.title },
      { key: "project", header: labels.project, width: 24, get: (r) => r.project },
      { key: "status", header: labels.status, width: 16, kind: "status", get: (r) => r.status },
      { key: "priority", header: labels.priority, width: 14, kind: "priority", get: (r) => r.priority },
      { key: "due", header: labels.dueDate, width: 14, kind: "date", get: (r) => (r.due ? new Date(r.due) : null) },
      { key: "progress", header: labels.progress ?? "%", width: 12, kind: "percent", get: (r) => r.progress },
      { key: "points", header: labels.points, width: 12, kind: "number", get: (r) => r.points },
    ],
  });
}
