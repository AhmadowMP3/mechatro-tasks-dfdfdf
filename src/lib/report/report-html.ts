import type { ReportData } from "./data";
import { dict, type Lang } from "@/i18n/dict";
import logo from "@/assets/mechatro-logo.png";
import { getTheme, setTheme, type ThemeId } from "./themes";

// ---------- Palette (derived from current theme) ----------
const themeC = () => {
  const th = getTheme();
  return {
    blue: th.blue, blueDark: th.blueDark, green: th.green, orange: th.orange, red: th.red,
    ink: th.ink, ink2: th.ink2, muted: th.muted, line: th.line,
    paper: th.paper, soft: th.soft, card: th.card, gold: th.gold,
  };
};
let C = themeC();

const statusColors = () => ({ todo: C.muted, in_progress: C.blue, paused: C.orange, in_review: "#A855F7", done: C.green });
const prioColors = () => ({ low: C.muted, normal: C.blue, high: C.orange, urgent: C.red });
let STATUS_COLOR: Record<string, string> = statusColors();
let PRIO_COLOR: Record<string, string> = prioColors();


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

// ---------- Analytics ----------
type Stats = ReturnType<typeof computeStats>;
function computeStats(data: ReportData) {
  const t = data.tasks;
  const byStatus = { todo: 0, in_progress: 0, paused: 0, done: 0 } as Record<string, number>;
  const byPriority = { low: 0, normal: 0, high: 0, urgent: 0 } as Record<string, number>;
  const byProject: Record<string, number> = {};
  let overdue = 0, onTime = 0, totalDurationDays = 0, completedCount = 0;
  const now = new Date();
  const weeks: number[] = new Array(12).fill(0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 12 * 7);
  for (const x of t) {
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
    total: t.length, byStatus, byPriority, byProject,
    overdue, onTime, completedCount,
    onTimePct: completedCount ? Math.round((onTime / completedCount) * 100) : 0,
    completionPct: t.length ? Math.round((completedCount / t.length) * 100) : 0,
    avgDurationDays: completedCount ? +(totalDurationDays / completedCount).toFixed(1) : 0,
    totalMinutes, avgSessionMin, weeks,
  };
}

// ---------- SVG Charts ----------
function donutSVG(entries: [string, number, string][], size = 200): string {
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 12, sw = 22;
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
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.line}" stroke-width="${sw}"/>
    ${arcs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="30" font-weight="800" fill="${C.ink}">${total}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="${C.muted}">TASKS</text>
  </svg>`;
}

function barsSVG(entries: [string, number, string][], width = 340, height = 180): string {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const pad = 24, gap = 12;
  const rawBw = (width - pad * 2 - gap * (entries.length - 1)) / Math.max(1, entries.length);
  const bw = Math.min(rawBw, 56); // cap bar width so 1-2 entries don't span full card
  const groupW = bw * entries.length + gap * Math.max(0, entries.length - 1);
  const startX = (width - groupW) / 2; // center the bar cluster
  const chartH = height - 44;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${pad}" y1="${pad + chartH}" x2="${width - pad}" y2="${pad + chartH}" stroke="${C.line}"/>
    ${entries.map(([label, v, color], i) => {
      const h = (v / max) * chartH;
      const x = startX + i * (bw + gap);
      const y = pad + chartH - h;
      return `<g>
        <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${color}"/>
        <text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.ink}">${v}</text>
        <text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(label)}</text>
      </g>`;
    }).join("")}
  </svg>`;
}

function sparklineSVG(values: number[], width = 720, height = 120): string {
  const max = Math.max(1, ...values);
  const pad = 20; const w = width - pad * 2; const h = height - pad * 2;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${pad + i * step},${pad + h - (v / max) * h}`);
  const path = "M" + pts.join(" L");
  const area = `M${pad},${pad + h} L${pts.join(" L")} L${pad + w},${pad + h} Z`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${C.blue}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${pad}" y1="${pad + h}" x2="${pad + w}" y2="${pad + h}" stroke="${C.line}"/>
    <path d="${area}" fill="url(#sg)"/>
    <path d="${path}" fill="none" stroke="${C.blue}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((v, i) => `<circle cx="${pad + i * step}" cy="${pad + h - (v / max) * h}" r="3" fill="${C.blue}"/>`).join("")}
  </svg>`;
}

// ---------- Section builders ----------
function coverPage(data: ReportData, lang: Lang, s: Stats): string {
  const th = getTheme();
  const m = data.member;
  const initials = m.full_name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const isLight = th.id === "minimal" || th.id === "executive" && false; // exec has dark cover
  const onCoverText = th.coverInk;
  const softOverlay = isLight ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.14)";
  const softBorder = isLight ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.18)";
  const softSubtle = isLight ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.75)";

  const avatar = m.avatar_url
    ? `<img src="${esc(m.avatar_url)}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid ${softBorder};box-shadow:0 10px 30px rgba(0,0,0,.35)"/>`
    : `<div style="width:120px;height:120px;border-radius:50%;background:${softOverlay};display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;color:${onCoverText};border:4px solid ${softBorder};box-shadow:0 10px 30px rgba(0,0,0,.25)">${esc(initials)}</div>`;

  const bilingualTitle = lang === "ar"
    ? `<div style="font-size:36px;font-weight:800;letter-spacing:-.5px">تقرير العضو</div><div style="font-size:16px;color:${th.coverSub};margin-top:6px">Mechatro Member Report</div>`
    : `<div style="font-size:36px;font-weight:800;letter-spacing:-.5px">Member Report</div><div style="font-size:16px;color:${th.coverSub};margin-top:6px">تقرير العضو</div>`;

  // Minimal theme uses a totally different layout: big black text, thin gold divider.
  if (th.id === "minimal") {
    return `
    <section class="pdf-page cover" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}" style="background:${th.coverBg};color:${onCoverText};position:relative;overflow:hidden">

      <div style="padding:80px 72px 56px 72px;height:100%;display:flex;flex-direction:column;gap:32px">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="${logo}" style="width:36px;height:36px;object-fit:contain"/>
          <div style="font-size:11px;font-weight:800;letter-spacing:4px;color:${th.muted}">MECHATRO · REPORT</div>
        </div>
        <div style="width:64px;height:3px;background:${th.gold};margin-top:20px"></div>
        <div style="font-size:64px;font-weight:900;line-height:1;letter-spacing:-2px;color:${th.ink};margin-top:8px">
          ${lang === "ar" ? "تقرير العضو" : "Member Report"}
        </div>
        <div style="font-size:20px;color:${th.muted};margin-top:-8px">
          ${lang === "ar" ? "Member Report" : "تقرير العضو"}
        </div>
        <div style="flex:1"></div>
        <div style="display:flex;gap:32px;align-items:flex-end">
          ${avatar}
          <div style="flex:1">
            <div style="font-size:44px;font-weight:900;line-height:1.05;color:${th.ink};font-family:'Montserrat','Segoe UI',Tahoma,'Montserrat Arabic',sans-serif">${esc(m.full_name)}</div>
            ${m.job_title && m.job_title !== t(m.role as never, lang) ? `<div style="font-size:15px;color:${th.muted};margin-top:8px;letter-spacing:.5px">${esc(m.job_title)}</div>` : ""}

          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid ${th.line};padding-top:24px;margin-top:16px">
          ${["kpi_total_tasks","kpi_completion","kpi_ontime","kpi_hours"].map((k, i) => {
            const values = [String(s.total), s.completionPct + "%", s.onTimePct + "%", String(Math.round(s.totalMinutes / 60))];
            return `<div style="border-inline-start:${i === 0 ? "none" : `1px solid ${th.line}`};padding-inline-start:${i === 0 ? 0 : 20}px">
              <div style="font-size:36px;font-weight:900;color:${th.ink};line-height:1">${values[i]}</div>
              <div style="font-size:10px;color:${th.muted};margin-top:8px;text-transform:uppercase;letter-spacing:2px">${esc(t(k as never, lang))}</div>
            </div>`;
          }).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:${th.muted};letter-spacing:.5px;margin-top:20px">
          <div>${esc(rangeLabel(data, lang))}</div>
          <div>${esc(fmtDT(new Date().toISOString(), lang))}</div>
          <div>${esc(data.generated_by.full_name)}</div>
        </div>
      </div>
    </section>`;
  }

  // Creative editorial cover: massive name, AR+EN stacked, single accent bar.
  if (th.id === "creative") {
    return `
    <section class="pdf-page cover" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}" style="background:${th.coverBg};color:${th.ink};position:relative;overflow:hidden">
      <div style="padding:64px 64px 40px 64px;height:100%;display:flex;flex-direction:column;gap:24px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:12px">
            <img src="${logo}" style="width:36px;height:36px;object-fit:contain"/>
            <div style="font-size:10.5px;font-weight:800;letter-spacing:5px;color:${th.muted}">MECHATRO · REPORT</div>
          </div>
          <div style="font-size:10.5px;color:${th.muted};letter-spacing:2px">${esc(fmtDate(new Date().toISOString(), "en"))}</div>
        </div>

        <div style="width:56px;height:3px;background:${th.blue};margin-top:36px"></div>

        <div style="font-size:14px;color:${th.muted};letter-spacing:6px;text-transform:uppercase">Member Report · تقرير العضو</div>

        <div style="font-size:72px;font-weight:900;line-height:.98;letter-spacing:-2.5px;color:${th.ink};margin-top:4px;font-family:'Montserrat','Montserrat Arabic',sans-serif">${esc(m.full_name)}</div>

        ${m.job_title ? `<div style="font-size:17px;color:${th.muted};margin-top:-4px;letter-spacing:.5px">${esc(m.job_title)}</div>` : ""}

        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
          <span style="border:1px solid ${th.line};padding:6px 14px;border-radius:999px;font-size:11px;font-weight:700;color:${th.ink};letter-spacing:1px;text-transform:uppercase">${esc(t(m.role as never, lang))}</span>
          ${m.is_master_admin ? `<span style="background:${th.gold};color:#111;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${esc(t("masterAdmin", lang))}</span>` : ""}
          <span style="border:1px solid ${m.active ? th.green : th.line};color:${m.active ? th.green : th.muted};padding:6px 14px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${esc(m.active ? t("active", lang) : "Inactive")}</span>
        </div>

        <div style="flex:1"></div>

        <div style="display:flex;align-items:center;gap:28px">
          ${avatar}
          <div style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid ${th.line};padding-top:20px">
            ${[
              ["TOTAL", "الإجمالي", String(s.total)],
              ["DONE", "منجزة", s.completionPct + "%"],
              ["ON-TIME", "في الموعد", s.onTimePct + "%"],
              ["HOURS", "ساعات", String(Math.round(s.totalMinutes / 60))],
            ].map(([en, ar, val], i) => `
              <div style="border-inline-start:${i === 0 ? "none" : `1px solid ${th.line}`};padding-inline-start:${i === 0 ? 0 : 18}px">
                <div style="font-size:38px;font-weight:900;color:${th.ink};line-height:1;letter-spacing:-1px">${val}</div>
                <div style="font-size:9.5px;color:${th.muted};margin-top:8px;letter-spacing:2px;font-weight:700">${en}</div>
                <div style="font-size:11px;color:${th.ink2};margin-top:2px">${ar}</div>
              </div>`).join("")}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:${th.muted};letter-spacing:.5px;border-top:1px solid ${th.line};padding-top:14px;margin-top:12px">
          <div style="display:flex;align-items:center;gap:6px"><img src="${logo}" style="width:14px;height:14px;object-fit:contain;opacity:.8"/> mechatro @ mechatro.hub4tech.net</div>
          <div>${esc(rangeLabel(data, lang))}</div>
          <div>${esc(data.generated_by.full_name)}</div>
        </div>
      </div>
    </section>`;
  }

  return `
  <section class="pdf-page cover" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}" style="background:${th.coverBg};color:${onCoverText};position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:${th.coverGlow}"></div>
    <div style="position:relative;padding:56px 56px 40px 56px;height:100%;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="${logo}" style="width:44px;height:44px;object-fit:contain"/>
        <div>
          <div style="font-size:18px;font-weight:800">${esc(t("appName", lang))}</div>
          <div style="font-size:11px;color:${softSubtle};letter-spacing:2px">MECHATRO • INTERNAL REPORT</div>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;margin-top:20px">
        ${bilingualTitle}
        <div style="display:flex;gap:24px;align-items:center;margin-top:8px">
          ${avatar}
          <div>
            <div style="font-size:44px;font-weight:800;line-height:1.1;font-family:'Montserrat','Segoe UI',Tahoma,'Montserrat Arabic',sans-serif">${esc(m.full_name)}</div>
            ${m.job_title && m.job_title !== t(m.role as never, lang) ? `<div style="font-size:16px;color:${softSubtle};margin-top:8px">${esc(m.job_title)}</div>` : ""}

            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
              <span style="background:${softOverlay};padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700">${esc(t(m.role as never, lang))}</span>
              ${m.is_master_admin ? `<span style="background:${th.gold};color:#1a1a1a;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700">${esc(t("masterAdmin", lang))}</span>` : ""}
              <span style="background:${m.active ? th.green : "#9FB7C9"};padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700">${esc(m.active ? t("active", lang) : "Inactive")}</span>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:8px">
          ${bigStat(t("kpi_total_tasks", lang), String(s.total), softOverlay, softBorder, softSubtle)}
          ${bigStat(t("kpi_completion", lang), s.completionPct + "%", softOverlay, softBorder, softSubtle)}
          ${bigStat(t("kpi_ontime", lang), s.onTimePct + "%", softOverlay, softBorder, softSubtle)}
          ${bigStat(t("kpi_hours", lang), String(Math.round(s.totalMinutes / 60)), softOverlay, softBorder, softSubtle)}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:${softSubtle};border-top:1px solid ${softBorder};padding-top:14px">
        <div>${esc(t("reportPeriod", lang))}: <b style="color:${onCoverText}">${esc(rangeLabel(data, lang))}</b></div>
        <div>${esc(t("reportGeneratedOn", lang))}: <b style="color:${onCoverText}">${esc(fmtDT(new Date().toISOString(), lang))}</b></div>
        <div>${esc(t("reportedBy", lang))}: <b style="color:${onCoverText}">${esc(data.generated_by.full_name)}</b></div>
      </div>
    </div>
  </section>`;
}


const bigStat = (label: string, value: string, bg = "rgba(255,255,255,.14)", border = "rgba(255,255,255,.18)", labelColor = "rgba(255,255,255,.75)") => `
  <div style="background:${bg};backdrop-filter:blur(6px);border-radius:14px;padding:14px 16px;border:1px solid ${border}">
    <div style="font-size:28px;font-weight:800;line-height:1">${esc(value)}</div>
    <div style="font-size:11px;color:${labelColor};margin-top:4px;text-transform:uppercase;letter-spacing:1px">${esc(label)}</div>
  </div>`;


function sectionHeader(title: string, accent = C.blue): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin:0 0 14px 0">
    <div style="width:8px;height:22px;background:${accent};border-radius:2px"></div>
    <div style="font-size:20px;font-weight:800;color:${C.ink}">${esc(title)}</div>
  </div>`;
}

function kpiCard(label: string, value: string, accent: string): string {
  return `<div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:14px 16px;border-top:3px solid ${accent}">
    <div style="font-size:26px;font-weight:800;color:${C.ink};line-height:1">${esc(value)}</div>
    <div style="font-size:11px;color:${C.muted};margin-top:6px;text-transform:uppercase;letter-spacing:.5px">${esc(label)}</div>
  </div>`;
}


function profileSection(data: ReportData, lang: Lang): string {
  const m = data.member;
  const rows: [string, string][] = [
    [t("role", lang) || "Role", t(m.role as never, lang)],
    ["Email", m.email ?? "—"],
    [t("phone", lang) || "Phone", m.phone ?? "—"],
    [t("jobTitle", lang) || "Job title", m.job_title ?? "—"],
    [t("memberSince", lang), fmtDate(m.created_at, lang)],
    ["Status", (m.status ?? (m.active ? "active" : "inactive")).toString()],
  ];
  return `<div>${sectionHeader(t("sec_profile", lang))}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;background:${C.soft};border:1px solid ${C.line};border-radius:12px;padding:16px 20px">
      ${rows.map(([k, v]) => `<div style="padding:10px 0;border-bottom:1px solid ${C.line};display:flex;justify-content:space-between;font-size:13px"><span style="color:${C.muted}">${esc(k)}</span><b style="color:${C.ink}">${esc(v)}</b></div>`).join("")}
    </div></div>`;
}

function kpiGrid(s: Stats, lang: Lang): string {
  return `<div>${sectionHeader(t("sec_performance", lang), C.green)}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${kpiCard(t("kpi_total_tasks", lang), String(s.total), C.blue)}
      ${kpiCard(t("kpi_completed", lang), String(s.completionPct + "%"), C.green)}
      ${kpiCard(t("kpi_in_progress", lang), String(s.byStatus.in_progress ?? 0), C.blue)}
      ${kpiCard(t("kpi_overdue", lang), String(s.overdue), C.red)}
      ${kpiCard(t("kpi_ontime", lang), s.onTimePct + "%", C.green)}
      ${kpiCard(t("kpi_avg_duration", lang), s.avgDurationDays + "d", C.orange)}
      ${kpiCard(t("kpi_hours", lang), String(Math.round(s.totalMinutes / 60)), C.blue)}
      ${kpiCard(t("kpi_points", lang), String(s.completionPct * 10 + (s.onTimePct * 5)), C.orange)}
    </div></div>`;
}

function chartsSection(data: ReportData, s: Stats, lang: Lang): string {
  const donutData: [string, number, string][] = [
    [t("todo", lang), s.byStatus.todo ?? 0, STATUS_COLOR.todo],
    [t("in_progress", lang), s.byStatus.in_progress ?? 0, STATUS_COLOR.in_progress],
    [t("paused", lang), s.byStatus.paused ?? 0, STATUS_COLOR.paused],
    [t("done", lang), s.byStatus.done ?? 0, STATUS_COLOR.done],
  ];
  const prioData: [string, number, string][] = (["low", "normal", "high", "urgent"] as const).map((k) => [t(k, lang), s.byPriority[k] ?? 0, PRIO_COLOR[k]]);
  const projEntries = Object.entries(s.byProject).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => {
    const p = data.projects[id]; const name = p ? (lang === "ar" ? p.name_ar : p.name_en) : "—";
    return [name.slice(0, 12), v, p?.color ?? C.blue] as [string, number, string];
  });

  const legend = donutData.map(([l, v, c]) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px"><span style="width:10px;height:10px;border-radius:3px;background:${c}"></span>${esc(l)} <b style="margin-inline-start:4px">${v}</b></div>`).join("");

  return `<div>${sectionHeader(t("sec_charts", lang), C.orange)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:16px">
        <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${esc(t("statusDistribution", lang))}</div>
        <div style="display:flex;gap:16px;align-items:center">${donutSVG(donutData)}<div style="display:flex;flex-direction:column;gap:8px">${legend}</div></div>
      </div>
      <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:16px">
        <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${esc(t("priorityBreakdown", lang))}</div>
        ${barsSVG(prioData)}
      </div>
      ${projEntries.length ? `<div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:16px">
        <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${esc(t("tasksPerProject", lang))}</div>
        ${barsSVG(projEntries)}
      </div>` : ""}
      <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:16px;grid-column:${projEntries.length ? "auto" : "1 / span 2"}">
        <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${esc(t("weeklyCompletion", lang))}</div>
        ${sparklineSVG(s.weeks, projEntries.length ? 340 : 700, 140)}
      </div>
    </div></div>`;
}

function projectsSection(data: ReportData, s: Stats, lang: Lang): string {
  const rows = Object.entries(s.byProject).sort((a, b) => b[1] - a[1]).map(([id, count]) => {
    const p = data.projects[id]; if (!p) return "";
    const name = lang === "ar" ? p.name_ar : p.name_en;
    const done = data.tasks.filter((t) => t.project_id === id && t.status === "done").length;
    const pct = Math.round((done / Math.max(1, count)) * 100);
    return `<tr>
      <td style="padding:10px 12px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.color};margin-inline-end:8px"></span><b>${esc(name)}</b></td>
      <td style="padding:10px 12px;text-align:center">${count}</td>
      <td style="padding:10px 12px;text-align:center">${done}</td>
      <td style="padding:10px 12px">
        <div style="background:${C.line};height:8px;border-radius:4px;overflow:hidden;position:relative">
          <div style="width:${pct}%;height:100%;background:${p.color}"></div>
        </div>
        <div style="font-size:11px;color:${C.muted};margin-top:3px">${pct}%</div>
      </td>
    </tr>`;
  }).filter(Boolean).join("");
  if (!rows) return "";
  return `<div>${sectionHeader(t("sec_projects", lang), C.blue)}
    ${tableWrap(`<thead><tr>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colProject", lang))}</th>
      <th>${esc(t("colCount", lang))}</th>
      <th>${esc(t("kpi_completed", lang))}</th>
      <th>${esc(t("colCompletion", lang))}</th>
    </tr></thead><tbody>${rows}</tbody>`)}
  </div>`;
}

function tableWrap(inner: string): string {
  return `<table style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.line};border-radius:12px;overflow:hidden;font-size:12.5px">
    <style>th{background:${C.soft};color:${C.muted};padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;border-bottom:1px solid ${C.line}}td{border-bottom:1px solid ${C.line}}tr:last-child td{border-bottom:none}</style>
    ${inner}
  </table>`;
}

function tasksSection(data: ReportData, lang: Lang): string {
  if (!data.tasks.length) return `<div>${sectionHeader(t("sec_tasks", lang))}<div style="color:${C.muted};text-align:center;padding:20px">${esc(t("noData", lang))}</div></div>`;
  const rows = data.tasks.slice(0, 60).map((tk) => {
    const p = tk.project_id ? data.projects[tk.project_id] : null;
    const pname = p ? (lang === "ar" ? p.name_ar : p.name_en) : "—";
    const overdue = tk.status !== "done" && tk.due_date && new Date(tk.due_date) < new Date();
    return `<tr>
      <td style="padding:9px 12px;max-width:200px"><b>${esc(tk.title)}</b></td>
      <td style="padding:9px 12px"><span style="color:${p?.color ?? C.muted}">●</span> ${esc(pname)}</td>
      <td style="padding:9px 12px"><span style="background:${STATUS_COLOR[tk.status]}22;color:${STATUS_COLOR[tk.status]};padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700">${esc(t(tk.status as never, lang))}</span></td>
      <td style="padding:9px 12px"><span style="background:${PRIO_COLOR[tk.priority]}22;color:${PRIO_COLOR[tk.priority]};padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700">${esc(t(tk.priority as never, lang))}</span></td>
      <td style="padding:9px 12px">${esc(fmtDate(tk.start_date ?? tk.created_at, lang))}</td>
      <td style="padding:9px 12px;color:${overdue ? C.red : C.ink};font-weight:${overdue ? 700 : 400}">${esc(fmtDate(tk.due_date, lang))}</td>
      <td style="padding:9px 12px">${esc(fmtDate(tk.completed_at, lang))}</td>
    </tr>`;
  }).join("");
  return `<div>${sectionHeader(t("sec_tasks", lang))}
    ${tableWrap(`<thead><tr>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colTitle", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colProject", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colStatus", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colPriority", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colStart", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colDue", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colDone", lang))}</th>
    </tr></thead><tbody>${rows}</tbody>`)}
  </div>`;
}

function sessionsSection(data: ReportData, s: Stats, lang: Lang): string {
  if (!data.sessions.length) return "";
  const totals = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
    ${kpiCard(t("kpi_hours", lang), fmtMin(s.totalMinutes, lang), C.blue)}
    ${kpiCard(t("kpi_sessions", lang), String(data.sessions.length), C.green)}
    ${kpiCard("Avg " + t("colDuration", lang), fmtMin(s.avgSessionMin, lang), C.orange)}
  </div>`;
  const rows = data.sessions.slice(0, 20).map((se) => `<tr>
    <td style="padding:9px 12px">${esc(fmtDT(se.started_at, lang))}</td>
    <td style="padding:9px 12px">${esc(fmtDT(se.ended_at, lang))}</td>
    <td style="padding:9px 12px"><b>${esc(fmtMin(se.duration_minutes ?? 0, lang))}</b></td>
  </tr>`).join("");
  return `<div>${sectionHeader(t("sec_sessions", lang), C.orange)}${totals}
    ${tableWrap(`<thead><tr>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colStart", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colDone", lang))}</th>
      <th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colDuration", lang))}</th>
    </tr></thead><tbody>${rows}</tbody>`)}
  </div>`;
}

function commentsFilesSection(data: ReportData, lang: Lang): string {
  if (!data.comments.length && !data.files.length) return "";
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div>${sectionHeader(t("sec_comments", lang), C.blue)}
      <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:6px 14px;font-size:12.5px">
        ${data.comments.slice(0, 10).map((c) => `<div style="padding:10px 0;border-bottom:1px solid ${C.line}">
          <div style="color:${C.ink}">${esc(c.body.slice(0, 140))}${c.body.length > 140 ? "…" : ""}</div>
          <div style="color:${C.muted};font-size:11px;margin-top:3px">${esc(fmtDT(c.created_at, lang))}</div>
        </div>`).join("") || `<div style='color:${C.muted};padding:10px 0'>${esc(t("noData", lang))}</div>`}
      </div>
    </div>
    <div>${sectionHeader(t("sec_files", lang), C.green)}
      <div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:6px 14px;font-size:12.5px">
        ${data.files.slice(0, 10).map((f) => `<div style="padding:10px 0;border-bottom:1px solid ${C.line}">
          <div style="color:${C.ink};font-weight:700">📎 ${esc(f.file_name)}</div>
          <div style="color:${C.muted};font-size:11px;margin-top:3px">${esc(f.file_type ?? "file")} · ${esc(fmtDT(f.created_at, lang))}</div>
        </div>`).join("") || `<div style='color:${C.muted};padding:10px 0'>${esc(t("noData", lang))}</div>`}
      </div>
    </div>
  </div>`;
}

function activitySection(data: ReportData, lang: Lang): string {
  if (!data.activity.length) return "";
  const rows = data.activity.slice(0, 30).map((a) => {
    const actKey = `act_${a.action}` as keyof typeof dict;
    const entKey = `entity_${a.entity_type}` as keyof typeof dict;
    const act = t(actKey, lang) || a.action;
    const ent = t(entKey, lang) || a.entity_type;
    const meta = a.meta as { title?: string; from?: string; to?: string } | null;
    const extra = meta?.title ? ` — "${esc(meta.title)}"` : "";
    return `<tr>
      <td style="padding:8px 12px;white-space:nowrap;color:${C.muted}">${esc(fmtDT(a.created_at, lang))}</td>
      <td style="padding:8px 12px"><b style="color:${C.blue}">${esc(act)}</b> <span style="color:${C.muted}">${esc(ent)}</span>${extra}</td>
    </tr>`;
  }).join("");
  return `<div>${sectionHeader(t("sec_activity", lang), C.blue)}
    ${tableWrap(`<thead><tr><th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colDate", lang))}</th><th style="text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(t("colAction", lang))}</th></tr></thead><tbody>${rows}</tbody>`)}
  </div>`;
}

function contentPage(data: ReportData, lang: Lang, s: Stats, blocks: string[], pageNum: number, totalPages: number): string {
  const th = getTheme();
  return `<section class="pdf-page" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="background:${C.paper};color:${C.ink};padding:40px 44px;position:relative">
    <img src="${logo}" style="position:absolute;bottom:56px;${lang === 'ar' ? 'left' : 'right'}:44px;width:70px;height:70px;object-fit:contain;opacity:0.06;pointer-events:none"/>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;margin-bottom:20px;border-bottom:1px solid ${C.line};position:relative">
      <div style="display:flex;align-items:center;gap:10px">
        <img src="${logo}" style="width:26px;height:26px;object-fit:contain"/>
        <div>
          <div style="font-size:12px;font-weight:800;color:${C.ink};line-height:1.1">${esc(t("appName", lang))} · ${esc(t("memberReport", lang))}</div>
          <div style="width:36px;height:2px;background:${th.gold};margin-top:4px;border-radius:2px"></div>
        </div>
      </div>
      <div style="font-size:11px;color:${C.muted}">${esc(data.member.full_name)} · ${esc(rangeLabel(data, lang))}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:20px;position:relative">
      ${blocks.join("")}
    </div>
    <div style="position:absolute;bottom:18px;left:44px;right:44px;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${C.muted};border-top:1px solid ${C.line};padding-top:8px">
      <div style="display:flex;align-items:center;gap:6px"><img src="${logo}" style="width:14px;height:14px;object-fit:contain;opacity:.8"/> mechatro @ mechatro.hub4tech.net</div>
      <div style="letter-spacing:1px">${esc(t("page", lang))} ${pageNum} / ${totalPages}</div>
    </div>
  </section>`;
  void s;
}

// Refresh derived palette maps after a theme change.
function refreshPalette() {
  C = themeC();
  STATUS_COLOR = statusColors();
  PRIO_COLOR = prioColors();
}

// ---------- Public: build one full report as HTML ----------
export function buildReportHtml(data: ReportData, lang: Lang, theme?: ThemeId): string {
  if (theme) setTheme(theme);
  refreshPalette();
  const s = computeStats(data);
  const contentPages: string[][] = [
    [profileSection(data, lang), kpiGrid(s, lang), chartsSection(data, s, lang)],
    [projectsSection(data, s, lang), tasksSection(data, lang)],
    [sessionsSection(data, s, lang), commentsFilesSection(data, lang), activitySection(data, lang)],
  ].map((blocks) => blocks.filter(Boolean)).filter((b) => b.length);

  const rendered: string[] = [coverPage(data, lang, s)];
  const total = 1 + contentPages.length;
  contentPages.forEach((blocks, i) => rendered.push(contentPage(data, lang, s, blocks, i + 2, total)));
  return rendered.join("");
}

export function buildBilingualHtml(data: ReportData, theme?: ThemeId): string {
  // Creative theme: single unified doc — cover in AR, each content page shows
  // Arabic block above English block so header/footer/logo stay consistent.
  if (theme === "creative") {
    setTheme("creative");
    refreshPalette();
    const s = computeStats(data);
    const pairs: Array<{ ar: string; en: string }[]> = [
      [
        { ar: profileSection(data, "ar"), en: profileSection(data, "en") },
        { ar: kpiGrid(s, "ar"), en: kpiGrid(s, "en") },
      ],
      [{ ar: chartsSection(data, s, "ar"), en: chartsSection(data, s, "en") }],
      [
        { ar: projectsSection(data, s, "ar"), en: projectsSection(data, s, "en") },
      ].filter((p) => p.ar || p.en),
      [{ ar: tasksSection(data, "ar"), en: tasksSection(data, "en") }],
      [
        { ar: sessionsSection(data, s, "ar"), en: sessionsSection(data, s, "en") },
      ].filter((p) => p.ar || p.en),
      [
        { ar: activitySection(data, "ar"), en: activitySection(data, "en") },
      ].filter((p) => p.ar || p.en),
    ].filter((page) => page.length);

    const rendered: string[] = [coverPage(data, "ar", s)];
    const total = 1 + pairs.length;
    pairs.forEach((pairList, i) => {
      const blocks = pairList.flatMap(({ ar, en }) => [
        `<div dir="rtl" lang="ar">${ar}</div>`,
        `<div style="height:1px;background:var(--none,#ECECEC);margin:8px 0;opacity:.6"></div>`,
        `<div dir="ltr" lang="en">${en}</div>`,
      ]);
      rendered.push(contentPage(data, "ar", s, blocks, i + 2, total));
    });
    return rendered.join("");
  }
  // Legacy behavior: two full docs stacked (AR then EN).
  return buildReportHtml(data, "ar", theme) + `<div class="html2pdf__page-break"></div>` + buildReportHtml(data, "en", theme);
}


