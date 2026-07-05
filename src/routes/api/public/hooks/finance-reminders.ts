import { createFileRoute } from "@tanstack/react-router";

type ReminderPayload = {
  entityType: "invoice" | "subscription_expense" | "subscription_income";
  entityId: string;
  reminderType: "due_soon" | "overdue";
  userIds: string[];
  title_ar: string;
  title_en: string;
  body: string;
};

export const Route = createFileRoute("/api/public/hooks/finance-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Optional apikey check — /api/public/* already bypasses edge auth but
        // we still verify the header when present so accidental hits from the
        // public web fail loudly.
        const providedKey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expectedKey =
          process.env.SUPABASE_ANON_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          "";
        if (providedKey && expectedKey && providedKey !== expectedKey) {
          return new Response(JSON.stringify({ error: "invalid apikey" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date();

        // 1. Recipients: finance admins + master admins
        const { data: adminProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .or("is_master_admin.eq.true,is_finance_admin.eq.true,role.eq.admin")
          .eq("active", true);
        const adminIds: string[] = (adminProfiles ?? []).map((p) => p.id);

        if (adminIds.length === 0) {
          return Response.json({ ok: true, sent: 0, note: "no admin recipients" });
        }

        const toSend: ReminderPayload[] = [];

        // 2. Overdue invoices — flip status + notify
        const { data: overdueInvoices } = await supabaseAdmin
          .from("invoices")
          .select("id, number, total, amount_paid, due_date, currency, status, customer_id")
          .in("status", ["issued", "partially_paid"])
          .lt("due_date", today);

        for (const inv of overdueInvoices ?? []) {
          const balance = Number(inv.total) - Number(inv.amount_paid);
          if (balance <= 0) continue;
          // Flip to overdue
          await supabaseAdmin.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
          toSend.push({
            entityType: "invoice",
            entityId: inv.id,
            reminderType: "overdue",
            userIds: adminIds,
            title_ar: `فاتورة متأخرة: ${inv.number ?? ""}`,
            title_en: `Overdue invoice: ${inv.number ?? ""}`,
            body: `Balance ${balance.toFixed(2)} ${inv.currency} — due ${inv.due_date}`,
          });
        }

        // 3. Invoices due within 3 days
        const soon = new Date(now);
        soon.setDate(now.getDate() + 3);
        const soonStr = soon.toISOString().slice(0, 10);
        const { data: dueSoonInvoices } = await supabaseAdmin
          .from("invoices")
          .select("id, number, total, amount_paid, due_date, currency, status")
          .in("status", ["issued", "partially_paid"])
          .gte("due_date", today)
          .lte("due_date", soonStr);

        for (const inv of dueSoonInvoices ?? []) {
          const balance = Number(inv.total) - Number(inv.amount_paid);
          if (balance <= 0) continue;
          toSend.push({
            entityType: "invoice",
            entityId: inv.id,
            reminderType: "due_soon",
            userIds: adminIds,
            title_ar: `فاتورة قريبة الاستحقاق: ${inv.number ?? ""}`,
            title_en: `Invoice due soon: ${inv.number ?? ""}`,
            body: `Balance ${balance.toFixed(2)} ${inv.currency} — due ${inv.due_date}`,
          });
        }

        // 4. Subscriptions (expense) due for renewal
        const { data: subExp } = await supabaseAdmin
          .from("subscriptions_expense")
          .select("id, name, amount, currency, next_renewal_date, reminder_days, status");

        for (const s of subExp ?? []) {
          if (s.status !== "active") continue;
          const nextDate = new Date(s.next_renewal_date);
          const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / 86400000);
          if (daysUntil < 0 || daysUntil > s.reminder_days) continue;
          toSend.push({
            entityType: "subscription_expense",
            entityId: s.id,
            reminderType: "due_soon",
            userIds: adminIds,
            title_ar: `اشتراك قريب التجديد: ${s.name}`,
            title_en: `Subscription renewal soon: ${s.name}`,
            body: `${s.amount} ${s.currency} · ${s.next_renewal_date} · in ${daysUntil}d`,
          });
        }

        // 5. Subscriptions (income) upcoming invoice
        const { data: subInc } = await supabaseAdmin
          .from("subscriptions_income")
          .select("id, plan_name, amount, currency, next_invoice_date, reminder_days, status");

        for (const s of subInc ?? []) {
          if (s.status !== "active") continue;
          const nextDate = new Date(s.next_invoice_date);
          const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / 86400000);
          if (daysUntil < 0 || daysUntil > s.reminder_days) continue;
          toSend.push({
            entityType: "subscription_income",
            entityId: s.id,
            reminderType: "due_soon",
            userIds: adminIds,
            title_ar: `اشتراك عميل قريب الفوترة: ${s.plan_name}`,
            title_en: `Client subscription due to invoice: ${s.plan_name}`,
            body: `${s.amount} ${s.currency} · ${s.next_invoice_date} · in ${daysUntil}d`,
          });
        }

        // 6. Dedupe against reminders_log (same entity + type + day)
        let sent = 0;
        for (const p of toSend) {
          const { data: already } = await supabaseAdmin
            .from("finance_reminders_log")
            .select("id")
            .eq("entity_type", p.entityType)
            .eq("entity_id", p.entityId)
            .eq("reminder_type", p.reminderType)
            .eq("sent_on", today)
            .maybeSingle();
          if (already) continue;

          // Insert notifications for each recipient
          const rows = p.userIds.map((uid) => ({
            user_id: uid,
            type: p.reminderType === "overdue" ? "invoice_overdue" : "finance_due_soon",
            title_ar: p.title_ar,
            title_en: p.title_en,
            body: p.body,
            entity_id: p.entityId,
          }));
          if (rows.length > 0) {
            await supabaseAdmin.from("notifications").insert(rows);
          }

          // Mark as sent
          await supabaseAdmin.from("finance_reminders_log").insert({
            entity_type: p.entityType,
            entity_id: p.entityId,
            reminder_type: p.reminderType,
            sent_on: today,
          });
          sent++;
        }

        return Response.json({ ok: true, sent, evaluated: toSend.length });
      },
    },
  },
});
