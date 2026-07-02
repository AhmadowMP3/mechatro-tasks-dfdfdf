import type { KpiSnapshot } from "./snapshot";
import type { ReportLangChoice } from "./generator";
import logo from "@/assets/mechatro-logo.png";

const BLUE = "#0F5FFF";
const GOLD = "#F5B301";
const INK = "#0F1B2D";
const MUTED = "#5F708A";
const BG = "#F5F8FC";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function pct(v: number): string { return `${v}%`; }

function deltaChip(a: number, b: number, higherIsBetter = true, suffix = ""): string {
  const diff = b - a;
  if (diff === 0) return `<span style="color:${MUTED};font-weight:700">= 0${suffix}</span>`;
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  const color = positive ? "#12B76A" : "#F04438";
  const arrow = diff > 0 ? "▲" : "▼";
  const abs = Math.abs(diff);
  const pctChange = a === 0 ? "" : ` (${Math.round((diff / Math.abs(a)) * 100)}%)`;
  return `<span style="color:${color};font-weight:800">${arrow} ${abs}${suffix}${pctChange}</span>`;
}

function kpiRow(label: string, a: number, b: number, higherIsBetter = true, suffix = ""): string {
  const aBetter = higherIsBetter ? a > b : a < b;
  const bBetter = higherIsBetter ? b > a : b < a;
  const cell = (val: number, winner: boolean) => `<td style="padding:12px 14px;text-align:center;font-size:20px;font-weight:800;color:${INK};background:${winner ? "rgba(245,179,1,.15)" : "transparent"};border:${winner ? `2px solid ${GOLD}` : "1px solid #E4EAF2"};border-radius:8px">${val}${suffix}</td>`;
  return `<tr>
    <td style="padding:12px 14px;font-size:13px;color:${MUTED};font-weight:700">${label}</td>
    ${cell(a, aBetter)}
    <td style="padding:12px 14px;text-align:center">${deltaChip(a, b, higherIsBetter, suffix)}</td>
    ${cell(b, bBetter)}
  </tr>`;
}

function statusBars(a: Record<string, number>, b: Record<string, number>, labels: Record<string, string>): string {
  const keys = ["done", "in_progress", "todo", "paused"];
  const max = Math.max(1, ...keys.flatMap((k) => [a[k] ?? 0, b[k] ?? 0]));
  return `<div style="display:flex;flex-direction:column;gap:14px">
    ${keys.map((k) => {
      const av = a[k] ?? 0, bv = b[k] ?? 0;
      return `<div>
        <div style="font-size:12px;color:${MUTED};font-weight:700;margin-bottom:6px">${labels[k] || k}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <div style="width:60px;text-align:right;font-size:13px;font-weight:700;color:${BLUE}">A: ${av}</div>
          <div style="flex:1;height:14px;background:#EEF2F7;border-radius:7px;overflow:hidden;position:relative">
            <div style="width:${(av / max) * 100}%;height:100%;background:${BLUE};border-radius:7px"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
          <div style="width:60px;text-align:right;font-size:13px;font-weight:700;color:${GOLD}">B: ${bv}</div>
          <div style="flex:1;height:14px;background:#EEF2F7;border-radius:7px;overflow:hidden">
            <div style="width:${(bv / max) * 100}%;height:100%;background:${GOLD};border-radius:7px"></div>
          </div>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function projectVenn(a: KpiSnapshot["projects_touched"], b: KpiSnapshot["projects_touched"]): string {
  const aIds = new Set(a.map((p) => p.id));
  const bIds = new Set(b.map((p) => p.id));
  const onlyA = a.filter((p) => !bIds.has(p.id));
  const onlyB = b.filter((p) => !aIds.has(p.id));
  const both = a.filter((p) => bIds.has(p.id));
  const list = (arr: KpiSnapshot["projects_touched"], color: string) => arr.length === 0
    ? `<div style="color:${MUTED};font-size:12px">—</div>`
    : arr.map((p) => `<div style="padding:6px 10px;background:${color};border-radius:6px;font-size:12px;font-weight:700;color:${INK};margin-bottom:4px">${p.name_en} <span style="color:${MUTED};font-weight:600">· ${p.tasks}</span></div>`).join("");
  return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    <div><div style="font-size:11px;font-weight:800;color:${BLUE};margin-bottom:8px;letter-spacing:.5px">ONLY IN A</div>${list(onlyA, "rgba(15,95,255,.08)")}</div>
    <div><div style="font-size:11px;font-weight:800;color:${INK};margin-bottom:8px;letter-spacing:.5px">SHARED</div>${list(both, "rgba(15,27,45,.06)")}</div>
    <div><div style="font-size:11px;font-weight:800;color:${GOLD};margin-bottom:8px;letter-spacing:.5px">ONLY IN B</div>${list(onlyB, "rgba(245,179,1,.12)")}</div>
  </div>`;
}

export function buildComparisonHtml(
  a: KpiSnapshot,
  b: KpiSnapshot,
  meta: {
    labelA: string; labelB: string;
    generated_by: string;
    language: ReportLangChoice;
  }
): string {
  const isAr = meta.language === "ar";
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const dir = isAr ? "rtl" : "ltr";
  const font = "'Montserrat','Segoe UI',Tahoma,Arial,sans-serif";
  const statusLabels: Record<string, string> = {
    done: t("Done", "مكتملة"),
    in_progress: t("In progress", "قيد التنفيذ"),
    todo: t("To do", "لم تبدأ"),
    paused: t("Paused", "متوقفة"),
  };

  const cover = `<div class="pdf-page" dir="${dir}" style="padding:56px 60px;background:linear-gradient(135deg,#0A1A2B 0%,#0F5FFF 100%);color:#fff;font-family:${font};position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 90% 10%, rgba(245,179,1,.25), transparent 40%)"></div>
    <div style="position:relative;z-index:1">
      <img src="${logo}" style="height:56px;margin-bottom:32px" />
      <div style="font-size:13px;letter-spacing:3px;color:${GOLD};font-weight:800;text-transform:uppercase">${t("Comparison Report", "تقرير مقارنة")}</div>
      <h1 style="font-size:44px;font-weight:900;margin:12px 0 40px;line-height:1.1">${t("Head-to-head Performance", "مقارنة الأداء وجهاً لوجه")}</h1>

      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:center;margin-top:60px">
        <div style="background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border-radius:20px;padding:28px;border:2px solid rgba(15,95,255,.4)">
          <div style="font-size:11px;letter-spacing:2px;font-weight:800;color:${GOLD}">REPORT A</div>
          <div style="font-size:26px;font-weight:900;margin:8px 0 4px">${a.member.full_name}</div>
          <div style="font-size:13px;opacity:.8">${meta.labelA}</div>
          <div style="margin-top:18px;font-size:12px;opacity:.7">${fmtDate(a.range.from)} → ${fmtDate(a.range.to)}</div>
        </div>
        <div style="font-size:48px;font-weight:900;color:${GOLD}">⇄</div>
        <div style="background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border-radius:20px;padding:28px;border:2px solid rgba(245,179,1,.4)">
          <div style="font-size:11px;letter-spacing:2px;font-weight:800;color:${GOLD}">REPORT B</div>
          <div style="font-size:26px;font-weight:900;margin:8px 0 4px">${b.member.full_name}</div>
          <div style="font-size:13px;opacity:.8">${meta.labelB}</div>
          <div style="margin-top:18px;font-size:12px;opacity:.7">${fmtDate(b.range.from)} → ${fmtDate(b.range.to)}</div>
        </div>
      </div>

      <div style="position:absolute;bottom:60px;left:60px;right:60px;display:flex;justify-content:space-between;font-size:11px;opacity:.7">
        <div>${t("Generated by", "أنشئ بواسطة")}: ${meta.generated_by}</div>
        <div>${new Date().toISOString().slice(0, 10)}</div>
      </div>
    </div>
  </div>`;

  const kpis = `<div class="pdf-page" dir="${dir}" style="padding:48px 56px;background:${BG};color:${INK};font-family:${font}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:26px;font-weight:900;margin:0">${t("Key Performance Indicators", "مؤشرات الأداء الرئيسية")}</h2>
      <div style="font-size:11px;color:${MUTED};font-weight:700;letter-spacing:1px">MECHATRO</div>
    </div>
    <table style="width:100%;border-collapse:separate;border-spacing:0 6px">
      <thead><tr>
        <th></th>
        <th style="padding:10px;font-size:12px;color:${BLUE};text-align:center;font-weight:900;letter-spacing:1px">A · ${a.member.full_name}</th>
        <th style="padding:10px;font-size:12px;color:${MUTED};text-align:center;font-weight:800;letter-spacing:1px">Δ</th>
        <th style="padding:10px;font-size:12px;color:${GOLD};text-align:center;font-weight:900;letter-spacing:1px">B · ${b.member.full_name}</th>
      </tr></thead>
      <tbody>
        ${kpiRow(t("Total tasks", "إجمالي المهام"), a.totals.tasks, b.totals.tasks)}
        ${kpiRow(t("Completed", "منجزة"), a.totals.done, b.totals.done)}
        ${kpiRow(t("Completion %", "نسبة الإنجاز"), a.totals.completion_pct, b.totals.completion_pct, true, "%")}
        ${kpiRow(t("On-time %", "الالتزام بالموعد"), a.totals.on_time_pct, b.totals.on_time_pct, true, "%")}
        ${kpiRow(t("Overdue", "متأخرة"), a.totals.overdue, b.totals.overdue, false)}
        ${kpiRow(t("Avg completion (h)", "متوسط الإنجاز (س)"), a.totals.avg_completion_hours, b.totals.avg_completion_hours, false)}
        ${kpiRow(t("Points", "النقاط"), a.totals.points, b.totals.points)}
        ${kpiRow(t("Rank", "الترتيب"), a.totals.rank_position, b.totals.rank_position, false)}
        ${kpiRow(t("Sessions", "الجلسات"), a.totals.sessions, b.totals.sessions)}
        ${kpiRow(t("Hours logged", "الساعات المسجلة"), Math.round(a.totals.total_minutes / 60), Math.round(b.totals.total_minutes / 60))}
      </tbody>
    </table>
    <div style="margin-top:24px;padding:14px;background:#fff;border:1px solid #E4EAF2;border-radius:12px;font-size:12px;color:${MUTED}">
      <strong style="color:${GOLD}">◆</strong> ${t("Cells outlined in gold indicate the winning value for that metric.", "الخلايا المحاطة بإطار ذهبي تدل على الأفضل في ذلك المؤشر.")}
    </div>
  </div>`;

  const charts = `<div class="pdf-page" dir="${dir}" style="padding:48px 56px;background:#fff;color:${INK};font-family:${font}">
    <h2 style="font-size:24px;font-weight:900;margin:0 0 24px">${t("Status Distribution", "توزيع حالات المهام")}</h2>
    ${statusBars(a.status_dist, b.status_dist, statusLabels)}
    <h2 style="font-size:24px;font-weight:900;margin:36px 0 16px">${t("Projects touched", "المشاريع المشمولة")}</h2>
    ${projectVenn(a.projects_touched, b.projects_touched)}
  </div>`;

  return `<div>${cover}${kpis}${charts}</div>`;
}
