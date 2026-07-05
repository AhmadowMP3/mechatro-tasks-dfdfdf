import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { detectIconFromUrl, faviconFor, isValidHttpUrl } from "@/lib/references";

import { toast } from "sonner";
import {
  Library, Plus, Search, Pin, PinOff, ExternalLink, Copy, Edit3, Trash2, X, MoreVertical, Tag as TagIcon, Filter,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useBulkSelection, BulkCheckbox } from "@/lib/bulk-selection";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/references")({ component: ReferencesPage });

type RefRow = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  category: string | null;
  tags: string[];
  pinned: boolean;
  icon: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type SortMode = "newest" | "oldest" | "az";

function ReferencesPage() {
  const { t, lang, user, isMasterAdmin } = useApp();
  const confirm = useConfirm();
  const canManage = isMasterAdmin || user?.role === "admin";

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [sort, setSort] = useState<SortMode>("newest");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RefRow | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["references"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as unknown as (t: string) => any)("references").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RefRow[];
    },
  });

  const rows = data ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.tags?.forEach((tg) => set.add(tg)));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = rows.filter((r) => {
      if (onlyPinned && !r.pinned) return false;
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (selectedTags.length && !selectedTags.every((tg) => r.tags?.includes(tg))) return false;
      if (q) {
        const hay = `${r.title} ${r.description ?? ""} ${r.url} ${(r.tags ?? []).join(" ")} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === "az") arr = [...arr].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "oldest") arr = [...arr].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    else arr = [...arr].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.created_at) - +new Date(a.created_at));
    return arr;
  }, [rows, search, onlyPinned, selectedCategory, selectedTags, sort]);

  const { isSelected, toggle, ids: selectedIds } = useBulkSelection<RefRow>({
    pageId: "references",
    items: filtered,
    deps: [filtered.length, canManage, lang],
    buildBar: canManage
      ? (sel, clearSel) => ({
          count: sel.length,
          totalLabel: lang === "ar"
            ? `${sel.length} مرجع محدد`
            : `${sel.length} reference${sel.length === 1 ? "" : "s"} selected`,
          actions: [
            {
              id: "pin",
              label: lang === "ar" ? "تثبيت" : "Pin",
              icon: <Pin size={14} />,
              onRun: async () => {
                await (supabase.from as unknown as (t: string) => any)("references").update({ pinned: true }).in("id", sel);
                clearSel(); refetch();
                toast.success(lang === "ar" ? "تم التثبيت" : "Pinned");
              },
            },
            {
              id: "unpin",
              label: lang === "ar" ? "إلغاء التثبيت" : "Unpin",
              icon: <PinOff size={14} />,
              onRun: async () => {
                await (supabase.from as unknown as (t: string) => any)("references").update({ pinned: false }).in("id", sel);
                clearSel(); refetch();
              },
            },
            {
              id: "delete",
              label: lang === "ar" ? "حذف" : "Delete",
              icon: <Trash2 size={14} />,
              destructive: true,
              confirm: lang === "ar"
                ? `حذف ${sel.length} مرجع؟`
                : `Delete ${sel.length} reference${sel.length === 1 ? "" : "s"}?`,
              onRun: async () => {
                const { error } = await (supabase.from as unknown as (t: string) => any)("references").delete().in("id", sel);
                if (error) { toast.error(error.message); return; }
                toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
                clearSel(); refetch();
              },
            },
          ],
        })
      : () => null,
  });
  const bulkMode = selectedIds.length > 0;

  const togglePin = async (r: RefRow) => {
    await (supabase.from as unknown as (t: string) => any)("references").update({ pinned: !r.pinned }).eq("id", r.id);
    refetch();
  };

  const remove = async (r: RefRow) => {
    if (!confirm(t("confirmDeleteRef"))) return;
    await (supabase.from as unknown as (t: string) => any)("references").delete().eq("id", r.id);
    toast.success(t("deleteReference"));
    refetch();
  };


  const openEdit = (r: RefRow) => { setEditing(r); setShowModal(true); };
  const openNew  = () => { setEditing(null); setShowModal(true); };

  const anyFilter = search || selectedCategory || selectedTags.length || onlyPinned;

  return (
    <div>
      {/* Header */}
      <PageHeader
        title={t("references")}
        subtitle={t("referencesSubtitle")}
        adornment={
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--grad-gold)", display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(231,176,58,.25)", flexShrink: 0 }}>
            <Library size={22} color="#0A1626" />
          </div>
        }
        actions={
          canManage ? (
            <button onClick={openNew} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", minHeight: 44 }}>
              <Plus size={18} /> {t("addReference")}
            </button>
          ) : null
        }
      />


      {/* Filters */}
      <div className="brand-card" style={{ padding: 14, marginBottom: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 220 }}>
            <Search size={16} style={{ position: "absolute", top: "50%", insetInlineStart: 12, transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchReferences")}
              style={{
                width: "100%", minHeight: 42, borderRadius: 10, border: "1px solid var(--border)",
                background: "var(--surface-2)", color: "var(--foreground)",
                paddingInline: "36px 12px", fontSize: 14,
              }}
            />
          </div>

          <div style={{ minWidth: 180 }}>
            <ThemedSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              placeholder={t("allCategories")}
              style={{ minHeight: 42 }}
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <ThemedSelect
              value={sort}
              onChange={(v) => setSort(v as SortMode)}
              style={{ minHeight: 42 }}
              options={[
                { value: "newest", label: t("sortNewest") },
                { value: "oldest", label: t("sortOldest") },
                { value: "az", label: t("sortAZ") },
              ]}
            />
          </div>

          <button
            onClick={() => setOnlyPinned((v) => !v)}
            style={{
              minHeight: 42, padding: "0 14px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
              border: `1px solid ${onlyPinned ? "transparent" : "var(--border)"}`,
              background: onlyPinned ? "var(--grad-gold)" : "var(--surface-2)",
              color: onlyPinned ? "#0A1626" : "var(--foreground)",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Pin size={15} /> {t("onlyPinned")}
          </button>

          {anyFilter ? (
            <button
              onClick={() => { setSearch(""); setSelectedCategory(""); setSelectedTags([]); setOnlyPinned(false); }}
              style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}
            >
              <X size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }}/>{t("clearFilters")}
            </button>
          ) : null}
        </div>

        {allTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <Filter size={14} style={{ color: "var(--muted)" }} />
            {allTags.map((tg) => {
              const on = selectedTags.includes(tg);
              return (
                <button
                  key={tg}
                  onClick={() => setSelectedTags((prev) => on ? prev.filter(x => x !== tg) : [...prev, tg])}
                  style={{
                    padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                    background: on ? "var(--grad-blue)" : "transparent",
                    color: on ? "#fff" : "var(--muted)",
                  }}
                >#{tg}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>...</div>
      ) : filtered.length === 0 ? (
        <EmptyState canManage={!!canManage} onAdd={openNew} t={t} lang={lang} />
      ) : (
        <div style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
        }}>
          {filtered.map((r) => {
            const checked = isSelected(r.id);
            return (
              <div
                key={r.id}
                style={{
                  position: "relative",
                  borderRadius: 16,
                  outline: checked ? "2px solid var(--primary, #189FD1)" : "none",
                  outlineOffset: 2,
                  transition: "outline .12s",
                }}
                onClick={(e) => {
                  if (!bulkMode || !canManage) return;
                  e.stopPropagation();
                  toggle(r.id);
                }}
              >
                {canManage && (
                  <div
                    onClick={(e) => { e.stopPropagation(); toggle(r.id); }}
                    style={{
                      position: "absolute",
                      top: 10,
                      insetInlineStart: 10,
                      zIndex: 5,
                      opacity: checked || bulkMode ? 1 : 0,
                      transition: "opacity .12s",
                    }}
                    className="ref-bulk-check"
                  >
                    <BulkCheckbox checked={checked} onChange={() => toggle(r.id)} label={lang === "ar" ? "تحديد" : "Select"} />
                  </div>
                )}
                <div style={{ pointerEvents: bulkMode ? "none" : "auto" }}>
                  <RefCard
                    row={r}
                    canManage={!!canManage}
                    onPin={() => togglePin(r)}
                    onEdit={() => openEdit(r)}
                    onDelete={() => remove(r)}
                    t={t}
                    lang={lang}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <RefModal
          initial={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); refetch(); }}
          userId={user?.id ?? null}
          t={t}
          lang={lang}
          categories={categories}
        />
      )}
    </div>
  );
}

/* --------------------------- Card --------------------------- */

function RefCard({ row, canManage, onPin, onEdit, onDelete, t, lang }: {
  row: RefRow; canManage: boolean; onPin: () => void; onEdit: () => void; onDelete: () => void;
  t: (k: never) => string; lang: "ar" | "en";
}) {
  const meta = detectIconFromUrl(row.url);
  const [menuOpen, setMenuOpen] = useState(false);
  const isPinned = row.pinned;
  const isRTL = lang === "ar";

  const copy = async () => {
    await navigator.clipboard.writeText(row.url);
    toast.success((t as (k: string) => string)("copied"));
  };

  return (
    <div
      className="brand-card"
      style={{
        padding: 0,
        overflow: "hidden",
        position: "relative",
        display: "flex", flexDirection: "column",
        transition: "transform .18s ease, box-shadow .18s ease",
        border: isPinned ? "1px solid rgba(231,176,58,.55)" : "1px solid var(--border)",
        boxShadow: isPinned ? "0 8px 30px rgba(231,176,58,.15)" : undefined,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Header strip */}
      <div style={{
        background: meta.gradient,
        padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12,
        color: "#fff",
        position: "relative",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(255,255,255,.16)", backdropFilter: "blur(4px)",
          display: "grid", placeItems: "center",
          border: "1px solid rgba(255,255,255,.25)",
          flexShrink: 0, overflow: "hidden",
        }}>
          {meta.icon === "generic" ? (
            <img src={faviconFor(row.url)} alt="" style={{ width: 24, height: 24 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{meta.icon.slice(0, 2)}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, textTransform: "uppercase", letterSpacing: 0.5 }}>{meta.label}</div>
          {row.category && (
            <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>{row.category}</div>
          )}
        </div>

        {isPinned && (
          <div title={(t as (k: string) => string)("pinned")} style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,.2)",
            display: "grid", placeItems: "center",
          }}>
            <Pin size={14} />
          </div>
        )}

        {canManage && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="menu"
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(0,0,0,.2)", color: "#fff",
                border: "none", cursor: "pointer",
                display: "grid", placeItems: "center",
              }}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                <div style={{
                  position: "absolute", top: 38, insetInlineEnd: 0, zIndex: 31,
                  minWidth: 160, background: "var(--surface-3)",
                  border: "1px solid var(--border)", borderRadius: 10,
                  boxShadow: "0 12px 40px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3)",
                  backdropFilter: "blur(8px)",
                  padding: 4, color: "var(--foreground)",
                }}>
                  <MenuItem icon={isPinned ? <PinOff size={14}/> : <Pin size={14}/>} label={isPinned ? (t as (k: string) => string)("unpin") : (t as (k: string) => string)("pin")} onClick={() => { setMenuOpen(false); onPin(); }} />
                  <MenuItem icon={<Edit3 size={14}/>} label={(t as (k: string) => string)("editReference")} onClick={() => { setMenuOpen(false); onEdit(); }} />
                  <MenuItem icon={<Trash2 size={14}/>} label={(t as (k: string) => string)("deleteReference")} onClick={() => { setMenuOpen(false); onDelete(); }} danger />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1.3, color: "var(--foreground)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
          {row.title}
        </div>
        {row.description && (
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>
            {row.description}
          </div>
        )}

        {row.tags && row.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {row.tags.slice(0, 4).map((tg) => (
              <span key={tg} style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 999, background: "var(--surface-2)", color: "var(--muted)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                <TagIcon size={10} />{tg}
              </span>
            ))}
            {row.tags.length > 4 && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>+{row.tags.length - 4}</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, minHeight: 40, borderRadius: 10,
            background: "var(--grad-blue)", color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontWeight: 700, fontSize: 13, textDecoration: "none",
            flexDirection: isRTL ? "row-reverse" : "row",
          }}
        >
          <ExternalLink size={15} /> {(t as (k: string) => string)("openLink")}
        </a>
        <button
          onClick={copy}
          title={(t as (k: string) => string)("copyLink")}
          style={{ minWidth: 40, minHeight: 40, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <Copy size={15} />
        </button>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "8px 10px", borderRadius: 8,
        background: "transparent", border: "none",
        color: danger ? "#F0676A" : "var(--foreground)",
        fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "start",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon}{label}
    </button>
  );
}

/* --------------------------- Empty --------------------------- */

function EmptyState({ canManage, onAdd, t }: { canManage: boolean; onAdd: () => void; t: (k: never) => string; lang: "ar" | "en" }) {
  const tt = t as unknown as (k: string) => string;
  return (
    <div className="brand-card" style={{ padding: "60px 20px", textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--surface-2)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Library size={32} color="var(--muted)" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{tt("noReferences")}</div>
      {canManage && (
        <button onClick={onAdd} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", marginTop: 8 }}>
          <Plus size={16} /> {tt("addFirstReference")}
        </button>
      )}
    </div>
  );
}

/* --------------------------- Modal --------------------------- */

const DEFAULT_CATEGORIES: { ar: string; en: string }[] = [
  { ar: "توثيق", en: "Documentation" },
  { ar: "أدوات", en: "Tools" },
  { ar: "قوالب", en: "Templates" },
  { ar: "مراجع", en: "References" },
  { ar: "تصميم", en: "Design" },
  { ar: "تطوير", en: "Development" },
  { ar: "تعلّم", en: "Learning" },
  { ar: "فيديو", en: "Video" },
  { ar: "مقالات", en: "Articles" },
  { ar: "روابط مهمة", en: "Important links" },
];

function RefModal({ initial, onClose, onSaved, userId, t, lang, categories }: {
  initial: RefRow | null;
  onClose: () => void;
  onSaved: () => void;
  userId: string | null;
  t: (k: never) => string;
  lang: "ar" | "en";
  categories: string[];
}) {
  const tt = t as unknown as (k: string) => string;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, "");
    if (!v || tags.includes(v)) { setTagInput(""); return; }
    setTags((prev) => [...prev, v]);
    setTagInput("");
  };

  const save = async () => {
    if (!title.trim()) { toast.error(tt("titleField")); return; }
    if (!isValidHttpUrl(url.trim())) { toast.error(tt("invalidUrl")); return; }
    setSaving(true);
    const meta = detectIconFromUrl(url.trim());
    const payload = {
      title: title.trim().slice(0, 200),
      url: url.trim().slice(0, 2000),
      description: description.trim().slice(0, 1000) || null,
      category: category.trim().slice(0, 60) || null,
      tags,
      pinned,
      icon: meta.icon,
    };

    if (initial) {
      const { error } = await (supabase.from as unknown as (t: string) => any)("references").update(payload).eq("id", initial.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { error } = await (supabase.from as unknown as (t: string) => any)("references").insert({ ...payload, created_by: userId });
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    toast.success(tt("saved") || "Saved");
    setSaving(false);
    onSaved();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)",
        display: "grid", placeItems: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="brand-card"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
          padding: 22, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--grad-gold)", display: "grid", placeItems: "center" }}>
            <Library size={20} color="#0A1626" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{initial ? tt("editReference") : tt("addReference")}</h3>
          </div>
          <button onClick={onClose} aria-label="close" style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        <Field label={tt("titleField")}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} style={inputStyle} />
        </Field>

        <Field label={tt("url")}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." maxLength={2000} style={inputStyle} />
        </Field>

        <Field label={tt("descriptionField")}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} style={{ ...inputStyle, minHeight: 80, paddingTop: 10, resize: "vertical" }} />
        </Field>

        <Field label={tt("category")}>
          <CategoryCombobox
            value={category}
            onChange={setCategory}
            options={categories}
            defaults={DEFAULT_CATEGORIES.map((c) => (lang === "ar" ? c.ar : c.en))}
            placeholder={tt("categoryPlaceholder")}
            hint={tt("categoryHint")}
            createLabel={tt("createCategory")}
            suggestedLabel={tt("suggestedCategories")}
          />
        </Field>


        <Field label={tt("tagsLabel")}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 6, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)", minHeight: 44 }}>
            {tags.map((tg) => (
              <span key={tg} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 700 }}>
                #{tg}
                <button onClick={() => setTags((p) => p.filter((x) => x !== tg))} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder={tt("addTag")}
              style={{ flex: 1, minWidth: 120, background: "transparent", border: "none", outline: "none", color: "var(--foreground)", fontSize: 13, padding: "6px 4px" }}
            />
          </div>
        </Field>

        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#E7B03A" }} />
          <Pin size={16} color="#E7B03A" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tt("pinned")}</span>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", fontWeight: 700 }}>
            {tt("cancel") || "Cancel"}
          </button>
          <button onClick={save} disabled={saving} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", minHeight: 44, opacity: saving ? 0.6 : 1 }}>
            {tt("save") || "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 44, borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--foreground)",
  padding: "0 12px", fontSize: 14,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

const CHIP_PALETTE = [
  { fg: "#189FD1", bg: "rgba(24,159,209,0.14)", ring: "rgba(24,159,209,0.45)" },
  { fg: "#C8A24B", bg: "rgba(200,162,75,0.16)", ring: "rgba(200,162,75,0.5)" },
  { fg: "#A78BFA", bg: "rgba(167,139,250,0.16)", ring: "rgba(167,139,250,0.5)" },
  { fg: "#22C55E", bg: "rgba(34,197,94,0.14)", ring: "rgba(34,197,94,0.45)" },
  { fg: "#F0676A", bg: "rgba(240,103,106,0.14)", ring: "rgba(240,103,106,0.45)" },
  { fg: "#FF8A3D", bg: "rgba(255,138,61,0.14)", ring: "rgba(255,138,61,0.45)" },
];
function accentFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

function CategoryCombobox({
  value, onChange, options, defaults = [], placeholder, hint, createLabel, suggestedLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  defaults?: string[];
  placeholder: string;
  hint: string;
  createLabel: string;
  suggestedLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const norm = (s: string) => s.trim().toLowerCase();
  const q = norm(query);
  // Merge defaults with data-derived options, case-insensitive dedupe, defaults first.
  const merged = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of [...defaults, ...options]) {
      const k = norm(c);
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(c);
    }
    return out;
  }, [defaults, options]);
  const filtered = useMemo(
    () => merged.filter((o) => !value || o !== value).filter((o) => !q || norm(o).includes(q)).slice(0, 30),
    [merged, q, value],
  );
  const exactExists = merged.some((o) => norm(o) === q);
  const canCreate = q.length > 0 && !exactExists;
  const selected = value.trim();
  const selectedFromList = merged.some((o) => o === selected);
  const showSuggestedLabel = !q && !selected && filtered.length > 0 && !!suggestedLabel;

  const commit = (v: string) => {
    const t = v.trim().slice(0, 60);
    if (!t) return;
    onChange(t);
    setQuery("");
  };
  const clear = () => { onChange(""); setQuery(""); };

  return (
    <div
      style={{
        border: `1px solid ${focused ? "var(--brand-blue)" : "var(--border)"}`,
        background: "var(--surface-2)",
        borderRadius: 14,
        padding: 10,
        display: "flex", flexDirection: "column", gap: 10,
        boxShadow: focused ? "0 0 0 3px color-mix(in oklab, var(--brand-blue) 22%, transparent)" : "none",
        transition: "border-color .15s, box-shadow .15s",
      }}
    >
      {/* Row 1: selected pill + input */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {selected && (
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 10px 6px 8px", borderRadius: 999,
              background: selectedFromList
                ? "var(--grad-blue)"
                : "linear-gradient(135deg, #F5A623 0%, #F0676A 100%)",
              color: "#fff",
              border: selectedFromList ? "none" : "1px solid rgba(255,255,255,.15)",
              fontSize: 13, fontWeight: 800, letterSpacing: 0.2,
              boxShadow: "0 4px 14px -6px rgba(0,0,0,.35)",
            }}
          >
            <TagIcon size={13} />
            {selected}
            <button
              type="button"
              onClick={clear}
              aria-label="clear category"
              style={{
                display: "grid", placeItems: "center",
                width: 18, height: 18, borderRadius: 999,
                background: "rgba(0,0,0,.18)", border: "none",
                color: "inherit", cursor: "pointer", padding: 0,
              }}
            >
              <X size={11} />
            </button>
          </span>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canCreate) commit(query);
              else if (filtered[0]) commit(filtered[0]);
            } else if (e.key === "Backspace" && !query && selected) {
              e.preventDefault(); clear();
            } else if (e.key === "Escape") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={selected ? "" : placeholder}
          maxLength={60}
          style={{
            flex: 1, minWidth: 140, height: 32,
            background: "transparent", border: "none", outline: "none",
            color: "var(--foreground)", fontSize: 14, padding: "0 4px",
          }}
        />
      </div>

      {/* Row 2: chip cloud */}
      {(filtered.length > 0 || canCreate) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {showSuggestedLabel && (
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: "var(--muted)", textTransform: "uppercase" }}>
              {suggestedLabel}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(query); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 999,
                background: "linear-gradient(135deg, #F5A623 0%, #F0676A 100%)",
                color: "#FFFFFF",
                border: "1px solid rgba(255,255,255,.15)", cursor: "pointer",
                fontSize: 12, fontWeight: 800, letterSpacing: 0.2,
                boxShadow: "0 6px 18px -6px rgba(240,103,106,.55)",
                transition: "transform .12s ease, box-shadow .12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 8px 22px -6px rgba(240,103,106,.7)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 6px 18px -6px rgba(240,103,106,.55)";
              }}
            >
              <Plus size={13} color="#FFFFFF" />
              <span>{createLabel} <span style={{ opacity: .95 }}>&ldquo;{query.trim()}&rdquo;</span></span>
            </button>
          )}
          {filtered.map((c) => {
            const a = accentFor(c);
            return (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(c); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 999,
                  background: a.bg, color: a.fg,
                  border: `1px solid ${a.ring}`,
                  fontSize: 11.5, fontWeight: 800, letterSpacing: 0.2,
                  cursor: "pointer",
                  transition: "transform .12s ease, background .12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                <TagIcon size={10} />
                {c}
              </button>
            );
          })}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--muted)", opacity: 0.8 }}>{hint}</div>
    </div>
  );
}

