// Unified Export dropdown for finance tabs. Renders a single "Export" button
// that expands to Export PDF / Export Excel. Handlers are provided by the
// consumer (which prepares the columns/rows/kpis). Includes a busy spinner.

import { useEffect, useRef, useState } from "react";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-context";

export type ExportMenuProps = {
  onExportPdf: () => Promise<void> | void;
  onExportXlsx: () => Promise<void> | void;
  disabled?: boolean;
  label?: string;
};

export function ExportMenu({ onExportPdf, onExportXlsx, disabled, label }: ExportMenuProps) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = async (kind: "pdf" | "xlsx", fn: () => Promise<void> | void) => {
    setBusy(kind);
    setOpen(false);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const isBusy = busy !== null;
  const btnLabel = label ?? (ar ? "تصدير" : "Export");

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || isBusy}
        className="brand-btn-sm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          padding: "8px 12px",
          borderRadius: 10,
          fontWeight: 600,
          cursor: disabled || isBusy ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
        }}
        title={btnLabel}
      >
        {isBusy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
        <span>{isBusy ? (ar ? "جاري التصدير..." : "Exporting…") : btnLabel}</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            insetInlineEnd: 0,
            minWidth: 200,
            background: "var(--card, var(--surface-2))",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,.35)",
            padding: 6,
            zIndex: 50,
            display: "grid",
            gap: 2,
          }}
        >
          <MenuItem
            icon={<FileText size={15} />}
            label={t("exportPdf") || (ar ? "تصدير PDF" : "Export PDF")}
            onClick={() => run("pdf", onExportPdf)}
          />
          <MenuItem
            icon={<FileSpreadsheet size={15} />}
            label={t("exportXlsx") || (ar ? "تصدير Excel" : "Export Excel")}
            onClick={() => run("xlsx", onExportXlsx)}
          />
        </div>
      )}
      <style>{`.spin { animation: fx-spin 1s linear infinite; } @keyframes fx-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        color: "var(--foreground)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        textAlign: "start",
        width: "100%",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2, rgba(255,255,255,.05))")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
