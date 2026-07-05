// Bulk-selection primitives used across pages.
//
// Each page owns its own set of selected ids and registers a "context"
// (label + actions) with the global BulkActionBar host. Only one context
// is active at a time (the page in view), so we key by page id.

import {
  createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode,
} from "react";
import { X, Loader2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useConfirm } from "@/components/confirm-dialog";

export type BulkAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onRun: () => Promise<void> | void;
  disabled?: boolean;
  confirm?: string;   // if set, requires typed/click confirmation via window.confirm
};

type BulkContextValue = {
  pageId: string;
  count: number;
  totalLabel: string; // e.g. "3 tasks selected"
  actions: BulkAction[];
  onClear: () => void;
};

type BulkHostCtx = {
  current: BulkContextValue | null;
  setCurrent: (v: BulkContextValue | null) => void;
};

const HostCtx = createContext<BulkHostCtx | null>(null);

export function BulkActionHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<BulkContextValue | null>(null);
  const value = useMemo(() => ({ current, setCurrent }), [current]);
  return (
    <HostCtx.Provider value={value}>
      {children}
      <BulkActionBar />
    </HostCtx.Provider>
  );
}

/**
 * useBulkSelection — page-level selection state.
 *
 * Registers the current selection with the host so the floating BulkActionBar
 * shows automatically. Pass the action set via `getActions` — it re-runs when
 * selection or dependencies change (via `deps`).
 */
export function useBulkSelection<T extends { id: string }>(opts: {
  pageId: string;
  items: T[];
  buildBar: (selectedIds: string[], clear: () => void) => Omit<BulkContextValue, "pageId" | "onClear"> | null;
  deps?: React.DependencyList;
}) {
  const host = useContext(HostCtx);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(opts.items.map((i) => i.id)));
  }, [opts.items]);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Prune ids that no longer exist in items (after refetch)
  useEffect(() => {
    const validIds = new Set(opts.items.map((i) => i.id));
    setSelected((cur) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of cur) {
        if (validIds.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : cur;
    });
  }, [opts.items]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);
  const ids = useMemo(() => Array.from(selected), [selected]);

  // Push the context up to the host whenever selection changes.
  const buildBar = opts.buildBar;
  const pageId = opts.pageId;
  useEffect(() => {
    if (!host) return;
    if (ids.length === 0) {
      // Only clear if we own the current context.
      if (host.current?.pageId === pageId) host.setCurrent(null);
      return;
    }
    const built = buildBar(ids, clear);
    if (!built) return;
    host.setCurrent({ pageId, onClear: clear, ...built });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.length, pageId, ...(opts.deps ?? [])]);

  // On unmount, if we own the host, release it.
  useEffect(() => {
    return () => {
      if (host?.current?.pageId === pageId) host.setCurrent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Listen for global "bulk:select-all" and "bulk:clear" events (shortcuts).
  useEffect(() => {
    const onSelectAll = (e: Event) => {
      const detail = (e as CustomEvent<{ pageId?: string }>).detail;
      if (!detail?.pageId || detail.pageId === pageId) selectAll();
    };
    const onClear = (e: Event) => {
      const detail = (e as CustomEvent<{ pageId?: string }>).detail;
      if (!detail?.pageId || detail.pageId === pageId) clear();
    };
    window.addEventListener("bulk:select-all", onSelectAll);
    window.addEventListener("bulk:clear", onClear);
    return () => {
      window.removeEventListener("bulk:select-all", onSelectAll);
      window.removeEventListener("bulk:clear", onClear);
    };
  }, [pageId, selectAll, clear]);

  return { selected, ids, isSelected, toggle, selectAll, clear, setSelected };
}

function BulkActionBar() {
  const host = useContext(HostCtx);
  const { lang } = useApp();
  const confirm = useConfirm();
  const [running, setRunning] = useState<string | null>(null);

  if (!host?.current) return null;
  const { count, totalLabel, actions, onClear } = host.current;

  const runAction = async (a: BulkAction) => {
    if (a.disabled) return;
    if (a.confirm && !(await confirm({ message: a.confirm, danger: a.danger }))) return;
    setRunning(a.id);
    try { await a.onRun(); } finally { setRunning(null); }
  };

  return (
    <div
      role="toolbar"
      aria-label={lang === "ar" ? "إجراءات متعددة" : "Bulk actions"}
      className="bulk-action-bar"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px 8px 16px",
        borderRadius: 999,
        background: "linear-gradient(135deg, rgba(15,23,42,.98), rgba(30,41,59,.98))",
        border: "1px solid rgba(148,163,184,.25)",
        boxShadow: "0 20px 40px -12px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04) inset",
        color: "#fff",
        maxWidth: "min(96vw, 720px)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8, paddingRight: 8,
        borderRight: "1px solid rgba(255,255,255,.12)",
      }}>
        <span style={{
          minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999,
          background: "var(--grad-blue, #189FD1)", color: "#fff",
          fontWeight: 800, fontSize: 12, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
        }}>{count}</span>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{totalLabel}</span>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {actions.map((a) => (
          <button
            key={a.id}
            onClick={() => runAction(a)}
            disabled={a.disabled || running !== null}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8,
              background: a.destructive
                ? "rgba(214,69,69,.15)"
                : "rgba(255,255,255,.08)",
              border: `1px solid ${a.destructive ? "rgba(214,69,69,.35)" : "rgba(255,255,255,.15)"}`,
              color: a.destructive ? "#ff8a8a" : "#fff",
              fontWeight: 600, fontSize: 12.5, cursor: a.disabled ? "not-allowed" : "pointer",
              opacity: a.disabled ? 0.4 : 1, whiteSpace: "nowrap",
              transition: "background .15s, border-color .15s",
            }}
            onMouseEnter={(e) => {
              if (a.disabled) return;
              e.currentTarget.style.background = a.destructive
                ? "rgba(214,69,69,.25)" : "rgba(255,255,255,.16)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = a.destructive
                ? "rgba(214,69,69,.15)" : "rgba(255,255,255,.08)";
            }}
          >
            {running === a.id ? <Loader2 size={14} className="spin" /> : a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onClear}
        aria-label={lang === "ar" ? "إلغاء" : "Clear selection"}
        title={lang === "ar" ? "إلغاء (Esc)" : "Clear (Esc)"}
        style={{
          marginLeft: 4, width: 30, height: 30, borderRadius: 999,
          background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
          color: "#cbd5e1", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/** Small styled checkbox for row selection. */
export function BulkCheckbox({
  checked, onChange, label, stopPropagation = true,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  stopPropagation?: boolean;
}) {
  return (
    <label
      onClick={(e) => stopPropagation && e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: 6, cursor: "pointer",
        background: checked ? "var(--grad-blue, #189FD1)" : "transparent",
        border: `1.5px solid ${checked ? "transparent" : "var(--border)"}`,
        transition: "background .12s, border-color .12s",
        flexShrink: 0,
      }}
      title={label}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        aria-label={label}
      />
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.5l2.5 2.5L10 3.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </label>
  );
}
