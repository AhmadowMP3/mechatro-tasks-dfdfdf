import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { relativeTime, formatDate } from "@/lib/format";
import { normalizeAction } from "@/lib/activity";
import type { DictKey } from "@/i18n/dict";
import {
  ScrollText, Filter,
  Plus, Pencil, Trash2, ArrowRightLeft, MessageSquare, Paperclip,
  UserPlus, Archive as ArchiveIcon, LogIn, LogOut, Activity as ActivityIcon,
  Download,
} from "lucide-react";

import {
  FilterDrawer, FilterSection, ChipMultiSelect, FilterSelect,
  DateRangeControl, resolveDateRange, ActiveFilterChips,
  SearchField, FilterBarCluster, type Preset,
} from "@/components/filters/FilterDrawer";
import { exportToBrandedXlsx, type XlsxColumn } from "@/lib/export/xlsx";
import { promptFilename } from "@/components/FilenamePrompt";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { useBulkSelection, BulkCheckbox } from "@/lib/bulk-selection";


const ACTIONS = ["created","updated","status_changed","deleted","archived","commented","file_added","assigned","signed_in","signed_out"] as const;
const ENTITIES = ["task","project","profile","reference","comment","file","report","auth"] as const;

const RANGES = ["all","24h","7d","30d"] as const;
type Range = typeof RANGES[number];

const searchSchema = z.object({
  q:      z.string().catch("").default(""),
  user:   z.string().catch("").default(""),
  action: z.string().catch("").default(""), // comma-separated list
  entity: z.string().catch("").default(""), // comma-separated list
  range:  z.enum(RANGES).catch("7d").default("7d"),
  from:   z.string().catch("").default(""), // ISO date (YYYY-MM-DD)
  to:     z.string().catch("").default(""),
});
type Search = z.infer<typeof searchSchema>;

const splitCSV = (s: string): string[] => s ? s.split(",").filter(Boolean) : [];
const joinCSV = (arr: string[]): string => arr.filter(Boolean).join(",");

export const Route = createFileRoute("/_authenticated/activity")({
  ssr: false,
  beforeLoad: async (ctx) => {
    const { requireAdmin } = await import("@/lib/route-guards");
    await requireAdmin();
    return ctx.context;
  },
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: ActivityPage,
});

const PAGE_SIZE = 50;

type ActivityRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type ActorMap = Record<string, { full_name: string; avatar_url: string | null }>;

const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  created: Plus,
  updated: Pencil,
  status_changed: ArrowRightLeft,
  deleted: Trash2,
  archived: ArchiveIcon,
  commented: MessageSquare,
  file_added: Paperclip,
  assigned: UserPlus,
  signed_in: LogIn,
  signed_out: LogOut,

};

const ACTION_COLORS: Record<string, string> = {
  created: "#22C55E",
  updated: "#189FD1",
  status_changed: "#FF8A3D",
  deleted: "#F0676A",
  archived: "var(--muted)",
  commented: "#A78BFA",
  file_added: "#189FD1",
  assigned: "#22C55E",
  signed_in: "var(--muted)",
  signed_out: "var(--muted)",

};

function rangeSince(r: Range): string | null {
  if (r === "all") return null;
  const now = Date.now();
  const ms = r === "24h" ? 864e5 : r === "7d" ? 7 * 864e5 : 30 * 864e5;
  return new Date(now - ms).toISOString();
}

function ActivityPage() {
  const { t, lang, user, users, isMasterAdmin } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const isAdmin = isMasterAdmin || user?.role === "admin";

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [actors, setActors] = useState<ActorMap>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [page, setPage] = useState(0);

  // Non-admin: soft redirect
  useEffect(() => { if (user && !isAdmin) navigate({ to: "/" }); }, [user, isAdmin, navigate]);

  // Reset when filters change
  useEffect(() => { setRows([]); setPage(0); setDone(false); }, [search.q, search.user, search.action, search.entity, search.range, search.from, search.to]);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search.q, search.user, search.action, search.entity, search.range, search.from, search.to, isAdmin]);

  const fetchPage = async (p: number) => {
    setLoading(true);
    let q = supabase.from("activity_log").select("*").order("created_at", { ascending: false });

    // Date range: custom (from/to) takes priority
    if (search.from) q = q.gte("created_at", new Date(search.from).toISOString());
    if (search.to) {
      const u = new Date(search.to); u.setHours(23, 59, 59, 999);
      q = q.lte("created_at", u.toISOString());
    }
    if (!search.from && !search.to) {
      const since = rangeSince(search.range);
      if (since) q = q.gte("created_at", since);
    }

    if (search.user) q = q.eq("actor_id", search.user);
    const actionArr = splitCSV(search.action);
    const entityArr = splitCSV(search.entity);
    if (actionArr.length === 1) q = q.eq("action", actionArr[0]);
    else if (actionArr.length > 1) q = q.in("action", actionArr);
    if (entityArr.length === 1) q = q.eq("entity_type", entityArr[0]);
    else if (entityArr.length > 1) q = q.in("entity_type", entityArr);
    const from = p * PAGE_SIZE;
    const { data } = await q.range(from, from + PAGE_SIZE - 1);
    let batch = (data ?? []) as ActivityRow[];

    // Client-side free-text filter (small pages so it's fine).
    if (search.q.trim()) {
      const needle = search.q.trim().toLowerCase();
      batch = batch.filter((r) => {
        const metaStr = r.meta ? JSON.stringify(r.meta).toLowerCase() : "";
        return r.action.toLowerCase().includes(needle)
          || r.entity_type.toLowerCase().includes(needle)
          || (r.entity_id ?? "").toLowerCase().includes(needle)
          || metaStr.includes(needle);
      });
    }

    setRows((prev) => (p === 0 ? batch : [...prev, ...batch]));
    setDone((data?.length ?? 0) < PAGE_SIZE);
    setLoading(false);

    // Resolve entity names + actors for the new batch
    void resolveEntityNames(batch);
    void resolveActors(batch);
  };

  const resolveActors = async (batch: ActivityRow[]) => {
    const ids = Array.from(new Set(batch.map((r) => r.actor_id).filter((x): x is string => !!x && !actors[x])));
    if (!ids.length) return;
    // First try local users cache
    const next: ActorMap = { ...actors };
    const missing: string[] = [];
    for (const id of ids) {
      const u = users.find((x) => x.id === id);
      if (u) next[id] = { full_name: u.full_name, avatar_url: u.avatar_url };
      else missing.push(id);
    }
    if (missing.length) {
      const { data } = await supabase.from("profiles").select("id,full_name,avatar_url").in("id", missing);
      for (const p of data ?? []) next[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
    }
    setActors(next);
  };

  const resolveEntityNames = async (batch: ActivityRow[]) => {
    const byType: Record<string, Set<string>> = {};
    for (const r of batch) {
      if (!r.entity_id) continue;
      if (entityNames[r.entity_id]) continue;
      byType[r.entity_type] ??= new Set();
      byType[r.entity_type].add(r.entity_id);
    }
    const next: Record<string, string> = { ...entityNames };
    if (byType.task?.size) {
      const { data } = await supabase.from("tasks").select("id,title").in("id", [...byType.task]);
      for (const x of data ?? []) next[x.id] = x.title;
    }
    if (byType.project?.size) {
      const { data } = await supabase.from("projects").select("id,name_ar,name_en").in("id", [...byType.project]);
      for (const x of data ?? []) next[x.id] = lang === "ar" ? x.name_ar : x.name_en;
    }
    if (byType.profile?.size || byType.auth?.size) {
      const ids = new Set<string>([...(byType.profile ?? []), ...(byType.auth ?? [])]);
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", [...ids]);
      for (const x of data ?? []) next[x.id] = x.full_name;
    }
    if (byType.reference?.size) {
      const { data } = await (supabase.from as unknown as (t: string) => any)("references").select("id,title").in("id", [...byType.reference]);
      for (const x of (data ?? []) as { id: string; title: string }[]) next[x.id] = x.title;
    }
    if (byType.report?.size) {
      const { data } = await supabase.from("member_reports").select("id,member_name_snapshot").in("id", [...byType.report]);
      for (const x of (data ?? []) as { id: string; member_name_snapshot: string | null }[]) next[x.id] = x.member_name_snapshot ?? "Report";
    }

    setEntityNames(next);
  };

  const patchSearch = (partial: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ to: "/activity", search: (prev: Search) => ({ ...prev, ...partial }), replace: true });
  };
  const resetFilters = () => navigate({ to: "/activity", search: { q: "", user: "", action: "", entity: "", range: "7d", from: "", to: "" }, replace: true });

  // Group rows by day
  const groups = useMemo(() => {
    const g: Record<string, ActivityRow[]> = {};
    for (const r of rows) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      (g[key] ??= []).push(r);
    }
    return Object.entries(g);
  }, [rows]);

  const dayLabel = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const yest = new Date(today.getTime() - 864e5);
    if (d.getTime() === today.getTime()) return t("today");
    if (d.getTime() === yest.getTime()) return t("yesterday");
    return formatDate(iso, lang);
  };

  const exportCsv = async () => {
    const fileName = await promptFilename({
      defaultName: `activity-${new Date().toISOString().slice(0, 10)}`,
      extension: "csv",
      title: t("filenamePromptTitle"),
      label: t("filenameLabel"),
      hint: t("filenameHint"),
      confirmLabel: t("exportXlsx"),
      cancelLabel: t("cancel"),
    });
    if (!fileName) return;
    const header = ["created_at", "actor", "action", "entity_type", "entity_id", "entity_name", "meta"];
    const csv = [header.join(",")].concat(
      rows.map((r) => [
        r.created_at,
        actors[r.actor_id ?? ""]?.full_name ?? "",
        r.action,
        r.entity_type,
        r.entity_id ?? "",
        (r.entity_id && entityNames[r.entity_id]) || "",
        r.meta ? JSON.stringify(r.meta) : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const { isSelected, toggle, ids: selectedIds } = useBulkSelection<ActivityRow>({
    pageId: "activity",
    items: rows,
    deps: [rows.length, lang, actors, entityNames],
    buildBar: (sel, clearSel) => ({
      count: sel.length,
      totalLabel: lang === "ar"
        ? `${sel.length} حدث محدد`
        : `${sel.length} event${sel.length === 1 ? "" : "s"} selected`,
      actions: [
        {
          id: "export",
          label: lang === "ar" ? "تصدير CSV" : "Export CSV",
          icon: <Download size={14} />,
          onRun: async () => {
            const fileName = await promptFilename({
              defaultName: `activity-selection-${new Date().toISOString().slice(0, 10)}`,
              extension: "csv",
              title: t("filenamePromptTitle"),
              label: t("filenameLabel"),
              hint: t("filenameHint"),
              confirmLabel: t("exportXlsx"),
              cancelLabel: t("cancel"),
            });
            if (!fileName) return;
            const selRows = rows.filter((r) => sel.includes(r.id));
            const header = ["created_at", "actor", "action", "entity_type", "entity_id", "entity_name", "meta"];
            const csv = [header.join(",")].concat(
              selRows.map((r) => [
                r.created_at,
                actors[r.actor_id ?? ""]?.full_name ?? "",
                r.action,
                r.entity_type,
                r.entity_id ?? "",
                (r.entity_id && entityNames[r.entity_id]) || "",
                r.meta ? JSON.stringify(r.meta) : "",
              ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
            ).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
            toast.success(lang === "ar" ? `تم تصدير ${sel.length} حدث` : `Exported ${sel.length} row${sel.length === 1 ? "" : "s"}`);
            clearSel();
          },
        },
      ],
    }),
  });
  const bulkMode = selectedIds.length > 0;


  const entityHref = (r: ActivityRow): string | null => {
    if (!r.entity_id) return null;
    if (r.entity_type === "project") return `/projects/${r.entity_id}`;
    if (r.entity_type === "task") return `/tasks`;
    return null;
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const actionArr = useMemo(() => splitCSV(search.action), [search.action]);
  const entityArr = useMemo(() => splitCSV(search.entity), [search.entity]);
  const hasCustom = !!(search.from || search.to);
  const datePreset: Preset = hasCustom ? "custom"
    : search.range === "24h" ? "today"
    : search.range === "7d" ? "7d"
    : search.range === "30d" ? "30d"
    : "all";
  const onDateChange = ({ preset, from, to }: { preset: Preset; from: string; to: string }) => {
    if (preset === "custom") {
      patchSearch({ range: "all", from, to });
    } else {
      const map: Record<Preset, Range> = { all: "all", today: "24h", "7d": "7d", "30d": "30d", custom: "all" };
      patchSearch({ range: map[preset], from: "", to: "" });
    }
  };
  void resolveDateRange;

  const chips = useMemo(() => {
    const c: { key: string; label: string; onRemove: () => void }[] = [];
    if (search.q) c.push({ key: "q", label: `"${search.q}"`, onRemove: () => patchSearch({ q: "" }) });
    if (search.user) {
      const u = users.find((x) => x.id === search.user);
      c.push({ key: "u", label: u?.full_name ?? search.user, onRemove: () => patchSearch({ user: "" }) });
    }
    for (const a of actionArr) {
      c.push({
        key: `a:${a}`,
        label: t(`act_${a}` as DictKey) || a,
        onRemove: () => patchSearch({ action: joinCSV(actionArr.filter((x) => x !== a)) }),
      });
    }
    for (const e of entityArr) {
      c.push({
        key: `e:${e}`,
        label: t(`entity_${e}` as DictKey) || e,
        onRemove: () => patchSearch({ entity: joinCSV(entityArr.filter((x) => x !== e)) }),
      });
    }
    if (hasCustom) {
      const label = `${search.from || "…"} → ${search.to || "…"}`;
      c.push({ key: "r", label, onRemove: () => patchSearch({ from: "", to: "", range: "7d" }) });
    } else if (search.range !== "all") {
      c.push({
        key: "r",
        label: search.range === "24h" ? t("dateLast24h") : search.range === "7d" ? t("dateLast7d") : t("dateLast30d"),
        onRemove: () => patchSearch({ range: "all" }),
      });
    }
    return c;
  }, [search, users, t, actionArr, entityArr, hasCustom]);

  const activeCount = chips.length;

  const doExport = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = await promptFilename({
      defaultName: `Mechatro_Activity_${stamp}`,
      extension: "xlsx",
      title: t("filenamePromptTitle"),
      label: t("filenameLabel"),
      hint: t("filenameHint"),
      confirmLabel: t("exportXlsx"),
      cancelLabel: t("cancel"),
    });
    if (!fileName) return;
    try {
      const cols: XlsxColumn<ActivityRow>[] = [
        { key: "when", header: lang === "ar" ? "التاريخ" : "When", width: 22, kind: "datetime", get: (r) => r.created_at },
        { key: "actor", header: lang === "ar" ? "المستخدم" : "Actor", width: 24, get: (r) => actors[r.actor_id ?? ""]?.full_name ?? "" },
        { key: "action", header: t("filterAction"), width: 18, get: (r) => t(`act_${normalizeAction(r.action)}` as DictKey) || r.action },
        { key: "entity_type", header: t("filterEntity"), width: 14, get: (r) => t(`entity_${r.entity_type}` as DictKey) || r.entity_type },
        { key: "entity_name", header: lang === "ar" ? "الاسم" : "Entity", width: 32, get: (r) => (r.entity_id && entityNames[r.entity_id]) || (typeof r.meta?.title === "string" ? r.meta.title : "") || "" },
        { key: "meta", header: lang === "ar" ? "تفاصيل" : "Details", width: 40, get: (r) => r.meta ? JSON.stringify(r.meta) : "" },
      ];
      await exportToBrandedXlsx({
        sheetName: t("activityLog"),
        title: `${t("reportTitle")} · ${t("activityLog")}`,
        filtersSummary: chips.map((c) => c.label).join(" · ") || (lang === "ar" ? "بدون فلاتر" : "No filters"),
        generatedBy: user?.full_name,
        lang, columns: cols, rows, fileName,
      });
      toast.success(t("exported"));
    } catch (e) {
      toast.error(t("exportFailed"));
      console.error(e);
    }
  };

  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title={t("activityLog")}
        subtitle={t("activityLogSubtitle")}
        adornment={<ScrollText size={22} />}
      />


      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <SearchField value={search.q} onChange={(v) => patchSearch({ q: v })} />
        <FilterBarCluster
          activeCount={activeCount}
          onOpen={() => setDrawerOpen(true)}
          onReset={resetFilters}
          onExport={doExport}
          exportDisabled={!rows.length}
        />
      </div>

      <ActiveFilterChips chips={chips} onClearAll={resetFilters} />

      <FilterDrawer open={drawerOpen} onOpenChange={setDrawerOpen} activeCount={activeCount} onReset={resetFilters}>
        <FilterSection label={t("filterUser")}>
          <FilterSelect value={search.user} onChange={(v) => patchSearch({ user: v })}
            options={users.map((u) => ({ value: u.id, label: u.full_name }))} placeholder={t("allUsers")} />
        </FilterSection>
        <FilterSection label={t("filterAction")}>
          <ChipMultiSelect
            value={actionArr}
            onChange={(v) => patchSearch({ action: joinCSV(v) })}
            options={ACTIONS.map((a) => ({ value: a, label: t(`act_${a}` as DictKey) }))}
          />
        </FilterSection>
        <FilterSection label={t("filterEntity")}>
          <ChipMultiSelect
            value={entityArr}
            onChange={(v) => patchSearch({ entity: joinCSV(v) })}
            options={ENTITIES.map((e) => ({ value: e, label: t(`entity_${e}` as DictKey) }))}
          />
        </FilterSection>
        <FilterSection label={t("dateRange")}>
          <DateRangeControl preset={datePreset} from={search.from} to={search.to} onChange={onDateChange} />
        </FilterSection>
      </FilterDrawer>

      {/* Timeline */}
      <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 && !loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
            <ActivityIcon size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
            <div>{t("noActivityMatch")}</div>
          </div>
        ) : (
          <div>
            {groups.map(([day, items]) => (
              <div key={day}>
                <div style={{
                  position: "sticky", top: 0, zIndex: 1,
                  padding: "10px 18px", background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
                  color: "var(--muted)", textTransform: "uppercase",
                }}>
                  {dayLabel(day)}
                </div>
                {items.map((r) => {
                  const action = normalizeAction(r.action);
                  const Icon = ACTION_ICONS[action] ?? Filter;
                  const color = ACTION_COLORS[action] ?? "#189FD1";
                  const actor = r.actor_id ? actors[r.actor_id] : null;
                  const entityName = r.entity_id ? entityNames[r.entity_id] : null;
                  const meta = (r.meta ?? {}) as Record<string, unknown>;
                  const metaTitle = typeof meta.title === "string" ? meta.title : null;
                  const from = typeof meta.from === "string" ? meta.from : null;
                  const to   = typeof meta.to   === "string" ? meta.to   : null;
                  const href = entityHref(r);
                  const checked = isSelected(r.id);

                  const row = (
                    <div style={{
                      display: "flex", gap: 12, alignItems: "flex-start",
                      padding: "12px 18px",
                      borderBottom: "1px solid var(--border)",
                      background: checked ? "rgba(24,159,209,.10)" : "transparent",
                      transition: "background .12s",
                    }}>
                      <div
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(r.id); }}
                        style={{
                          marginTop: 6,
                          opacity: checked || bulkMode ? 1 : 0,
                          transition: "opacity .12s",
                        }}
                        className="row-bulk-check"
                      >
                        <BulkCheckbox checked={checked} onChange={() => toggle(r.id)} label={lang === "ar" ? "تحديد" : "Select"} />
                      </div>
                      <div style={{
                        width: 34, height: 34, borderRadius: 10,
                        display: "grid", placeItems: "center",
                        background: `${color}22`, color, flexShrink: 0,
                      }}>
                        <Icon size={16} />
                      </div>
                      {actor && <Avatar id={r.actor_id!} name={actor.full_name} size={28} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                          <strong>{actor?.full_name ?? "—"}</strong>{" "}
                          <span style={{ color }}>{t(`act_${action}` as DictKey)}</span>{" "}
                          <span style={{ color: "var(--muted)" }}>{t(`entity_${r.entity_type}` as DictKey) || r.entity_type}</span>
                          {(entityName || metaTitle) && <> <em style={{ color: "var(--foreground)", fontStyle: "normal" }}>"{entityName ?? metaTitle}"</em></>}
                          {from && to && (
                            <span style={{ color: "var(--muted)" }}>
                              {" "}({t(from as DictKey) || from} → <span style={{ color: "var(--foreground)" }}>{t(to as DictKey) || to}</span>)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }} title={new Date(r.created_at).toLocaleString()}>
                          {relativeTime(r.created_at, lang)}
                        </div>
                      </div>
                    </div>
                  );

                  return href && !bulkMode ? (
                    <Link key={r.id} to={href} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
                      {row}
                    </Link>
                  ) : (
                    <div key={r.id} onClick={() => bulkMode && toggle(r.id)} style={{ cursor: bulkMode ? "pointer" : "default" }}>
                      {row}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {!done && rows.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button onClick={() => setPage((p) => p + 1)} disabled={loading} className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
            {loading ? "…" : t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}

