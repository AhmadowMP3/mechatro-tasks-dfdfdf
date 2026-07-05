// Multi-sheet branded workbook exporter for the admin Reports hub.
// Produces one .xlsx with:
//   Sheet 1 — Summary (KPIs + top leaderboard)
//   Sheet 2 — All Tasks (styled table)
//   Sheet 3 — Projects
//   Sheets 4..N — one per member (their tasks + KPIs banner)
// Supports full Arabic (RTL) or English output.

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import logoUrl from "@/assets/mechatro-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, STATUS_COLOR, PRIORITY_COLOR } from "./xlsx";
import type { Lang } from "@/i18n/dict";

const T = (ar: string, en: string, lang: Lang) => (lang === "ar" ? ar : en);

type Task = {
  id: string; title: string; status: string; priority: string;
  project_id: string | null; assignee_id: string | null;
  start_date: string | null; due_date: string | null;
  completed_at: string | null; created_at: string;
  points: number | null; points_awarded_amount: number | null;
};
type Profile = { id: string; full_name: string; role: string; job_title: string | null; total_points: number | null; current_streak: number | null; active: boolean };
type Project = { id: string; name_ar: string; name_en: string; color: string };

async function fetchLogo(): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(logoUrl);
    return await r.arrayBuffer();
  } catch { return null; }
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function projectName(p: Project | undefined, lang: Lang): string {
  if (!p) return "—";
  return lang === "ar" ? p.name_ar : p.name_en;
}

function applyHeaderRow(sheet: ExcelJS.Worksheet, rowIdx: number, ncols: number) {
  const row = sheet.getRow(rowIdx);
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c > ncols) return;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.blueDark } },
      bottom: { style: "medium", color: { argb: BRAND.gold } },
      left: { style: "thin", color: { argb: BRAND.blueDark } },
      right: { style: "thin", color: { argb: BRAND.blueDark } },
    };
  });
  row.height = 26;
}

function styleDataRow(row: ExcelJS.Row, ncols: number, lang: Lang, zebra: boolean, kinds: Array<"text"|"number"|"date"|"status"|"priority"|"points">) {
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c > ncols) return;
    cell.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 1, wrapText: false };
    cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.ink } };
    cell.border = { bottom: { style: "hair", color: { argb: BRAND.border } } };
    if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
    const k = kinds[c - 1];
    if (k === "date") { cell.numFmt = "yyyy-mm-dd"; cell.alignment = { ...cell.alignment, horizontal: "center" }; }
    if (k === "number") { cell.numFmt = "#,##0"; cell.alignment = { ...cell.alignment, horizontal: "center" }; }
    if (k === "points") {
      cell.numFmt = "#,##0";
      cell.alignment = { ...cell.alignment, horizontal: "center" };
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF8B6E00" } };
    }
    if (k === "status" || k === "priority") {
      const key = String(cell.value ?? "").toLowerCase();
      const argb = (k === "status" ? STATUS_COLOR : PRIORITY_COLOR)[key];
      if (argb) {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      }
    }
  });
  row.height = 22;
}

function addBrandedHeader(sheet: ExcelJS.Worksheet, title: string, subtitle: string, generatedBy: string, lang: Lang, ncols: number) {
  // Reserve rows 1-4 for the banner
  sheet.spliceRows(1, 0, [], [], [], []);
  sheet.mergeCells(1, 1, 1, ncols);
  const c1 = sheet.getCell(1, 1);
  c1.value = "Mechatro Tasks  ·  مهام ميكاترو";
  c1.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  c1.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blueDark } };
  sheet.getRow(1).height = 42;

  sheet.mergeCells(2, 1, 2, ncols);
  const c2 = sheet.getCell(2, 1);
  c2.value = title;
  c2.font = { name: "Calibri", size: 14, bold: true, color: { argb: BRAND.blueDark } };
  c2.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4 };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9FD" } };
  c2.border = { bottom: { style: "medium", color: { argb: BRAND.gold } } };
  sheet.getRow(2).height = 28;

  sheet.mergeCells(3, 1, 3, ncols);
  const c3 = sheet.getCell(3, 1);
  const parts: string[] = [];
  if (subtitle) parts.push(subtitle);
  parts.push(`${T("أُنشئ في", "Generated", lang)}: ${new Date().toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB")}`);
  parts.push(`${T("بواسطة", "By", lang)}: ${generatedBy}`);
  c3.value = parts.join("   ·   ");
  c3.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.muted } };
  c3.alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 4, wrapText: true };
  sheet.getRow(3).height = 24;

  sheet.getRow(4).height = 6;
}

export type WorkbookOptions = {
  lang: Lang;
  generatedBy: string;
  periodLabel?: string;
  from?: Date | null;
  to?: Date | null;
  fileName?: string;
};

export async function exportBrandedWorkbook(opts: WorkbookOptions) {
  const { lang, generatedBy, periodLabel } = opts;
  const fromISO = opts.from?.toISOString();
  const toISO = opts.to?.toISOString();

  // Load everything in parallel.
  let tasksQ = supabase.from("tasks").select("id,title,status,priority,project_id,assignee_id,start_date,due_date,completed_at,created_at,points,points_awarded_amount");
  if (fromISO) tasksQ = tasksQ.gte("created_at", fromISO);
  if (toISO) tasksQ = tasksQ.lte("created_at", toISO);
  const profQ = supabase.from("profiles").select("id,full_name,role,job_title,total_points,current_streak,active").eq("active", true);
  const projQ = supabase.from("projects").select("id,name_ar,name_en,color");

  const [tasksR, profR, projR] = await Promise.all([tasksQ, profQ, projQ]);
  const tasks = (tasksR.data ?? []) as Task[];
  const profiles = (profR.data ?? []) as Profile[];
  const projects = (projR.data ?? []) as Project[];
  const projById: Record<string, Project> = Object.fromEntries(projects.map((p) => [p.id, p]));
  const memberById: Record<string, Profile> = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Mechatro Tasks";
  wb.created = new Date();

  const logo = await fetchLogo();
  const logoId = logo ? wb.addImage({ buffer: logo, extension: "png" }) : null;

  const period = periodLabel ?? (opts.from && opts.to
    ? `${opts.from.toISOString().slice(0, 10)} → ${opts.to.toISOString().slice(0, 10)}`
    : T("جميع الفترات", "All time", lang));

  // ============ Sheet 1: Summary ============
  const s1 = wb.addWorksheet(T("ملخص", "Summary", lang).slice(0, 31), {
    views: [{ state: "frozen", ySplit: 5, rightToLeft: lang === "ar" }],
    properties: { defaultRowHeight: 20 },
  });
  s1.columns = [
    { header: T("المؤشر", "KPI", lang), key: "k", width: 32 },
    { header: T("القيمة", "Value", lang), key: "v", width: 20 },
    { header: T("ملاحظات", "Notes", lang), key: "n", width: 46 },
  ];
  addBrandedHeader(s1, T("ملخص الأداء", "Performance Summary", lang), period, generatedBy, lang, 3);
  applyHeaderRow(s1, 5, 3);

  const now = new Date();
  const kpis: [string, number | string, string][] = [
    [T("إجمالي المهام", "Total tasks", lang), tasks.length, ""],
    [T("منجزة", "Done", lang), tasks.filter((t) => t.status === "done").length, ""],
    [T("قيد التنفيذ", "In progress", lang), tasks.filter((t) => t.status === "in_progress").length, ""],
    [T("قيد المراجعة", "In review", lang), tasks.filter((t) => t.status === "in_review").length, ""],
    [T("متأخرة", "Overdue", lang), tasks.filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date) < now).length, ""],
    [T("النقاط الممنوحة", "Points awarded", lang), tasks.reduce((a, t) => a + (t.points_awarded_amount ?? 0), 0), ""],
    [T("أعضاء نشيطون", "Active members", lang), profiles.length, ""],
    [T("مشاريع", "Projects", lang), projects.length, ""],
  ];
  kpis.forEach((k, i) => {
    const row = s1.addRow([k[0], k[1], k[2]]);
    styleDataRow(row, 3, lang, i % 2 === 1, ["text", "number", "text"]);
  });

  // Leaderboard block (rows further down)
  s1.addRow([]);
  const lbHeaderRow = s1.addRow([T("لوحة الصدارة (أفضل 10)", "Leaderboard (Top 10)", lang), "", ""]);
  s1.mergeCells(lbHeaderRow.number, 1, lbHeaderRow.number, 3);
  lbHeaderRow.getCell(1).font = { name: "Calibri", size: 13, bold: true, color: { argb: BRAND.blueDark } };
  lbHeaderRow.getCell(1).alignment = { vertical: "middle", horizontal: lang === "ar" ? "right" : "left", indent: 2 };
  lbHeaderRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9FD" } };
  lbHeaderRow.height = 26;
  const lbHeaders = s1.addRow([T("العضو", "Member", lang), T("النقاط", "Points", lang), T("متتالية أيام", "Streak", lang)]);
  applyHeaderRow(s1, lbHeaders.number, 3);
  const top10 = [...profiles].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0)).slice(0, 10);
  top10.forEach((p, i) => {
    const row = s1.addRow([p.full_name, p.total_points ?? 0, p.current_streak ?? 0]);
    styleDataRow(row, 3, lang, i % 2 === 1, ["text", "points", "number"]);
  });

  if (logoId != null) {
    s1.addImage(logoId, {
      tl: { col: lang === "ar" ? 0.15 : 2 + 0.15, row: 0.15 },
      ext: { width: 120, height: 34 },
      editAs: "oneCell",
    });
  }

  // ============ Sheet 2: All Tasks ============
  const s2 = wb.addWorksheet(T("كل المهام", "All Tasks", lang).slice(0, 31), {
    views: [{ state: "frozen", ySplit: 5, rightToLeft: lang === "ar" }],
    properties: { defaultRowHeight: 20 },
  });
  s2.columns = [
    { header: T("العنوان", "Title", lang), key: "title", width: 40 },
    { header: T("المشروع", "Project", lang), key: "project", width: 24 },
    { header: T("المسؤول", "Assignee", lang), key: "assignee", width: 22 },
    { header: T("الحالة", "Status", lang), key: "status", width: 14 },
    { header: T("الأولوية", "Priority", lang), key: "prio", width: 12 },
    { header: T("النقاط", "Points", lang), key: "points", width: 10 },
    { header: T("تاريخ البدء", "Start", lang), key: "start", width: 14 },
    { header: T("تاريخ التسليم", "Due", lang), key: "due", width: 14 },
    { header: T("تاريخ الإنجاز", "Completed", lang), key: "done", width: 14 },
  ];
  addBrandedHeader(s2, T("جميع المهام", "All Tasks", lang), period, generatedBy, lang, 9);
  applyHeaderRow(s2, 5, 9);
  const taskKinds: Array<"text"|"number"|"date"|"status"|"priority"|"points"> = ["text","text","text","status","priority","points","date","date","date"];
  tasks.forEach((t, i) => {
    const row = s2.addRow([
      t.title,
      projectName(projById[t.project_id ?? ""], lang),
      t.assignee_id ? memberById[t.assignee_id]?.full_name ?? "—" : "—",
      t.status,
      t.priority,
      t.points_awarded_amount ?? t.points ?? 0,
      t.start_date ? new Date(t.start_date) : "",
      t.due_date ? new Date(t.due_date) : "",
      t.completed_at ? new Date(t.completed_at) : "",
    ]);
    styleDataRow(row, 9, lang, i % 2 === 1, taskKinds);
  });
  s2.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 9 } };
  if (logoId != null) {
    s2.addImage(logoId, {
      tl: { col: lang === "ar" ? 0.15 : 8 + 0.15, row: 0.15 },
      ext: { width: 120, height: 34 },
      editAs: "oneCell",
    });
  }

  // ============ Sheet 3: Projects ============
  const s3 = wb.addWorksheet(T("المشاريع", "Projects", lang).slice(0, 31), {
    views: [{ state: "frozen", ySplit: 5, rightToLeft: lang === "ar" }],
  });
  s3.columns = [
    { header: T("المشروع", "Project", lang), key: "n", width: 32 },
    { header: T("مهام", "Tasks", lang), key: "c", width: 12 },
    { header: T("منجزة", "Done", lang), key: "d", width: 12 },
    { header: T("نسبة الإنجاز", "Completion", lang), key: "p", width: 16 },
  ];
  addBrandedHeader(s3, T("المشاريع", "Projects", lang), period, generatedBy, lang, 4);
  applyHeaderRow(s3, 5, 4);
  const projRows = projects.map((p) => {
    const list = tasks.filter((t) => t.project_id === p.id);
    const done = list.filter((t) => t.status === "done").length;
    return { p, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  }).sort((a, b) => b.total - a.total);
  projRows.forEach((r, i) => {
    const row = s3.addRow([projectName(r.p, lang), r.total, r.done, r.pct + "%"]);
    styleDataRow(row, 4, lang, i % 2 === 1, ["text", "number", "number", "text"]);
  });

  // ============ Sheets 4..N: per-member ============
  const usedNames = new Set<string>([T("ملخص","Summary",lang), T("كل المهام","All Tasks",lang), T("المشاريع","Projects",lang)]);
  const sortedProfiles = [...profiles].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));

  for (const m of sortedProfiles) {
    let sheetName = m.full_name.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "member";
    let n = 2;
    while (usedNames.has(sheetName)) { sheetName = (m.full_name.slice(0, 28) + "-" + n).slice(0, 31); n++; }
    usedNames.add(sheetName);

    const sm = wb.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 8, rightToLeft: lang === "ar" }],
      properties: { defaultRowHeight: 20 },
    });
    sm.columns = [
      { header: T("العنوان", "Title", lang), key: "title", width: 40 },
      { header: T("المشروع", "Project", lang), key: "project", width: 24 },
      { header: T("الحالة", "Status", lang), key: "status", width: 14 },
      { header: T("الأولوية", "Priority", lang), key: "prio", width: 12 },
      { header: T("النقاط", "Points", lang), key: "points", width: 10 },
      { header: T("البدء", "Start", lang), key: "start", width: 14 },
      { header: T("التسليم", "Due", lang), key: "due", width: 14 },
      { header: T("الإنجاز", "Completed", lang), key: "done", width: 14 },
    ];
    // Rows 1-4 banner
    addBrandedHeader(sm, `${m.full_name} · ${m.job_title ?? m.role}`, period, generatedBy, lang, 8);

    // Row 5-6: KPI banner strip
    const mine = tasks.filter((t) => t.assignee_id === m.id);
    const mineDone = mine.filter((t) => t.status === "done").length;
    const overdueCount = mine.filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date) < now).length;
    sm.spliceRows(5, 0, [], []);
    sm.mergeCells(5, 1, 5, 8);
    const bcell = sm.getCell(5, 1);
    bcell.value = [
      `⭐ ${m.total_points ?? 0} ${T("نقطة", "pts", lang)}`,
      `🔥 ${m.current_streak ?? 0} ${T("متتالية", "streak", lang)}`,
      `📋 ${mine.length} ${T("مهام", "tasks", lang)}`,
      `✅ ${mineDone} ${T("منجزة", "done", lang)}`,
      `⚠ ${overdueCount} ${T("متأخرة", "overdue", lang)}`,
    ].join("     ");
    bcell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    bcell.alignment = { vertical: "middle", horizontal: "center" };
    bcell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2540" } };
    sm.getRow(5).height = 32;
    sm.getRow(6).height = 6;

    // Row 7 header (from sheet.columns), Row 8 blank spacer, data from row 8
    applyHeaderRow(sm, 7, 8);
    const memberKinds: Array<"text"|"number"|"date"|"status"|"priority"|"points"> = ["text","text","status","priority","points","date","date","date"];
    mine.forEach((t, i) => {
      const row = sm.addRow([
        t.title,
        projectName(projById[t.project_id ?? ""], lang),
        t.status,
        t.priority,
        t.points_awarded_amount ?? t.points ?? 0,
        t.start_date ? new Date(t.start_date) : "",
        t.due_date ? new Date(t.due_date) : "",
        t.completed_at ? new Date(t.completed_at) : "",
      ]);
      styleDataRow(row, 8, lang, i % 2 === 1, memberKinds);
    });
    sm.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 8 } };

    if (logoId != null) {
      sm.addImage(logoId, {
        tl: { col: lang === "ar" ? 0.15 : 7 + 0.15, row: 0.15 },
        ext: { width: 120, height: 34 },
        editAs: "oneCell",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = opts.fileName ?? `Mechatro-Report-${lang.toUpperCase()}-${stamp()}.xlsx`;
  saveAs(blob, fileName);
}
