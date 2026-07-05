import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, LinkIcon, Link2, MoreVertical, Trash2, Pause, Play, Check, Crown, User as UserIcon, X,
  Copy, Clock, Mail, Sparkles, RefreshCw, Ban, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { useBulkSelection, BulkCheckbox } from "@/lib/bulk-selection";


export const Route = createFileRoute("/_authenticated/access-control")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase.from("profiles").select("role, is_master_admin").eq("id", data.user.id).maybeSingle();
    const isAdmin = prof?.is_master_admin || prof?.role === "admin";
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AccessControlPage,
});

type UserRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  email: string | null;
  username: string | null;
  role: "admin" | "member" | "manager" | "viewer";
  status: "pending" | "active" | "suspended";
  is_master_admin: boolean;
  invited_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
};


async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    // Supabase FunctionsHttpError attaches the Response on `context` — read its JSON body to surface the real error.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const txt = await ctx.clone().text();
        const parsed = JSON.parse(txt) as { error?: string };
        if (parsed?.error) throw new Error(parsed.error);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message && parseErr.message !== "Unexpected end of JSON input") {
          throw parseErr;
        }
      }
    }
    throw new Error(error.message);
  }
  const payload = data as { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return data;
}


function AccessControlPage() {
  const { lang } = useApp();
  const l = lang === "ar";
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pending">("all");
  const [invitesBump, setInvitesBump] = useState(0);
  const [live, setLive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    try {
      const res = await call({ action: "list" }) as { users?: UserRow[] };
      const list = Array.isArray(res?.users) ? res.users : [];
      setUsers(list.map((u) => ({
        ...u,
        full_name: u.full_name ?? (u.email?.split("@")[0] ?? "User"),
        status: (u.status ?? "active") as UserRow["status"],
        role: (u.role ?? "member") as UserRow["role"],
      })));
    } catch (e) {
      setUsers([]);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); }, []);

  // Realtime: refresh on any profile or invite change.
  useEffect(() => {
    const scheduleReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { load(); }, 250);
    };
    const channel = supabase
      .channel("access-control-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "invites" },
        () => setInvitesBump((n) => n + 1))
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  async function act(action: string, user_id: string, extra?: Record<string, unknown>) {
    setBusyId(user_id);
    try {
      await call({ action, user_id, ...extra });
      await load();
      toast.success(l ? "تم" : "Done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  // Optimistic role change — flip the pill immediately, revert on failure.
  async function changeRole(user_id: string, role: "admin" | "member") {
    const prev = users;
    setUsers((cur) => (cur ?? []).map((u) => u.id === user_id ? { ...u, role } : u));
    setBusyId(user_id);
    try {
      await call({ action: "set_role", user_id, role });
      toast.success(l ? "تم تحديث الدور" : "Role updated");
      await load();
    } catch (e) {
      setUsers(prev);
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  const shown = (users ?? []).filter((u) => tab === "all" ? true : u.status === "pending");
  const pendingCount = (users ?? []).filter((u) => u.status === "pending").length;

  // Bulk mode — master admins are always excluded from the selectable set.
  const bulkableItems = shown.filter((u) => !u.is_master_admin);
  const { isSelected, toggle, ids: selectedIds } = useBulkSelection<UserRow>({
    pageId: "access-control",
    items: bulkableItems,
    deps: [bulkableItems.length, tab, lang],
    buildBar: (sel, clearSel) => {
      const runBulk = async (action: string, extra?: Record<string, unknown>) => {
        let ok = 0; let fail = 0;
        for (const id of sel) {
          try { await call({ action, user_id: id, ...extra }); ok++; }
          catch { fail++; }
        }
        await load();
        clearSel();
        if (fail === 0) toast.success(l ? `تم على ${ok}` : `${ok} updated`);
        else toast.error(l ? `فشل ${fail} من ${sel.length}` : `${fail} of ${sel.length} failed`);
      };
      const pendingOnly = sel.every((id) => shown.find((u) => u.id === id)?.status === "pending");
      const suspendedOnly = sel.every((id) => shown.find((u) => u.id === id)?.status === "suspended");
      return {
        count: sel.length,
        totalLabel: l
          ? `${sel.length} مستخدم محدد`
          : `${sel.length} user${sel.length === 1 ? "" : "s"} selected`,
        actions: [
          ...(pendingOnly ? [{
            id: "approve-member",
            label: l ? "قبول كأعضاء" : "Approve as members",
            icon: <Check size={14} />,
            onRun: () => runBulk("approve", { role: "member" }),
          }] : []),
          ...(!pendingOnly && !suspendedOnly ? [
            {
              id: "make-admin",
              label: l ? "ترقية إلى مشرف" : "Make admin",
              icon: <Crown size={14} />,
              onRun: () => runBulk("set_role", { role: "admin" }),
            },
            {
              id: "make-member",
              label: l ? "تخفيض إلى عضو" : "Make member",
              icon: <UserIcon size={14} />,
              onRun: () => runBulk("set_role", { role: "member" }),
            },
            {
              id: "suspend",
              label: l ? "تعليق" : "Suspend",
              icon: <Pause size={14} />,
              onRun: () => runBulk("suspend"),
            },
          ] : []),
          ...(suspendedOnly ? [{
            id: "activate",
            label: l ? "تفعيل" : "Activate",
            icon: <Play size={14} />,
            onRun: () => runBulk("activate"),
          }] : []),
          {
            id: "delete",
            label: l ? "حذف" : "Delete",
            icon: <Trash2 size={14} />,
            destructive: true,
            confirm: l
              ? `حذف ${sel.length} مستخدم؟ لا يمكن التراجع.`
              : `Delete ${sel.length} user${sel.length === 1 ? "" : "s"}? This cannot be undone.`,
            onRun: () => runBulk("delete"),
          },
        ],
      };
    },
  });
  const bulkMode = selectedIds.length > 0;

  return (
    <div style={{ padding: "clamp(16px,3vw,32px)", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        title={l ? "الأعضاء والدعوات" : "People & Invites"}
        subtitle={l ? "ادعُ أعضاء برابط، وافق على الطلبات، وأدر الأدوار" : "Invite people by link, approve requests, and manage roles"}
        adornment={
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
            display: "grid", placeItems: "center", color: "#fff",
            boxShadow: "0 8px 24px rgba(29,155,240,.35)",
            flexShrink: 0,
          }}><ShieldCheck size={22} /></div>
        }
        compactActions={
          <span title={live ? "Realtime connected" : "Realtime connecting…"} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
            background: live ? "rgba(20,168,110,.14)" : "rgba(159,183,201,.12)",
            color: live ? "#14A86E" : "var(--muted)",
            border: `1px solid ${live ? "rgba(20,168,110,.35)" : "var(--border)"}`,
            flexShrink: 0,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: live ? "#14A86E" : "var(--muted)",
              boxShadow: live ? "0 0 0 4px rgba(20,168,110,.18)" : "none",
              animation: live ? "pulse 1.6s ease-in-out infinite" : undefined,
            }} />
            {l ? (live ? "مباشر" : "…") : (live ? "Live" : "…")}
          </span>
        }
      />


      <div style={{ display: "flex", gap: 10, marginTop: 22, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          display: "inline-flex", background: "var(--surface-3)", borderRadius: 12, padding: 4,
          border: "1px solid var(--border)",
        }}>
          {[
            { k: "all", label: l ? "الكل" : "All" },
            { k: "pending", label: (l ? "بانتظار الموافقة" : "Pending") + (pendingCount ? ` · ${pendingCount}` : "") },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k as "all" | "pending")} style={{
              padding: "10px 18px", borderRadius: 8,
              background: tab === k ? "linear-gradient(135deg,#1D9BF0,#0F6BB8)" : "transparent",
              color: tab === k ? "#fff" : "var(--muted)",
              border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
              minHeight: 40,
            }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowInvite(true)} style={primaryBtn}>
          <LinkIcon size={16} />{l ? "توليد رابط دعوة" : "Generate invite link"}
        </button>

      </div>

      {users === null && <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>…</div>}
      {shown.length === 0 && users !== null && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          {tab === "pending"
            ? (l ? "لا توجد طلبات معلّقة" : "No pending requests")
            : (l ? "لا مستخدمين" : "No users")}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((u) => {
          const checked = isSelected(u.id);
          const selectable = !u.is_master_admin;
          return (
          <div
            key={u.id}
            onClick={() => { if (bulkMode && selectable) toggle(u.id); }}
            style={{
              ...rowCard,
              cursor: bulkMode && selectable ? "pointer" : (rowCard as React.CSSProperties).cursor,
              background: checked ? "rgba(24,159,209,.10)" : (rowCard as React.CSSProperties).background,
              outline: checked ? "1.5px solid var(--primary,#189FD1)" : (rowCard as React.CSSProperties).outline,
            }}
          >
            {selectable && (
              <div
                onClick={(e) => { e.stopPropagation(); toggle(u.id); }}
                className="row-bulk-check"
                style={{ opacity: checked || bulkMode ? 1 : 0, transition: "opacity .12s", flexShrink: 0 }}
              >
                <BulkCheckbox checked={checked} onChange={() => toggle(u.id)} label={l ? "تحديد" : "Select"} />
              </div>
            )}
            <Avatar id={u.id} name={u.full_name} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{u.full_name}</span>
                {u.is_master_admin && (
                  <span style={{
                    padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                    background: "linear-gradient(135deg,#F0B429,#F09F26)", color: "#1A1408",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}><Crown size={11} />{l ? "مدير" : "MASTER"}</span>
                )}
                <StatusPill status={u.status} lang={lang} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }} dir="ltr">{u.username ? `@${u.username}` : "—"}</div>
              <div style={{ fontSize: 11.5, color: "#7A94A9", marginTop: 3 }}>
                {u.last_sign_in_at
                  ? (l ? "آخر دخول: " : "Last sign-in: ") + relativeTime(u.last_sign_in_at, lang)
                  : (l ? "لم يسجّل الدخول بعد" : "Has not signed in yet")}
              </div>
            </div>

            {u.status === "pending" && !u.is_master_admin && (
              <>
                <button onClick={() => act("approve", u.id, { role: "member" })}
                  disabled={busyId === u.id} style={approveBtn}>
                  <Check size={14} />{l ? "قبول كعضو" : "Approve · Member"}
                </button>
                <button onClick={() => act("approve", u.id, { role: "admin" })}
                  disabled={busyId === u.id} style={approveAdminBtn}>
                  <ShieldCheck size={14} />{l ? "قبول كمشرف" : "Approve · Admin"}
                </button>
              </>
            )}

            {u.status !== "pending" && !u.is_master_admin && (
              <select
                disabled={busyId === u.id}
                value={u.role === "admin" ? "admin" : "member"}
                onChange={(e) => changeRole(u.id, e.target.value as "admin" | "member")}
                style={selectStyle}
              >
                <option value="member">{l ? "عضو" : "Member"}</option>
                <option value="admin">{l ? "نائب مدير" : "Admin"}</option>
              </select>
            )}

            {!u.is_master_admin && (
              <UserMenu user={u} lang={lang} busy={busyId === u.id} onAction={(a, extra) => act(a, u.id, extra)} />
            )}
          </div>
          );
        })}
      </div>

      <PendingInvitesList lang={lang} refreshKey={String(invitesBump)} />

      {showInvite && (
        <InviteModal
          lang={lang}
          onClose={() => setShowInvite(false)}
          onInvited={() => { load(); }}
        />
      )}
    </div>
  );
}


function StatusPill({ status, lang }: { status: UserRow["status"]; lang: "ar" | "en" }) {
  const l = lang === "ar";
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending:   { bg: "rgba(240,180,41,.16)",  text: "#F0B429", label: l ? "بانتظار الموافقة" : "Pending" },
    active:    { bg: "rgba(20,168,110,.16)",  text: "#14A86E", label: l ? "مفعّل"           : "Active" },
    suspended: { bg: "rgba(240,103,106,.16)", text: "#F0676A", label: l ? "معلّق"           : "Suspended" },
  };
  const m = map[status] ?? { bg: "rgba(159,183,201,.16)", text: "var(--muted)", label: String(status ?? "—") };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: m.bg, color: m.text,
    }}>{m.label}</span>
  );
}


function UserMenu({ user, lang, busy, onAction }: {
  user: UserRow; lang: "ar" | "en"; busy: boolean;
  onAction: (a: "suspend" | "activate" | "delete", extra?: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const l = lang === "ar";
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((s) => !s)} disabled={busy} aria-label="menu" style={{
        width: 40, height: 40, borderRadius: 10, background: "var(--surface-3)",
        color: "var(--foreground)", border: "1px solid var(--border)",
        cursor: busy ? "wait" : "pointer", display: "grid", placeItems: "center",
      }}><MoreVertical size={16} /></button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0, zIndex: 41,
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 6, minWidth: 200,
            boxShadow: "0 12px 28px rgba(0,0,0,.45)",
          }}>
            {user.status !== "suspended" && (
              <MenuItem icon={Pause} label={l ? "تعليق الحساب" : "Suspend"}
                onClick={() => { setOpen(false); setReason(""); setShowReason(true); }} />
            )}
            {user.status === "suspended" && (
              <MenuItem icon={Play} label={l ? "تفعيل" : "Activate"}
                onClick={() => { setOpen(false); onAction("activate"); }} />
            )}
            <MenuItem icon={Trash2} danger label={l ? "حذف نهائي" : "Delete permanently"}
              onClick={() => {
                if (confirm(l ? "حذف هذا المستخدم نهائيًا؟" : "Delete this user permanently?")) {
                  setOpen(false); onAction("delete");
                }
              }} />
          </div>
        </>
      )}

      {showReason && (
        <div onClick={() => setShowReason(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 300,
          display: "grid", placeItems: "center", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 460, background: "var(--card)",
            border: "1px solid rgba(240,103,106,.35)", borderRadius: 18,
            padding: 22, color: "var(--foreground)",
            boxShadow: "0 24px 60px rgba(0,0,0,.55)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: "linear-gradient(135deg,#F0676A,#B83338)",
                display: "grid", placeItems: "center",
              }}><Pause size={18} color="#fff" /></div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {l ? "تعليق حساب" : "Suspend account"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {user.full_name}
                </div>
              </div>
            </div>
            <label style={{ display: "block", fontSize: 12.5, color: "var(--muted)", margin: "12px 0 6px" }}>
              {l ? "السبب (اختياري) — سيظهر للمستخدم" : "Reason (optional) — shown to the user"}
            </label>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              rows={3} autoFocus
              placeholder={l ? "مثال: مخالفة سياسة الاستخدام" : "e.g. Policy violation"}
              style={{
                width: "100%", padding: 10, borderRadius: 10,
                background: "#0A1826", color: "var(--foreground)",
                border: "1px solid var(--border)", fontSize: 14, resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => setShowReason(false)} style={{
                padding: "10px 16px", borderRadius: 10, background: "transparent",
                color: "var(--foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 600,
              }}>{l ? "إلغاء" : "Cancel"}</button>
              <button onClick={() => { setShowReason(false); onAction("suspend", { reason: reason.trim() }); }}
                style={{
                  padding: "10px 16px", borderRadius: 10,
                  background: "linear-gradient(135deg,#F0676A,#B83338)",
                  color: "#fff", border: "none", cursor: "pointer", fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}><Pause size={14} />{l ? "تعليق الآن" : "Suspend now"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: React.ComponentType<{ size?: number }>; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8, background: "transparent",
      color: danger ? "#F0676A" : "var(--foreground)",
      border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600, textAlign: "start",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(240,103,106,.1)" : "rgba(255,255,255,.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    ><Icon size={15} />{label}</button>
  );
}

function InviteModal({ lang, onClose, onInvited }: {
  lang: "ar" | "en"; onClose: () => void; onInvited: () => void;
}) {
  const l = lang === "ar";
  const [role, setRole] = useState<"member" | "admin">("member");
  const [access, setAccess] = useState<"self_serve" | "preset">("self_serve");
  const [fullName, setFullName] = useState("");
  const [presetPassword, setPresetPassword] = useState("");

  const [showPreset, setShowPreset] = useState(false);
  const [expiry, setExpiry] = useState<"24h" | "7d" | "30d" | "never">("7d");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{
    url: string; expires_at: string | null; preset_password: string | null; full_name: string | null;
  } | null>(null);
  const [copied, setCopied] = useState<"link" | "pw" | "both" | null>(null);

  function genReadablePassword() {
    const words = ["swift","calm","brave","sunny","clever","brisk","gentle","lucky","noble","quiet","rapid","royal","witty","zesty","cosmic","mellow"];
    const animals = ["otter","tiger","falcon","panda","eagle","koala","lion","wolf","fox","hawk","lynx","seal","yak","zebra"];
    const w = words[Math.floor(Math.random() * words.length)];
    const a = animals[Math.floor(Math.random() * animals.length)];
    const n = Math.floor(10 + Math.random() * 90);
    return `${w}-${a}-${n}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (access === "preset" && presetPassword.trim().length < 8) {
      toast.error(l ? "كلمة المرور يجب أن تكون ٨ أحرف على الأقل" : "Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-invites", {
        body: {
          action: "create",
          role,
          expires_in: expiry,
          full_name: fullName.trim() || null,

          preset_password: access === "preset" ? presetPassword.trim() : null,
        },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as {
        invite?: { token: string; expires_at: string | null; full_name: string | null };
        preset_password?: string | null;
        error?: string;
      };
      if (res.error) throw new Error(res.error);
      const invite = res.invite;
      if (!invite?.token) throw new Error("No token returned");
      const url = `${window.location.origin}/accept-invite?token=${invite.token}`;
      setGenerated({
        url,
        expires_at: invite.expires_at ?? null,
        preset_password: res.preset_password ?? null,
        full_name: invite.full_name ?? (fullName.trim() || null),
      });
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }


  async function copyLink() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.url);
      setCopied("link");
      toast.success(l ? "تم نسخ الرابط" : "Link copied");
      setTimeout(() => setCopied(null), 2000);
    } catch { /* noop */ }
  }
  async function copyPassword() {
    if (!generated?.preset_password) return;
    try {
      await navigator.clipboard.writeText(generated.preset_password);
      setCopied("pw");
      toast.success(l ? "تم نسخ كلمة المرور" : "Password copied");
      setTimeout(() => setCopied(null), 2000);
    } catch { /* noop */ }
  }
  async function copyBoth() {
    if (!generated?.preset_password) return;
    const block = `${l ? "الرابط" : "Link"}: ${generated.url}\n${l ? "كلمة المرور" : "Password"}: ${generated.preset_password}`;
    try {
      await navigator.clipboard.writeText(block);
      setCopied("both");
      toast.success(l ? "تم النسخ" : "Copied");
      setTimeout(() => setCopied(null), 2000);
    } catch { /* noop */ }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      zIndex: 100, display: "grid", placeItems: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "clamp(16px, 3vw, 22px)", width: "100%", maxWidth: 500,
        maxHeight: "calc(100dvh - 32px)", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg,#F0B429,#F09F26)",
              display: "grid", placeItems: "center", color: "#1A1408",
            }}><Sparkles size={18} /></div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
              {generated
                ? (l ? "الرابط جاهز" : "Your invite link")
                : (l ? "توليد رابط دعوة" : "Generate invite link")}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {generated ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              padding: 14, borderRadius: 12,
              background: "rgba(240,180,41,.08)", border: "1px dashed rgba(240,180,41,.35)",
              fontSize: 12.5, color: "#F0B429", textAlign: "center",
            }}>
              {generated.preset_password
                ? (l
                    ? "احفظ كلمة المرور الآن — لن تظهر مرة أخرى. أرسل الرابط وكلمة المرور للعضو."
                    : "Save the password now — it won't be shown again. Send the link and password to the invitee.")
                : (l
                    ? "انسخ هذا الرابط وأرسله للعضو يدويًا. صالح لاستخدام واحد فقط."
                    : "Copy this link and share it manually. Single-use only.")}
            </div>

            {generated.full_name && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {l ? "للمُرسَل إليه: " : "Recipient: "}
                <strong style={{ color: "var(--foreground)" }}>{generated.full_name}</strong>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7A94A9", marginBottom: 4, letterSpacing: 0.5 }}>
                {l ? "الرابط" : "LINK"}
              </div>
              <div style={{
                padding: 12, borderRadius: 10, background: "var(--sidebar)",
                border: "1px solid var(--border)", fontFamily: "monospace",
                fontSize: 12.5, color: "var(--foreground)", wordBreak: "break-all", direction: "ltr",
              }}>{generated.url}</div>
            </div>

            {generated.preset_password && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#7A94A9", marginBottom: 4, letterSpacing: 0.5 }}>
                  {l ? "كلمة المرور" : "PASSWORD"}
                </div>
                <div style={{
                  padding: 12, borderRadius: 10, background: "var(--sidebar)",
                  border: "1px solid rgba(240,180,41,.35)", fontFamily: "monospace",
                  fontSize: 15, fontWeight: 800, color: "#F0B429", wordBreak: "break-all", direction: "ltr",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <span>{generated.preset_password}</span>
                  <button type="button" onClick={copyPassword} style={{
                    minHeight: 34, padding: "0 12px", borderRadius: 8,
                    background: copied === "pw" ? "linear-gradient(135deg,#14A86E,#0E7B4F)" : "rgba(240,180,41,.15)",
                    color: copied === "pw" ? "#fff" : "#F0B429",
                    border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12,
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}>
                    {copied === "pw" ? <Check size={13} /> : <Copy size={13} />}
                    {copied === "pw" ? (l ? "تم" : "Copied") : (l ? "نسخ" : "Copy")}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: generated.preset_password ? "1fr 1fr" : (typeof navigator !== "undefined" && "share" in navigator ? "1fr 1fr" : "1fr"), gap: 10 }}>
              <button onClick={copyLink} style={{
                minHeight: 48, borderRadius: 12, border: "none", cursor: "pointer",
                background: copied === "link"
                  ? "linear-gradient(135deg,#14A86E,#0E7B4F)"
                  : "linear-gradient(135deg,#F0B429,#F09F26)",
                color: copied === "link" ? "#fff" : "#1A1408", fontWeight: 900, fontSize: 14,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: copied === "link" ? "0 8px 24px rgba(20,168,110,.35)" : "0 8px 24px rgba(240,180,41,.35)",
                transition: "all .2s",
              }}>
                {copied === "link" ? <Check size={16} /> : <Copy size={16} />}
                {copied === "link" ? (l ? "تم النسخ" : "Copied!") : (l ? "نسخ الرابط" : "Copy link")}
              </button>
              {generated.preset_password ? (
                <button onClick={copyBoth} style={{
                  minHeight: 48, borderRadius: 12, cursor: "pointer",
                  background: copied === "both" ? "linear-gradient(135deg,#14A86E,#0E7B4F)" : "transparent",
                  border: "1.5px solid #1D9BF0",
                  color: copied === "both" ? "#fff" : "#1D9BF0", fontWeight: 900, fontSize: 14,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  {copied === "both" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "both" ? (l ? "تم النسخ" : "Copied!") : (l ? "نسخ الاثنين" : "Copy both")}
                </button>
              ) : typeof navigator !== "undefined" && "share" in navigator ? (
                <button
                  onClick={async () => {
                    if (!generated) return;
                    try {
                      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
                        title: l ? "دعوة إلى Mechatro" : "Mechatro invite",
                        text: l ? "لقد تمّت دعوتك للانضمام" : "You've been invited to join",
                        url: generated.url,
                      });
                    } catch { /* user dismissed */ }
                  }}
                  style={{
                    minHeight: 48, borderRadius: 12, cursor: "pointer",
                    background: "transparent", border: "1.5px solid #1D9BF0",
                    color: "#1D9BF0", fontWeight: 900, fontSize: 14,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <Share2 size={16} />{l ? "مشاركة" : "Share"}
                </button>
              ) : null}
            </div>
            {generated.expires_at && (
              <div style={{ fontSize: 12, color: "#7A94A9", textAlign: "center" }}>
                <Clock size={11} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />
                {l ? "ينتهي في " : "Expires "} {new Date(generated.expires_at).toLocaleString(l ? "ar-EG" : "en-US")}
              </div>
            )}
            <button onClick={onClose} style={ghostBtn}>{l ? "إغلاق" : "Close"}</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label={l ? "الدور" : "Role"}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                {[
                  { v: "member", icon: UserIcon, ar: "عضو", en: "Member", desc: l ? "وصول محدود" : "Limited access" },
                  { v: "admin",  icon: ShieldCheck, ar: "نائب مدير", en: "Admin", desc: l ? "وصول كامل" : "Full access" },
                ].map(({ v, icon: Icon, ar, en, desc }) => (
                  <button key={v} type="button" onClick={() => setRole(v as "member" | "admin")} style={{
                    padding: 12, borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${role === v ? "#1D9BF0" : "var(--border)"}`,
                    background: role === v ? "rgba(29,155,240,.08)" : "transparent",
                    color: "var(--foreground)", textAlign: "start",
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 14 }}>
                      <Icon size={14} />{l ? ar : en}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={l ? "طريقة الدخول" : "Access"}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {[
                  { v: "self_serve", ar: "المستلم يختار كلمة المرور", en: "Invitee sets password", desc: l ? "يفعّل حسابه بنفسه" : "They pick their own" },
                  { v: "preset",     ar: "كلمة مرور مُعدَّة",         en: "Preset password",       desc: l ? "أنت تحدّدها وترسلها" : "You set it & share it" },
                ].map(({ v, ar, en, desc }) => (
                  <button key={v} type="button" onClick={() => setAccess(v as "self_serve" | "preset")} style={{
                    padding: 12, borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${access === v ? "#F0B429" : "var(--border)"}`,
                    background: access === v ? "rgba(240,180,41,.08)" : "transparent",
                    color: "var(--foreground)", textAlign: "start",
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{l ? ar : en}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={l ? "الاسم الكامل" : "Full name"}>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder={l ? "مثال: أحمد محمود" : "e.g. Ahmed Mahmoud"}
                required style={inputCss} />
            </Field>


            {access === "preset" && (
              <Field label={l ? "كلمة المرور (٨ أحرف على الأقل)" : "Password (min 8 characters)"}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type={showPreset ? "text" : "password"} value={presetPassword}
                    onChange={(e) => setPresetPassword(e.target.value)}
                    minLength={8} required style={{ ...inputCss, flex: 1 }} dir="ltr"
                    autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPreset((s) => !s)}
                    title={showPreset ? (l ? "إخفاء" : "Hide") : (l ? "إظهار" : "Show")}
                    style={{
                      minHeight: 44, padding: "0 12px", borderRadius: 10,
                      background: "var(--surface-3)", color: "var(--foreground)", border: "1px solid var(--border)",
                      cursor: "pointer", fontWeight: 700, fontSize: 12,
                    }}>{showPreset ? (l ? "إخفاء" : "Hide") : (l ? "إظهار" : "Show")}</button>
                  <button type="button" onClick={() => { setPresetPassword(genReadablePassword()); setShowPreset(true); }}
                    title={l ? "توليد" : "Generate"}
                    style={{
                      minHeight: 44, padding: "0 12px", borderRadius: 10,
                      background: "linear-gradient(135deg,#F0B429,#F09F26)", color: "#1A1408",
                      border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12,
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}><Sparkles size={13} />{l ? "توليد" : "Gen"}</button>
                </div>
                <div style={{ fontSize: 11, color: "#7A94A9", marginTop: 4 }}>
                  {l ? "ستظهر مرة واحدة فقط بعد الإنشاء — احفظها لإرسالها." : "Shown once after creation — save it to share."}
                </div>
              </Field>
            )}

            <Field label={l ? "مدة الصلاحية" : "Expires in"}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {([
                  { v: "24h",   ar: "٢٤ ساعة",   en: "24 hours" },
                  { v: "7d",    ar: "٧ أيام",    en: "7 days" },
                  { v: "30d",   ar: "٣٠ يومًا",  en: "30 days" },
                  { v: "never", ar: "بدون انتهاء", en: "Never" },
                ] as const).map(({ v, ar, en }) => (
                  <button key={v} type="button" onClick={() => setExpiry(v)} style={{
                    padding: "8px 14px", borderRadius: 999, cursor: "pointer", minHeight: 36,
                    border: `1.5px solid ${expiry === v ? "#1D9BF0" : "var(--border)"}`,
                    background: expiry === v ? "rgba(29,155,240,.12)" : "transparent",
                    color: expiry === v ? "#1D9BF0" : "var(--muted)",
                    fontWeight: 700, fontSize: 12.5,
                  }}>{l ? ar : en}</button>
                ))}
              </div>
            </Field>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" onClick={onClose} style={ghostBtn}>{l ? "إلغاء" : "Cancel"}</button>
              <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                <LinkIcon size={16} />{busy ? (l ? "جارٍ…" : "Generating…") : (l ? "توليد الرابط" : "Generate link")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

type InviteRow = {
  id: string;
  token: string;
  role: "admin" | "member";
  email: string | null;
  full_name: string | null;
  expires_at: string | null;
  is_email_locked: boolean;
  used_at: string | null;
  revoked_at: string | null;
  used_by: string | null;
  created_at: string;
};

function PendingInvitesList({ lang, refreshKey }: { lang: "ar" | "en"; refreshKey: string }) {
  const l = lang === "ar";
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const { data, error } = await supabase.functions.invoke("admin-invites", { body: { action: "list" } });
      if (error) throw new Error(error.message);
      const list = ((data as { invites?: InviteRow[] })?.invites) ?? [];
      setRows(list);
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); }, [refreshKey]);

  async function copyOne(token: string) {
    const url = `${window.location.origin}/accept-invite?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(l ? "تم نسخ الرابط" : "Link copied");
    } catch { /* noop */ }
  }

  async function revoke(id: string) {
    if (!confirm(l ? "إلغاء هذه الدعوة نهائيًا؟" : "Revoke this invite?")) return;
    setBusyId(id);
    try {
      const { error } = await supabase.functions.invoke("admin-invites", { body: { action: "revoke", id } });
      if (error) throw new Error(error.message);
      toast.success(l ? "تم الإلغاء" : "Revoked");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  const active = (rows ?? []).filter((r) => !r.used_at && !r.revoked_at);
  if (!rows) return null;
  if (active.length === 0) return null;

  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Link2 size={18} color="#F0B429" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
          {l ? "روابط الدعوة النشطة" : "Active invite links"}
        </h2>
        <span style={{
          padding: "2px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
          background: "rgba(240,180,41,.15)", color: "#F0B429",
        }}>{active.length}</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{
          padding: "6px 10px", borderRadius: 8, background: "transparent",
          color: "var(--muted)", border: "1px solid var(--border)",
          cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4,
        }}><RefreshCw size={12} />{l ? "تحديث" : "Refresh"}</button>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {active.map((r) => {
          const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now();
          return (
            <div key={r.id} style={{
              ...rowCard,
              borderColor: expired ? "rgba(240,103,106,.35)" : "var(--border)",
              opacity: expired ? 0.7 : 1,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: r.role === "admin"
                  ? "linear-gradient(135deg,#1D9BF0,#0F6BB8)"
                  : "linear-gradient(135deg,#F0B429,#F09F26)",
                display: "grid", placeItems: "center",
                color: r.role === "admin" ? "#fff" : "#1A1408",
              }}>
                {r.is_email_locked ? <Mail size={20} /> : <LinkIcon size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {r.is_email_locked
                      ? (r.email ?? (l ? "بريد محدد" : "Email-locked"))
                      : (l ? "رابط مفتوح" : "Open link")}
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                    background: r.role === "admin" ? "rgba(29,155,240,.16)" : "rgba(240,180,41,.16)",
                    color: r.role === "admin" ? "#1D9BF0" : "#F0B429",
                  }}>{r.role === "admin" ? (l ? "نائب مدير" : "Admin") : (l ? "عضو" : "Member")}</span>
                  {expired && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                      background: "rgba(240,103,106,.16)", color: "#F0676A",
                    }}>{l ? "منتهية" : "Expired"}</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "#7A94A9", marginTop: 3, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Clock size={11} />
                  {r.expires_at
                    ? ((l ? "تنتهي " : "Expires ") + relativeTime(r.expires_at, lang))
                    : (l ? "بدون انتهاء" : "Never expires")}
                  <span style={{ opacity: 0.5 }}> · </span>
                  {l ? "أُنشئت " : "Created "} {relativeTime(r.created_at, lang)}
                </div>
              </div>
              <button onClick={() => copyOne(r.token)} disabled={!!expired} style={{
                ...approveBtn,
                background: "rgba(240,180,41,.12)", color: "#F0B429",
                borderColor: "rgba(240,180,41,.35)",
              }}><Copy size={13} />{l ? "نسخ" : "Copy"}</button>
              <button onClick={() => revoke(r.id)} disabled={busyId === r.id} style={{
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(240,103,106,.12)", color: "#F0676A",
                border: "1px solid rgba(240,103,106,.35)", cursor: busyId === r.id ? "wait" : "pointer",
                fontWeight: 700, fontSize: 12.5, minHeight: 36,
                display: "inline-flex", alignItems: "center", gap: 5,
              }}><Ban size={13} />{l ? "إلغاء" : "Revoke"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}


const rowCard: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, padding: 14, flexWrap: "wrap",
  background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 12,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 10,
  background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)", color: "#fff",
  border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
};
const approveBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8,
  background: "rgba(20,168,110,.15)", color: "#14A86E",
  border: "1px solid rgba(20,168,110,.35)", cursor: "pointer", fontWeight: 700, fontSize: 12.5,
  display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36,
};
const approveAdminBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8,
  background: "rgba(29,155,240,.15)", color: "#1D9BF0",
  border: "1px solid rgba(29,155,240,.35)", cursor: "pointer", fontWeight: 700, fontSize: 12.5,
  display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36,
};
const ghostBtn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 10, background: "transparent",
  color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer",
  fontWeight: 700, fontSize: 13.5, minHeight: 40,
};
const selectStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, background: "var(--sidebar)",
  color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 13,
  minWidth: 140, minHeight: 36,
};
const inputCss: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 10, background: "var(--sidebar)",
  color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 14,
  width: "100%", boxSizing: "border-box", minHeight: 42,
};
