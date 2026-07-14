import type { ReportData } from "./data";
import { dict, type Lang } from "@/i18n/dict";
import logo from "@/assets/mechatro-logo.png";
import type { ThemeId } from "./themes";

/**
 * Single-style "Dashboard Card" report generator.
 * Locked palette, no theme picker for member reports. Cards render side-by-side
 * AR/EN (bilingual) or a single-column card (single language).
 */

// ---------- Locked palette ----------
const P = {
  page: "#F5F6F8",
  card: "#FFFFFF",
  ink: "#0B1220",
  ink2: "#334155",
  muted: "#64748B",
  line: "#E4E7EC",
  soft: "#F1F5F9",
  cyan: "#42C2EE",
  cyanDark: "#0EA5E9",
  gold: "#D4A017",
  green: "#16A34A",
  orange: "#F59E0B",
  red: "#DC2626",
  purple: "#8B5CF6",
  shadow: "0 1px 2px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.06)",
};
const STATUS_COLOR: Record<string, string> = { todo: P.muted, in_progress: P.cyan, paused: P.orange, in_review: P.purple, done: P.green };
const PRIO_COLOR: Record<string, string> = { low: P.muted, normal: P.cyan, high: P.orange, urgent: P.red };

// ---------- Helpers ----------
const t = (k: keyof typeof dict, lang: Lang) => dict[k]?.[lang] ?? String(k);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtDate = (iso: string | null, lang: Lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
};
const fmtDT = (iso: string | null, lang: Lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtMin = (n: number, lang: Lang) => {
  if (!n) return lang === "ar" ? "٠ س" : "0h";
  const h = Math.floor(n / 60); const m = n % 60;
  return lang === "ar" ? `${h} س ${m} د` : `${h}h ${m}m`;
};

const rangeLabel = (data: ReportData, lang: Lang) => {
  const r = data.range;
  if (!r.from) return t("rangeAll", lang);
  if (data.range.label === "7d") return t("rangeLast7d", lang);
  if (data.range.label === "30d") return t("rangeLast30d", lang);
  if (data.range.label === "90d") return t("rangeLast90d", lang);
  return `${fmtDate(r.from.toISOString(), lang)} — ${fmtDate((r.to ?? new Date()).toISOString(), lang)}`;
};

// ---------- Stats ----------
type Stats = ReturnType<typeof computeStats>;
function computeStats(data: ReportData) {
  const tasks = data.tasks;
  const byStatus = { todo: 0, in_progress: 0, paused: 0, in_review: 0, done: 0 } as Record<string, number>;
  const byPriority = { low: 0, normal: 0, high: 0, urgent: 0 } as Record<string, number>;
  const byProject: Record<string, number> = {};
  let overdue = 0, onTime = 0, completedCount = 0, totalDurationDays = 0;
  const now = new Date();
  const weeks: number[] = new Array(12).fill(0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 12 * 7);
  for (const x of tasks) {
    byStatus[x.status] = (byStatus[x.status] ?? 0) + 1;
    byPriority[x.priority] = (byPriority[x.priority] ?? 0) + 1;
    if (x.project_id) byProject[x.project_id] = (byProject[x.project_id] ?? 0) + 1;
    if (x.status !== "done" && x.due_date && new Date(x.due_date) < now) overdue++;
    if (x.completed_at) {
      completedCount++;
      if (x.due_date && new Date(x.completed_at) <= new Date(x.due_date + "T23:59:59")) onTime++;
      const start = x.start_date ? new Date(x.start_date) : new Date(x.created_at);
      const days = Math.max(0, (new Date(x.completed_at).getTime() - start.getTime()) / 864e5);
      totalDurationDays += days;
      const wk = Math.floor((new Date(x.completed_at).getTime() - weekStart.getTime()) / (7 * 864e5));
      if (wk >= 0 && wk < 12) weeks[wk]++;
    }
  }
  const totalMinutes = data.sessions.reduce((a, s) => a + (s.duration_minutes ?? 0), 0);
  const avgSessionMin = data.sessions.length ? Math.round(totalMinutes / data.sessions.length) : 0;
  return {
    total: tasks.length, byStatus, byPriority, byProject,
    overdue, onTime, completedCount,
    onTimePct: completedCount ? Math.round((onTime / completedCount) * 100) : 0,
    completionPct: tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0,
    avgDurationDays: completedCount ? +(totalDurationDays / completedCount).toFixed(1) : 0,
    totalMinutes, avgSessionMin, weeks,
  };
}

// ---------- SVG charts ----------
function donutSVG(entries: [string, number, string][], size = 180): string {
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 14, sw = 20;
  let acc = 0;
  const arcs = entries.filter(([, v]) => v > 0).map(([, v, color]) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    return `<path d="M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt"/>`;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${P.line}" stroke-width="${sw}"/>
    ${arcs}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="28" font-weight="800" fill="${P.ink}">${total}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="10" fill="${P.muted}" letter-spacing="2">TASKS</text>
  </svg>`;
}

function barsSVG(entries: [string, number, string][], width = 320, height = 200): string {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const pad = 28, labelH = 36, valH = 18;
  const chartH = height - pad - labelH - valH;
  const gap = 14;
  const bw = Math.min(48, (width - pad * 2 - gap * (entries.length - 1)) / Math.max(1, entries.length));
  const groupW = bw * entries.length + gap * Math.max(0, entries.length - 1);
  const startX = (width - groupW) / 2;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${pad}" y1="${pad + valH + chartH}" x2="${width - pad}" y2="${pad + valH + chartH}" stroke="${P.line}"/>
    ${entries.map(([label, v, color], i) => {
      const h = (v / max) * chartH;
      const x = startX + i * (bw + gap);
      const y = pad + valH + chartH - h;
      return `<g>
        <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="6" fill="${color}"/>
        <text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="800" fill="${P.ink}">${v}</text>
        <text x="${x + bw / 2}" y="${height - 10}" text-anchor="middle" font-size="10" fill="${P.muted}">${esc(String(label).slice(0, 14))}</text>
      </g>`;
    }).join("")}
  </svg>`;
}

function sparklineSVG(values: number[], width = 640, height = 130): string {
  const max = Math.max(1, ...values);
  const pad = 22; const w = width - pad * 2; const h = height - pad * 2;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${pad + i * step},${pad + h - (v / max) * h}`);
  const path = "M" + pts.join(" L");
  const area = `M${pad},${pad + h} L${pts.join(" L")} L${pad + w},${pad + h} Z`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${P.cyan}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${P.cyan}" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${pad}" y1="${pad + h}" x2="${pad + w}" y2="${pad + h}" stroke="${P.line}"/>
    <path d="${area}" fill="url(#sg)"/>
    <path d="${path}" fill="none" stroke="${P.cyanDark}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((v, i) => `<circle cx="${pad + i * step}" cy="${pad + h - (v / max) * h}" r="3" fill="${P.cyanDark}"/>`).join("")}
  </svg>`;
}

// ---------- Card primitives ----------
const CARD_STYLE = `background:${P.card};border:1px solid ${P.line};border-radius:16px;box-shadow:${P.shadow};padding:20px 22px;overflow:visible`;

function card(inner: string): string {
  return `<div style="${CARD_STYLE}">${inner}</div>`;
}

function cardHeader(iconBg: string, icon: string, titleEn: string, titleAr: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;overflow:visible">
    <div style="width:34px;height:34px;border-radius:10px;background:${iconBg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;flex:0 0 auto">${icon}</div>
    <div style="flex:1;min-width:0;line-height:1.35">
      <div style="font-size:14px;font-weight:800;color:${P.ink};letter-spacing:.5px;text-transform:uppercase">${esc(titleEn)}</div>
      <div dir="rtl" style="font-size:12.5px;color:${P.muted};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(titleAr)}</div>
    </div>
  </div>`;
}

/** Two-column bilingual body: EN on the left, AR on the right, hairline between. */
function bilingualBody(enHtml: string, arHtml: string): string {
  return `<div style="display:grid;grid-template-columns:1fr 1px 1fr;gap:20px;align-items:stretch">
    <div dir="ltr" lang="en" style="font-size:12.5px;color:${P.ink2};line-height:1.6">${enHtml}</div>
    <div style="background:${P.line};width:1px"></div>
    <div dir="rtl" lang="ar" style="font-size:12.5px;color:${P.ink2};line-height:1.7;font-family:'Montserrat Arabic','Cairo',sans-serif">${arHtml}</div>
  </div>`;
}

/** Single-column body when only one language is selected. */
function monoBody(html: string, lang: Lang): string {
  return `<div dir="${lang === "ar" ? "rtl" : "ltr"}" lang="${lang}" style="font-size:12.5px;color:${P.ink2};line-height:1.6${lang === "ar" ? ";font-family:'Montserrat Arabic','Cairo',sans-serif" : ""}">${html}</div>`;
}

// ---------- Cover page ----------
function coverPage(data: ReportData, s: Stats, lang: Lang): string {
  const m = data.member;
  const initials = m.full_name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const avatar = m.avatar_url
    ? `<img src="${esc(m.avatar_url)}" style="width:108px;height:108px;border-radius:50%;object-fit:cover;border:4px solid #fff;box-shadow:0 8px 24px rgba(15,23,42,.15)"/>`
    : `<div style="width:108px;height:108px;border-radius:50%;background:linear-gradient(135deg,${P.cyan},${P.cyanDark});display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:900;color:#fff;border:4px solid #fff;box-shadow:0 8px 24px rgba(15,23,42,.15)">${esc(initials)}</div>`;

  const kpis: [string, string, string, string][] = [
    ["TOTAL", "الإجمالي", String(s.total), P.cyan],
    ["DONE", "منجزة", s.completionPct + "%", P.green],
    ["ON-TIME", "في الموعد", s.onTimePct + "%", P.gold],
    ["HOURS", "ساعات", String(Math.round(s.totalMinutes / 60)), P.purple],
  ];

  return `
  <section class="pdf-page cover" style="background:${P.page};color:${P.ink};position:relative;overflow:hidden;padding:56px 48px 44px 48px;box-sizing:border-box">
    <!-- Header strip -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:44px">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="${logo}" style="width:38px;height:38px;object-fit:contain"/>
        <div>
          <div style="font-size:12px;font-weight:900;letter-spacing:5px;color:${P.ink}">MECHATRO</div>
          <div style="font-size:10px;color:${P.muted};letter-spacing:2px;margin-top:2px">MEMBER REPORT · تقرير العضو</div>
        </div>
      </div>
      <div style="text-align:right;font-size:10px;color:${P.muted};letter-spacing:1px;line-height:1.6">
        <div>${esc(fmtDate(new Date().toISOString(), "en"))}</div>
        <div>${esc(rangeLabel(data, "en"))}</div>
      </div>
    </div>

    <!-- Gold accent bar -->
    <div style="width:56px;height:4px;background:${P.gold};border-radius:2px;margin-bottom:24px"></div>

    <!-- Name card -->
    <div style="${CARD_STYLE};padding:32px;margin-bottom:22px">
      <div style="display:flex;align-items:center;gap:28px">
        ${avatar}
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:${P.muted};letter-spacing:3px;font-weight:700;margin-bottom:8px">MEMBER · العضو</div>
          <div style="font-size:52px;font-weight:900;line-height:1.02;letter-spacing:-1.5px;color:${P.ink};font-family:'Montserrat','Montserrat Arabic',sans-serif">${esc(m.full_name)}</div>
          ${m.job_title ? `<div style="font-size:15px;color:${P.muted};margin-top:10px;letter-spacing:.3px">${esc(m.job_title)}</div>` : ""}
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <span style="background:${P.gold};color:#111;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${esc(t(m.role as never, "en"))}</span>
            ${m.is_master_admin ? `<span style="background:${P.ink};color:#fff;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${esc(t("masterAdmin", "en"))}</span>` : ""}
            <span style="border:1.5px solid ${m.active ? P.green : P.line};color:${m.active ? P.green : P.muted};background:#fff;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${esc(m.active ? t("active", "en") : "Inactive")}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI grid -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px">
      ${kpis.map(([en, ar, val, col]) => `
        <div style="${CARD_STYLE};padding:22px 18px;border-top:4px solid ${col}">
          <div style="font-size:44px;font-weight:900;color:${P.ink};line-height:1;letter-spacing:-1.5px">${esc(val)}</div>
          <div style="font-size:10px;color:${P.muted};margin-top:12px;letter-spacing:2px;font-weight:800">${en}</div>
          <div dir="rtl" style="font-size:11px;color:${P.ink2};margin-top:3px;font-family:'Montserrat Arabic','Cairo',sans-serif">${ar}</div>
        </div>`).join("")}
    </div>

    <!-- Meta footer strip -->
    <div style="${CARD_STYLE};padding:16px 22px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${P.muted}">
      <div style="display:flex;align-items:center;gap:8px">
        <img src="${logo}" style="width:16px;height:16px;object-fit:contain;opacity:.85"/>
        <span>mechatro @ mechatro.hub4tech.net</span>
      </div>
      <div>Period · ${esc(rangeLabel(data, "en"))}</div>
      <div>By ${esc(data.generated_by.full_name)}</div>
    </div>
  </section>`;
}

// ---------- Bilingual section builders ----------
function profileCard(data: ReportData): string {
  const m = data.member;
  const rows: [string, string, string][] = [
    ["Role", "الدور", `${t(m.role as never, "en")} · ${t(m.role as never, "ar")}`],
    ["Email", "البريد", m.email ?? "—"],
    ["Phone", "الهاتف", m.phone ?? "—"],
    ["Job title", "المسمى الوظيفي", m.job_title ?? "—"],
    ["Member since", "عضو منذ", `${fmtDate(m.created_at, "en")} · ${fmtDate(m.created_at, "ar")}`],
    ["Status", "الحالة", m.active ? "Active · نشط" : "Inactive · غير نشط"],
  ];
  const body = `<div style="display:grid;grid-template-columns:1fr;gap:0">
    ${rows.map(([en, ar, v]) => `<div style="padding:11px 0;border-bottom:1px solid ${P.line};display:flex;justify-content:space-between;gap:16px;align-items:baseline">
      <div style="min-width:0"><div style="font-size:11px;color:${P.muted};font-weight:700;letter-spacing:.5px;text-transform:uppercase">${esc(en)}</div><div dir="rtl" style="font-size:11px;color:${P.muted};font-family:'Montserrat Arabic','Cairo',sans-serif;margin-top:2px">${esc(ar)}</div></div>
      <div style="font-size:13px;font-weight:700;color:${P.ink};text-align:right;word-break:break-word">${esc(v)}</div>
    </div>`).join("")}
  </div>`;
  return card(cardHeader(P.ink, "◆", "Profile", "الملف الشخصي") + body);
}

function performanceCard(s: Stats): string {
  const kpis: [string, string, string, string][] = [
    ["Total tasks", "إجمالي المهام", String(s.total), P.cyan],
    ["Completion", "الإنجاز", s.completionPct + "%", P.green],
    ["In progress", "قيد التنفيذ", String(s.byStatus.in_progress ?? 0), P.cyan],
    ["Overdue", "متأخر", String(s.overdue), P.red],
    ["On-time", "في الموعد", s.onTimePct + "%", P.green],
    ["Avg duration", "متوسط المدة", s.avgDurationDays + "d", P.orange],
    ["Hours logged", "ساعات مسجلة", String(Math.round(s.totalMinutes / 60)), P.purple],
    ["Points", "النقاط", String(s.completionPct * 10 + s.onTimePct * 5), P.gold],
  ];
  const grid = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    ${kpis.map(([en, ar, v, c]) => `
      <div style="background:${P.soft};border:1px solid ${P.line};border-radius:12px;padding:14px;border-top:3px solid ${c}">
        <div style="font-size:24px;font-weight:900;color:${P.ink};line-height:1;letter-spacing:-.5px">${esc(v)}</div>
        <div style="font-size:9.5px;color:${P.muted};margin-top:8px;letter-spacing:1px;font-weight:700;text-transform:uppercase">${esc(en)}</div>
        <div dir="rtl" style="font-size:10px;color:${P.ink2};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(ar)}</div>
      </div>`).join("")}
  </div>`;
  return card(cardHeader(P.green, "%", "Performance", "الأداء") + grid);
}

function chartsCard(data: ReportData, s: Stats): string {
  const donutData: [string, number, string][] = [
    ["To do", s.byStatus.todo ?? 0, STATUS_COLOR.todo],
    ["In progress", s.byStatus.in_progress ?? 0, STATUS_COLOR.in_progress],
    ["Paused", s.byStatus.paused ?? 0, STATUS_COLOR.paused],
    ["Done", s.byStatus.done ?? 0, STATUS_COLOR.done],
  ];
  const prioData: [string, number, string][] = [
    ["Low", s.byPriority.low ?? 0, PRIO_COLOR.low],
    ["Normal", s.byPriority.normal ?? 0, PRIO_COLOR.normal],
    ["High", s.byPriority.high ?? 0, PRIO_COLOR.high],
    ["Urgent", s.byPriority.urgent ?? 0, PRIO_COLOR.urgent],
  ];

  const donutLegend = `
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
      ${donutData.map(([en, v, c], i) => {
        const arLabels = ["قيد الانتظار", "قيد التنفيذ", "متوقف", "منجزة"];
        return `<div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;border-radius:3px;background:${c};flex:0 0 auto"></span>
          <div style="flex:1;min-width:0"><div style="color:${P.ink};font-weight:700">${en} <b style="color:${c};margin-inline-start:6px">${v}</b></div>
          <div dir="rtl" style="color:${P.muted};font-size:10.5px;font-family:'Montserrat Arabic','Cairo',sans-serif">${arLabels[i]}</div></div>
        </div>`;
      }).join("")}
    </div>`;

  const donutBlock = `
    <div style="text-align:center">
      <div style="font-size:11px;color:${P.muted};letter-spacing:1.5px;font-weight:700;margin-bottom:12px">STATUS · الحالة</div>
      <div style="display:flex;gap:16px;align-items:center;justify-content:center">
        <div style="flex:0 0 auto">${donutSVG(donutData, 170)}</div>
        <div style="flex:1;text-align:left">${donutLegend}</div>
      </div>
    </div>`;

  const prioBlock = `
    <div style="text-align:center">
      <div style="font-size:11px;color:${P.muted};letter-spacing:1.5px;font-weight:700;margin-bottom:12px">PRIORITY · الأولوية</div>
      ${barsSVG(prioData, 320, 200)}
    </div>`;

  const trendBlock = `
    <div style="margin-top:18px;padding-top:16px;border-top:1px solid ${P.line}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:11px;color:${P.muted};letter-spacing:1.5px;font-weight:700">12-WEEK COMPLETION TREND</div>
        <div dir="rtl" style="font-size:11px;color:${P.muted};font-family:'Montserrat Arabic','Cairo',sans-serif">اتجاه الإنجاز — ١٢ أسبوعًا</div>
      </div>
      ${sparklineSVG(s.weeks, 640, 120)}
    </div>`;

  const inner = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">${donutBlock}${prioBlock}</div>${trendBlock}`;
  void data;
  return card(cardHeader(P.cyan, "◐", "Analytics", "التحليلات") + inner);
}

function projectsCard(data: ReportData, s: Stats): string {
  const entries = Object.entries(s.byProject).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!entries.length) return "";
  const rows = entries.map(([id, count]) => {
    const p = data.projects[id]; if (!p) return "";
    const done = data.tasks.filter((tk) => tk.project_id === id && tk.status === "done").length;
    const pct = Math.round((done / Math.max(1, count)) * 100);
    return `<div style="padding:12px 0;border-bottom:1px solid ${P.line}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
          <span style="width:12px;height:12px;border-radius:4px;background:${p.color};flex:0 0 auto"></span>
          <div style="min-width:0;flex:1">
            <div style="font-weight:800;color:${P.ink};font-size:13px">${esc(p.name_en)}</div>
            <div dir="rtl" style="font-size:11px;color:${P.muted};font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(p.name_ar)}</div>
          </div>
        </div>
        <div style="text-align:right;font-size:11px;color:${P.muted};letter-spacing:.5px">
          <div><b style="color:${P.ink};font-size:14px">${done}</b> / ${count}</div>
          <div style="margin-top:2px">${pct}%</div>
        </div>
      </div>
      <div style="background:${P.soft};height:8px;border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${p.color},${p.color}cc)"></div>
      </div>
    </div>`;
  }).filter(Boolean).join("");
  return card(cardHeader(P.orange, "▤", "Top projects", "أهم المشاريع") + `<div>${rows}</div>`);
}

function tasksCard(data: ReportData): string {
  if (!data.tasks.length) return "";
  const rows = data.tasks.slice(0, 14).map((tk) => {
    const p = tk.project_id ? data.projects[tk.project_id] : null;
    const pname = p ? p.name_en : "—";
    const overdue = tk.status !== "done" && tk.due_date && new Date(tk.due_date) < new Date();
    return `<tr>
      <td style="padding:9px 10px;max-width:220px"><div style="font-weight:700;color:${P.ink};font-size:12.5px;line-height:1.4">${esc(tk.title)}</div>${p ? `<div style="font-size:10.5px;color:${P.muted};margin-top:2px"><span style="color:${p.color}">●</span> ${esc(pname)}</div>` : ""}</td>
      <td style="padding:9px 10px;text-align:center"><span style="background:${STATUS_COLOR[tk.status]}22;color:${STATUS_COLOR[tk.status]};padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.3px;white-space:nowrap">${esc(t(tk.status as never, "en"))}</span></td>
      <td style="padding:9px 10px;text-align:center"><span style="background:${PRIO_COLOR[tk.priority]}22;color:${PRIO_COLOR[tk.priority]};padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.3px;white-space:nowrap">${esc(t(tk.priority as never, "en"))}</span></td>
      <td style="padding:9px 10px;font-size:11.5px;color:${overdue ? P.red : P.ink2};font-weight:${overdue ? 700 : 500};white-space:nowrap;text-align:right">${esc(fmtDate(tk.due_date, "en"))}</td>
    </tr>`;
  }).join("");
  const table = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:2px solid ${P.line}">
      <th style="text-align:left;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Task · المهمة</th>
      <th style="text-align:center;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Status</th>
      <th style="text-align:center;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Priority</th>
      <th style="text-align:right;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Due · الاستحقاق</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return card(cardHeader(P.cyan, "☑", "Tasks", "المهام") + table);
}

function sessionsCard(data: ReportData, s: Stats): string {
  if (!data.sessions.length) return "";
  const totals = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
    ${[
      ["Total hours", "إجمالي الساعات", fmtMin(s.totalMinutes, "en"), P.cyan],
      ["Sessions", "الجلسات", String(data.sessions.length), P.green],
      ["Avg session", "متوسط الجلسة", fmtMin(s.avgSessionMin, "en"), P.orange],
    ].map(([en, ar, v, c]) => `<div style="background:${P.soft};border-radius:10px;padding:12px;border-top:3px solid ${c}">
      <div style="font-size:18px;font-weight:900;color:${P.ink};line-height:1">${esc(v)}</div>
      <div style="font-size:9.5px;color:${P.muted};margin-top:6px;letter-spacing:1px;font-weight:700;text-transform:uppercase">${esc(en)}</div>
      <div dir="rtl" style="font-size:10px;color:${P.ink2};margin-top:2px;font-family:'Montserrat Arabic','Cairo',sans-serif">${esc(ar)}</div>
    </div>`).join("")}
  </div>`;
  const rows = data.sessions.slice(0, 10).map((se) => `<tr>
    <td style="padding:8px 10px;font-size:11.5px;color:${P.ink2}">${esc(fmtDT(se.started_at, "en"))}</td>
    <td style="padding:8px 10px;font-size:11.5px;color:${P.ink2}">${esc(fmtDT(se.ended_at, "en"))}</td>
    <td style="padding:8px 10px;font-size:12px;font-weight:800;color:${P.ink};text-align:right">${esc(fmtMin(se.duration_minutes ?? 0, "en"))}</td>
  </tr>`).join("");
  const table = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:2px solid ${P.line}">
      <th style="text-align:left;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Start · البداية</th>
      <th style="text-align:left;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">End · النهاية</th>
      <th style="text-align:right;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Duration</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return card(cardHeader(P.purple, "⏱", "Work sessions", "جلسات العمل") + totals + table);
}

function activityCard(data: ReportData): string {
  if (!data.activity.length) return "";
  // HARD CAP: last 25 entries only. This kills the "log bleeds forever" bug.
  const items = data.activity.slice(0, 25);
  const rows = items.map((a) => {
    const actKey = `act_${a.action}` as keyof typeof dict;
    const entKey = `entity_${a.entity_type}` as keyof typeof dict;
    const actEn = t(actKey, "en") || a.action;
    const actAr = t(actKey, "ar") || a.action;
    const entEn = t(entKey, "en") || a.entity_type;
    const entAr = t(entKey, "ar") || a.entity_type;
    const meta = a.meta as { title?: string } | null;
    const extra = meta?.title ? ` — "${esc(String(meta.title).slice(0, 60))}"` : "";
    return `<tr>
      <td style="padding:8px 10px;font-size:11px;color:${P.muted};white-space:nowrap;vertical-align:top">${esc(fmtDT(a.created_at, "en"))}</td>
      <td style="padding:8px 10px;font-size:11.5px;color:${P.ink2}"><b style="color:${P.cyanDark}">${esc(actEn)}</b> ${esc(entEn)}${extra}</td>
      <td dir="rtl" style="padding:8px 10px;font-size:11.5px;color:${P.ink2};font-family:'Montserrat Arabic','Cairo',sans-serif"><b style="color:${P.cyanDark}">${esc(actAr)}</b> ${esc(entAr)}</td>
    </tr>`;
  }).join("");
  const table = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:2px solid ${P.line}">
      <th style="text-align:left;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Date</th>
      <th style="text-align:left;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">Action · EN</th>
      <th style="text-align:right;padding:8px 10px;font-size:10px;color:${P.muted};font-weight:800;letter-spacing:1px;text-transform:uppercase">النشاط · AR</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:10px;font-size:10.5px;color:${P.muted};text-align:center">Showing last ${items.length} entries · آخر ${items.length} إدخالات</div>`;
  return card(cardHeader(P.gold, "≡", "Recent activity", "النشاط الحديث") + table);
}

// ---------- Single-language builders (reused shells for AR/EN only) ----------
function performanceCardMono(s: Stats, lang: Lang): string {
  const kpis: [string, string, string][] = [
    [t("kpi_total_tasks", lang), String(s.total), P.cyan],
    [t("kpi_completed", lang), s.completionPct + "%", P.green],
    [t("kpi_in_progress", lang), String(s.byStatus.in_progress ?? 0), P.cyan],
    [t("kpi_overdue", lang), String(s.overdue), P.red],
    [t("kpi_ontime", lang), s.onTimePct + "%", P.green],
    [t("kpi_avg_duration", lang), s.avgDurationDays + "d", P.orange],
    [t("kpi_hours", lang), String(Math.round(s.totalMinutes / 60)), P.purple],
    [t("kpi_points", lang), String(s.completionPct * 10 + s.onTimePct * 5), P.gold],
  ];
  const arDir = lang === "ar" ? "rtl" : "ltr";
  const grid = `<div dir="${arDir}" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px${lang === "ar" ? ";font-family:'Montserrat Arabic','Cairo',sans-serif" : ""}">
    ${kpis.map(([lbl, v, c]) => `
      <div style="background:${P.soft};border:1px solid ${P.line};border-radius:12px;padding:14px;border-top:3px solid ${c}">
        <div style="font-size:24px;font-weight:900;color:${P.ink};line-height:1">${esc(v)}</div>
        <div style="font-size:10.5px;color:${P.muted};margin-top:8px;letter-spacing:.5px;font-weight:700">${esc(lbl)}</div>
      </div>`).join("")}
  </div>`;
  return card(cardHeader(P.green, "%", "Performance", "الأداء") + grid);
}

// ---------- Public API ----------

/** Wrap block-level HTML in a .pdf-block div so the generator can measure & pack it. */
function block(html: string): string {
  if (!html) return "";
  return `<div class="pdf-block" style="background:transparent;color:${P.ink};font-family:'Montserrat','Montserrat Arabic',sans-serif;padding:0 0 14px 0">${html}</div>`;
}

/** Build the full bilingual (side-by-side AR/EN) member report. */
export function buildBilingualHtml(data: ReportData, _theme?: ThemeId): string {
  void _theme;
  const s = computeStats(data);
  const cover = coverPage(data, s, "en");
  const blocks = [
    profileCard(data),
    performanceCard(s),
    chartsCard(data, s),
    projectsCard(data, s),
    tasksCard(data),
    sessionsCard(data, s),
    activityCard(data),
  ].filter(Boolean).map(block).join("");
  return cover + blocks;
}

/** Build a single-language member report (AR or EN only). Uses the same
 *  dashboard-card style; each card body is single-column in the chosen language. */
export function buildReportHtml(data: ReportData, lang: Lang, _theme?: ThemeId): string {
  void _theme;
  const s = computeStats(data);
  const cover = coverPage(data, s, lang);

  // For mono-lang we reuse the bilingual cards where they're already bilingual
  // by design (kpis, charts, tables have labels in both). Only the profile and
  // performance sections get a mono version to avoid awkward two-column layout.
  const blocks = [
    lang === "ar" ? profileCardMono(data, lang) : profileCardMono(data, lang),
    performanceCardMono(s, lang),
    chartsCard(data, s),
    projectsCard(data, s),
    tasksCard(data),
    sessionsCard(data, s),
    activityCard(data),
  ].filter(Boolean).map(block).join("");
  return cover + blocks;
}

function profileCardMono(data: ReportData, lang: Lang): string {
  const m = data.member;
  const rows: [string, string][] = [
    [t("role", lang) || "Role", t(m.role as never, lang)],
    ["Email", m.email ?? "—"],
    [t("phone", lang) || "Phone", m.phone ?? "—"],
    [t("jobTitle", lang) || "Job title", m.job_title ?? "—"],
    [t("memberSince", lang), fmtDate(m.created_at, lang)],
    ["Status", m.active ? t("active", lang) : "Inactive"],
  ];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const body = `<div dir="${dir}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px${lang === "ar" ? ";font-family:'Montserrat Arabic','Cairo',sans-serif" : ""}">
    ${rows.map(([k, v]) => `<div style="padding:11px 0;border-bottom:1px solid ${P.line};display:flex;justify-content:space-between;gap:12px">
      <span style="font-size:11px;color:${P.muted};font-weight:700;letter-spacing:.5px;text-transform:uppercase">${esc(k)}</span>
      <b style="color:${P.ink};font-size:13px;text-align:${lang === "ar" ? "left" : "right"};word-break:break-word">${esc(v)}</b>
    </div>`).join("")}
  </div>`;
  return card(cardHeader(P.ink, "◆", "Profile", "الملف الشخصي") + body);
}
