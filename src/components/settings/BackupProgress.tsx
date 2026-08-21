import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useApp } from "@/lib/app-context";

export type ProgressState = {
  active: boolean;
  percent: number;
  stageKey: string;
  status: "running" | "success" | "error";
  message?: string;
};

const IDLE: ProgressState = { active: false, percent: 0, stageKey: "", status: "running" };

/**
 * Drives a staged progress bar for single-shot backend calls that don't stream
 * progress: it advances through the given stages up to 90% and only jumps to
 * 100% when the real response arrives.
 */
export function useOperationProgress() {
  const [state, setState] = useState<ProgressState>(IDLE);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (hide.current) { clearTimeout(hide.current); hide.current = null; }
  };

  useEffect(() => () => clear(), []);

  const start = useCallback((stages: string[], expectedMs = 12000) => {
    clear();
    const step = 90 / Math.max(1, Math.round(expectedMs / 250));
    setState({ active: true, percent: 2, stageKey: stages[0] ?? "", status: "running" });
    timer.current = setInterval(() => {
      setState((s) => {
        if (!s.active || s.status !== "running") return s;
        const percent = Math.min(90, s.percent + step);
        const idx = Math.min(stages.length - 1, Math.floor((percent / 90) * stages.length));
        return { ...s, percent, stageKey: stages[idx] ?? s.stageKey };
      });
    }, 250);
  }, []);

  const succeed = useCallback((stageKey: string) => {
    clear();
    setState({ active: true, percent: 100, stageKey, status: "success" });
    hide.current = setTimeout(() => setState(IDLE), 2200);
  }, []);

  const fail = useCallback((message?: string) => {
    clear();
    setState((s) => ({ active: true, percent: Math.max(s.percent, 12), stageKey: s.stageKey, status: "error", message }));
    hide.current = setTimeout(() => setState(IDLE), 9000);
  }, []);

  const reset = useCallback(() => { clear(); setState(IDLE); }, []);

  return { state, start, succeed, fail, reset };
}

export function BackupProgress({ state }: { state: ProgressState }) {
  const { t, lang } = useApp();
  if (!state.active) return null;

  const color = state.status === "error" ? "#F0676A" : state.status === "success" ? "#5BD6A6" : "#42C2EE";
  const pct = Math.round(state.percent);

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={{
        marginBottom: 12, padding: "12px 14px", borderRadius: 12,
        border: `1px solid ${color}59`, background: `${color}12`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
        {state.status === "running" && <Loader2 size={16} color={color} className="brand-spin" />}
        {state.status === "success" && <CheckCircle2 size={16} color={color} />}
        {state.status === "error" && <AlertTriangle size={16} color={color} />}
        <b style={{ color }}>
          {state.status === "error"
            ? t("opFailed")
            : state.status === "success"
              ? t("opDone")
              : t(state.stageKey as never)}
        </b>
        <span style={{ marginInlineStart: "auto", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: color, transition: "width .25s linear",
            boxShadow: `0 0 12px ${color}80`,
          }}
        />
      </div>
      {state.status === "error" && state.message && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#F0676A", wordBreak: "break-word" }}>{state.message}</div>
      )}
    </div>
  );
}

export function Spinner({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return <Loader2 size={size} color={color} className="brand-spin" />;
}
