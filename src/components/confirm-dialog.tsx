import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/app-context";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const settle = (v: boolean) => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(v);
  };

  const isAr = lang === "ar";
  const danger = !!opts?.danger;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) settle(false); }}>
        <AlertDialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="brand-card"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,.4)",
            maxWidth: 440,
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ textAlign: isAr ? "right" : "left", fontSize: 18 }}>
              {opts?.title ?? t("confirmDefaultTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--muted)", textAlign: isAr ? "right" : "left", fontSize: 14, lineHeight: 1.6 }}>
              {opts?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ display: "flex", gap: 8, flexDirection: isAr ? "row-reverse" : "row", justifyContent: "flex-end" }}>
            <AlertDialogCancel
              onClick={() => settle(false)}
              className="brand-btn"
              style={{
                background: "var(--surface-2)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                margin: 0,
              }}
            >
              {opts?.cancelText ?? t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className="brand-btn"
              style={{
                background: danger ? "var(--grad-red, linear-gradient(135deg,#d9484b,#a83236))" : "var(--grad-blue)",
                color: "#fff",
                border: "none",
                fontWeight: 700,
              }}
            >
              {opts?.confirmText ?? t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  );
}
