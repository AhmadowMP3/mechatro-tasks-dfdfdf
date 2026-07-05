import { createFileRoute, redirect, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { BarChart3, FileText, Building2, TrendingDown, TrendingUp, Settings as SettingsIcon, Wallet, Repeat, FileBarChart2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, is_master_admin, is_finance_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    const ok = prof?.is_master_admin || prof?.role === "admin" || prof?.is_finance_admin;
    if (!ok) throw redirect({ to: "/" });
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

function FinanceLayout() {
  const { lang } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ar = lang === "ar";
  return (
    <div style={{ padding: "0 0 60px" }}>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          padding: "8px 12px",
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: "nowrap",
                textDecoration: "none",
                color: active ? "#fff" : "var(--foreground)",
                background: active ? "var(--grad-blue)" : "transparent",
                border: active ? "none" : "1px solid var(--border)",
              }}
            >
              <Icon size={15} />
              {ar ? tab.label.ar : tab.label.en}
            </Link>
          );
        })}
      </div>
      <div style={{ padding: 16 }}>
        <Outlet />
      </div>
    </div>
  );
}
