import { createFileRoute, redirect, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { BarChart3, FileText, Building2, TrendingDown, TrendingUp, Settings as SettingsIcon, Wallet, Repeat, FileBarChart2 } from "lucide-react";
import { FinanceVaultProvider, useFinanceVault } from "@/lib/finance/vault-context";
import { FinanceLockGate } from "@/components/finance/FinanceLockGate";
import { Lock } from "lucide-react";
import "@/styles/finance.css";

export const Route = createFileRoute("/_authenticated/finance")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, is_master_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    // Finance is Master-only.
    if (!prof?.is_master_admin) throw redirect({ to: "/" });
  },
  component: FinanceLayout,
});

const TABS = [
  { to: "/finance", label: { ar: "لوحة", en: "Overview" }, icon: BarChart3, exact: true },
  { to: "/finance/invoices", label: { ar: "الفواتير", en: "Invoices" }, icon: FileText },
  { to: "/finance/customers", label: { ar: "العملاء", en: "Customers" }, icon: Building2 },
  { to: "/finance/expenses", label: { ar: "المصاريف", en: "Expenses" }, icon: TrendingDown },
  { to: "/finance/income", label: { ar: "الدخل", en: "Income" }, icon: TrendingUp },
  { to: "/finance/payroll", label: { ar: "الرواتب", en: "Payroll" }, icon: Wallet },
  { to: "/finance/subscriptions", label: { ar: "الاشتراكات", en: "Subscriptions" }, icon: Repeat },
  { to: "/finance/reports", label: { ar: "التقارير", en: "Reports" }, icon: FileBarChart2 },
  { to: "/finance/settings", label: { ar: "إعدادات", en: "Settings" }, icon: SettingsIcon },
];

function LockButton() {
  const { lang } = useApp();
  const { status, lock } = useFinanceVault();
  if (status !== "unlocked") return null;
  return (
    <button
      type="button"
      onClick={lock}
      title={lang === "ar" ? "قفل الخزنة" : "Lock vault"}
      style={{
        marginInlineStart: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 700,
        whiteSpace: "nowrap",
        padding: "8px 14px",
        borderRadius: 11,
        color: "var(--foreground)",
        background: "transparent",
        border: "1px solid var(--border)",
        cursor: "pointer",
      }}
    >
      <Lock size={16} />
      {lang === "ar" ? "قفل" : "Lock"}
    </button>
  );
}

function FinanceLayoutInner() {
  const { lang } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ar = lang === "ar";
  return (
    <div style={{ padding: "0 0 60px" }}>
      <div
        role="tablist"
        className="finance-tabs"
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "10px 20px",
          scrollPaddingInline: 20,
          scrollbarWidth: "none",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
          maskImage: "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(tab.to + "/");
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              data-active={active ? "true" : "false"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                whiteSpace: "nowrap",
                textDecoration: "none",
                color: active ? "#fff" : "var(--foreground)",
                background: active ? "var(--grad-blue)" : "transparent",
                border: active ? "none" : "1px solid var(--border)",
              }}
            >
              <Icon size={17} />
              {ar ? tab.label.ar : tab.label.en}
            </Link>
          );
        })}
        <LockButton />
      </div>
      <div className="finance-root" style={{ padding: 20 }}>
        <FinanceLockGate>
          <Outlet />
        </FinanceLockGate>
      </div>
    </div>
  );
}

function FinanceLayout() {
  return (
    <FinanceVaultProvider>
      <FinanceLayoutInner />
    </FinanceVaultProvider>
  );
}
