import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/lib/app-context";

type PromptOpts = {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  kind?: "prompt" | "confirm";
};

type Resolver = (value: string | null) => void;

let openFn: ((opts: PromptOpts) => Promise<string | null>) | null = null;

export function openPrompt(opts: PromptOpts): Promise<string | null> {
  if (!openFn) return Promise.resolve(null);
  return openFn(opts);
}

export function openConfirm(title: string, opts?: Partial<PromptOpts>): Promise<boolean> {
  return openPrompt({ title, kind: "confirm", ...opts }).then((r) => r !== null);
}

export function PromptHost() {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PromptOpts | null>(null);
  const [value, setValue] = useState("");
  const resolverRef = useRef<Resolver | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    openFn = (o) => new Promise<string | null>((resolve) => {
      setOpts(o);
      setValue(o.defaultValue ?? "");
      resolverRef.current = resolve;
      setOpen(true);
    });
    return () => { openFn = null; };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const finish = (v: string | null) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setOpen(false);
  };

  if (!open || !opts) return null;
  const isConfirm = opts.kind === "confirm";
  const confirmLabel = opts.confirmLabel ?? (lang === "ar" ? (isConfirm ? "تأكيد" : "حفظ") : (isConfirm ? "Confirm" : "Save"));
  const cancelLabel = opts.cancelLabel ?? (lang === "ar" ? "إلغاء" : "Cancel");

  return (
    <div onClick={() => finish(null)} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
        width: "min(440px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,.5)",
      }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{opts.title}</div>
          <button onClick={() => finish(null)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        {!isConfirm && (
          <div style={{ padding: "14px 16px" }}>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") finish(value); }}
              placeholder={opts.placeholder}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--border)", background: "var(--surface-2)",
                color: "var(--foreground)", fontSize: 14, outline: "none",
              }}
            />
          </div>
        )}
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => finish(null)} style={{
            padding: "8px 14px", borderRadius: 8, background: "transparent",
            border: "1px solid var(--border)", color: "var(--foreground)",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>{cancelLabel}</button>
          <button onClick={() => finish(isConfirm ? "" : value)} style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: opts.destructive ? "var(--destructive)" : "var(--grad-blue)",
            color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
