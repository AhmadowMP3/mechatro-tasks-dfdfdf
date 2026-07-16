import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { formatMoney, invoiceStatusColor, invoiceStatusKey, type Invoice, type InvoiceStatus, type Customer } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { Plus, Search, FileText } from "lucide-react";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { exportFinanceListPdf, exportFinanceListXlsx } from "@/lib/finance-list-export";
import { useFinancialSettings } from "@/lib/finance-hooks";

export const Route = createFileRoute("/_authenticated/finance/invoices/")({
  component: InvoicesListPage,
});


function InvoicesListPage() {
  const { t, lang } = useApp();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name_ar, name_en, company");
      return ((data ?? []) as Pick<Customer, "id" | "name_ar" | "name_en" | "company">[]);
    },
  });

  const custMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers ?? []) {
      const name = lang === "ar" ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar);
      m.set(c.id, name || c.company || "—");
    }
    return m;
  }, [customers, lang]);

  const filtered = useMemo(() => {
    return (invoices ?? []).filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const term = q.trim().toLowerCase();
      const custName = custMap.get(inv.customer_id) ?? "";
      return inv.number.toLowerCase().includes(term) || custName.toLowerCase().includes(term);
    });
  }, [invoices, statusFilter, q, custMap]);

  const statuses: (InvoiceStatus | "all")[] = ["all", "draft", "issued", "partially_paid", "paid", "overdue", "void"];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{t("invoices")}</h1>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchInvoices")}
            style={{ width: "100%", padding: "10px 14px 10px 36px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 13 }}
          />
        </div>
        <Link to="/finance/invoices/new" className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", textDecoration: "none" }}>
          <Plus size={16} /> {t("newInvoice")}
        </Link>
      </div>

      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "4px 0" }}>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="brand-btn-sm"
            style={{
              background: statusFilter === s ? "var(--grad-blue)" : "var(--surface-2)",
              color: statusFilter === s ? "#fff" : "var(--foreground)",
              border: "1px solid var(--border)",
              whiteSpace: "nowrap",
            }}
          >
            {s === "all" ? t("filterAll") : t(invoiceStatusKey(s))}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noInvoices")}</div>
      ) : (
        <div className="brand-card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
                <th style={th}>{t("invoiceNumber")}</th>
                <th style={th}>{t("customer")}</th>
                <th style={th}>{t("invoiceDate")}</th>
                <th style={th}>{t("dueDate")}</th>
                <th style={{ ...th, textAlign: "end" }}>{t("grandTotal")}</th>
                <th style={{ ...th, textAlign: "end" }}>{t("amountDue")}</th>
                <th style={th}>{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const balance = Number(inv.total) - Number(inv.amount_paid);
                const colors = invoiceStatusColor(inv.status);
                return (
                  <tr key={inv.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>
                      <Link to="/finance/invoices/$id" params={{ id: inv.id }} style={{ color: "var(--foreground)", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <FileText size={13} /> {inv.number}
                      </Link>
                    </td>
                    <td style={td}>{custMap.get(inv.customer_id) ?? "—"}</td>
                    <td style={td}>{formatDate(inv.issue_date, lang)}</td>
                    <td style={td}>{inv.due_date ? formatDate(inv.due_date, lang) : "—"}</td>
                    <td style={{ ...td, textAlign: "end", fontWeight: 600 }}>{formatMoney(inv.total, inv.currency, lang)}</td>
                    <td style={{ ...td, textAlign: "end", color: balance > 0 ? "#F0676A" : "var(--muted)" }}>{formatMoney(balance, inv.currency, lang)}</td>
                    <td style={td}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: colors.bg, color: colors.fg, fontSize: 11, fontWeight: 700 }}>
                        {t(invoiceStatusKey(inv.status))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "start", fontSize: 11, fontWeight: 700, textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "12px", verticalAlign: "middle" };
