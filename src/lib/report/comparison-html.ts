// Head-to-head comparison PDF — side-by-side dashboard cards, A on the left,
// B on the right, with matching rows so differences read at a glance.

import type { KpiSnapshot } from "./snapshot";
import type { ReportLangChoice } from "./generator";
import logo from "@/assets/mechatro-logo.png";
import { P, CARD_STYLE, esc, card, cardHeader, block } from "./pdf-chrome";

function fmtISODate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function delta(a: number, b: number, higherIsBetter: boolean, suffix = ""): string {
  const diff = b - a;
  if (diff === 0) return `<span style="color:${P.muted};font-weight:700">= 0${suffix}</span>`;
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  const color = positive ? P.green : P.red;
  const arrow = diff > 0 ? "▲" : "▼";
  const abs = Math.abs(diff);
  const pctChange = a === 0 ? "" : ` (${Math.round((diff / Math.abs(a)) * 100)}%)`;
  return `<span style="color:${color};font-weight:800">${arrow} ${abs}${suffix}${pctChange}</span>`;
}

// ---------- Cover ----------
function coverPage(a: KpiSnapshot, b: KpiSnapshot, meta: { labelA: string; labelB: string; generated_by: string }): string {
  const dateA = `${fmtISODate(a.range.from)} → ${fmtISODate(a.range.to)}`;
  const dateB = `${fmtISODate(b.range.from)} → ${fmtISODate(b.range.to)}`;
  const memberCard = (label: string, name: string, sub: string, rng: string, accent: string) => `
    <div style="${CARD_STYLE};padding:24px;border-top:4px solid ${accent}">
      <div style="font-size:10px;letter-spacing:2.5px;font-weight:900;color:${accent};text-transform:uppercase">${esc(label)}</div>
      <div style="font-size:24px;font-weight:900;color:${P.ink};margin-top:8px;line-height:1.15;letter-spacing:-.3px">${esc(name)}</div>
      <div style="font-size:12px;color:${P.muted};margin-top:6px">${esc(sub)}</div>
      <div style="font-size:10.5px;color:${P.ink2};margin-top:14px;letter-spacing:.5px;background:${P.soft};padding:6px 10px;border-radius:8px;display:inline-block">${esc(rng)}</div>
    </div>`;

  return `
  <section class="pdf-page cover" style="background:${P.page};color:${P.ink};position:relative;overflow:hidden;padding:56px 48px 44px 48px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px">
      <img src="${logo}" style="height:48px;object-fit:contain"/>
      <div style="text-align:right;font-size:10px;color:${P.muted};letter-spacing:1px;line-height:1.6">
        <div>${esc(new Date().toISOString().slice(0, 10))}</div>
        <div>Head-to-head</div>
      </div>
    </div>

    <div style="width:56px;height:4px;background:${P.gold};border-radius:2px;margin-bottom:22px"></div>

    <div style="${CARD_STYLE};padding:32px;margin-bottom:22px">
      <div style="font-size:11px;color:${P.muted};letter-spacing:3px;font-weight:700;margin-bottom:10px">MECHATRO · COMPARISON REPORT · تقرير مقارنة</div>
      <div style="font-size:48px;font-weight:900;line-height:1.02;letter-spacing:-1.5px;color:${P.ink}">Head-to-Head</div>
      <div dir="rtl" style="font-size:22px;color:${P.muted};margin-top:10px;font-family:'Montserrat Arabic','Cairo',sans-serif">مقارنة الأداء وجهاً لوجه</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;margin-bottom:22px">
      ${memberCard("Report A", a.member.full_name, meta.labelA, dateA, P.cyan)}
      <div style="font-size:36px;font-weight:900;color:${P.gold};text-align:center">⇄</div>
      ${memberCard("Report B", b.member.full_name, meta.labelB, dateB, P.gold)}
    </div>

    <div style="${CARD_STYLE};padding:16px 22px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${P.muted}">
      <div style="display:flex;align-items:center;gap:8px">
        <img src="${logo}" style="height:16px;object-fit:contain;opacity:.9"/>
        <span>mechatro @ mechatro.hub4tech.net</span>
      </div>
      <div>By ${esc(meta.generated_by)}</div>
    </div>
  </section>`;
}

// ---------- KPI comparison row (side-by-side) ----------
function kpiCompareRow(labelEn: string, labelAr: string, a: number, b: number, higherIsBetter: boolean, suffix = ""): string {
  const aBetter = higherIsBetter ? a > b : a < b;
  const bBetter = higherIsBetter ? b > a : b < a;
  const cellStyle = (winner: boolean) =>
    `text-align:center;font-size:22px;font-weight:900;color:${P.ink};padding:12px 14px;border-radius:10px;` +
    (winner ? `background:${P.gold}22;border:2px solid ${P.gold}` : `background:${P.soft};border:2px solid ${P.line}`);
  return `<div style="display:grid;grid-template-columns:1fr 1fr 90px 1fr;gap:10px;align-items:center;padding:6px 0">
    <div style="font-size:12.5px;color:${P.ink2};font-weight:700">
      <div>${esc(labelEn)}</div>
      <div dir="rtl" style="font-size:11px;color:${P.muted};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(labelAr)}</div>
    </div>
    <div style="${cellStyle(aBetter)}">${a}${suffix}</div>
    <div style="text-align:center;font-size:12px">${delta(a, b, higherIsBetter, suffix)}</div>
    <div style="${cellStyle(bBetter)}">${b}${suffix}</div>
  </div>`;
}

// ---------- Side-by-side status bars ----------
function statusBars(a: Record<string, number>, b: Record<string, number>): string {
  const keys: Array<[string, string, string]> = [
    ["done", "Done", "منجزة"],
    ["in_progress", "In progress", "قيد التنفيذ"],
    ["todo", "To do", "لم تبدأ"],
    ["paused", "Paused", "متوقفة"],
  ];
  const max = Math.max(1, ...keys.flatMap(([k]) => [a[k] ?? 0, b[k] ?? 0]));
  return `<div style="display:flex;flex-direction:column;gap:16px">
    ${keys.map(([k, en, ar]) => {
      const av = a[k] ?? 0, bv = b[k] ?? 0;
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:${P.muted};font-weight:700;margin-bottom:6px">
          <span>${esc(en)}</span>
          <span dir="rtl" style="font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(ar)}</span>
        </div>
        <div style="display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:center;margin-bottom:5px">
          <div style="text-align:right;font-size:12px;font-weight:800;color:${P.cyan}">A · ${av}</div>
          <div style="height:12px;background:${P.soft};border-radius:6px;overflow:hidden">
            <div style="width:${(av / max) * 100}%;height:100%;background:${P.cyan}"></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:center">
          <div style="text-align:right;font-size:12px;font-weight:800;color:${P.gold}">B · ${bv}</div>
          <div style="height:12px;background:${P.soft};border-radius:6px;overflow:hidden">
            <div style="width:${(bv / max) * 100}%;height:100%;background:${P.gold}"></div>
          </div>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

// ---------- Projects venn (3 cols) ----------
function projectVenn(a: KpiSnapshot["projects_touched"], b: KpiSnapshot["projects_touched"]): string {
  const aIds = new Set(a.map((p) => p.id));
  const bIds = new Set(b.map((p) => p.id));
  const onlyA = a.filter((p) => !bIds.has(p.id));
  const onlyB = b.filter((p) => !aIds.has(p.id));
  const both = a.filter((p) => bIds.has(p.id));
  const list = (arr: KpiSnapshot["projects_touched"], color: string) => arr.length === 0
    ? `<div style="color:${P.muted};font-size:12px">—</div>`
    : arr.map((p) => `<div style="padding:8px 12px;background:${P.soft};border-inline-start:3px solid ${color};border-radius:6px;font-size:12px;font-weight:700;color:${P.ink};margin-bottom:6px;display:flex;justify-content:space-between;gap:8px">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name_en)}</span>
        <span style="color:${P.muted};font-weight:700">${p.tasks}</span>
      </div>`).join("");
  return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
    <div><div style="font-size:10.5px;font-weight:900;color:${P.cyan};margin-bottom:10px;letter-spacing:1.5px">ONLY IN A · A فقط</div>${list(onlyA, P.cyan)}</div>
    <div><div style="font-size:10.5px;font-weight:900;color:${P.ink};margin-bottom:10px;letter-spacing:1.5px">SHARED · مشترك</div>${list(both, P.ink)}</div>
    <div><div style="font-size:10.5px;font-weight:900;color:${P.gold};margin-bottom:10px;letter-spacing:1.5px">ONLY IN B · B فقط</div>${list(onlyB, P.gold)}</div>
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
  void meta.language;
  const cover = coverPage(a, b, meta);

  // KPI comparison card
  const kpiHeader = `<div style="display:grid;grid-template-columns:1fr 1fr 90px 1fr;gap:10px;padding:6px 0 12px 0;border-bottom:1px solid ${P.line};margin-bottom:8px">
    <div style="font-size:10px;letter-spacing:1.5px;font-weight:800;color:${P.muted};text-transform:uppercase">Metric · المؤشر</div>
    <div style="text-align:center;font-size:11px;color:${P.cyan};font-weight:900;letter-spacing:1px">A · ${esc(a.member.full_name)}</div>
    <div style="text-align:center;font-size:10px;color:${P.muted};font-weight:800">Δ</div>
    <div style="text-align:center;font-size:11px;color:${P.gold};font-weight:900;letter-spacing:1px">B · ${esc(b.member.full_name)}</div>
  </div>`;
  const kpiRows = [
    kpiCompareRow("Total tasks", "إجمالي المهام", a.totals.tasks, b.totals.tasks, true),
    kpiCompareRow("Completed", "منجزة", a.totals.done, b.totals.done, true),
    kpiCompareRow("Completion %", "نسبة الإنجاز", a.totals.completion_pct, b.totals.completion_pct, true, "%"),
    kpiCompareRow("On-time %", "الالتزام بالموعد", a.totals.on_time_pct, b.totals.on_time_pct, true, "%"),
    kpiCompareRow("Overdue", "متأخرة", a.totals.overdue, b.totals.overdue, false),
    kpiCompareRow("Avg completion (h)", "متوسط الإنجاز (س)", a.totals.avg_completion_hours, b.totals.avg_completion_hours, false),
    kpiCompareRow("Points", "النقاط", a.totals.points, b.totals.points, true),
    kpiCompareRow("Rank", "الترتيب", a.totals.rank_position, b.totals.rank_position, false),
    kpiCompareRow("Sessions", "الجلسات", a.totals.sessions, b.totals.sessions, true),
    kpiCompareRow(
      "Hours logged", "الساعات المسجلة",
      Math.round(a.totals.total_minutes / 60), Math.round(b.totals.total_minutes / 60), true,
    ),
  ].join("");
  const kpiCard = card(
    cardHeader(P.cyan, "%", "Key indicators", "المؤشرات الرئيسية") +
    kpiHeader + kpiRows +
    `<div style="margin-top:14px;padding:10px 12px;background:${P.gold}14;border:1px solid ${P.gold}44;border-radius:8px;font-size:11px;color:${P.ink2}">
      <b style="color:${P.gold}">◆</b> Gold outline marks the winner for each metric.
      <span dir="rtl" style="font-family:'Montserrat Arabic','Cairo',sans-serif">الإطار الذهبي يشير إلى الأفضل في كل مؤشر.</span>
    </div>`
  );

  const statusCard = card(
    cardHeader(P.purple, "◐", "Status distribution", "توزيع الحالات") +
    statusBars(a.status_dist, b.status_dist)
  );

  const projectsCard = card(
    cardHeader(P.orange, "▤", "Projects touched", "المشاريع المشمولة") +
    projectVenn(a.projects_touched, b.projects_touched)
  );

  return cover + [kpiCard, statusCard, projectsCard].map(block).join("");
}
