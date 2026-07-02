import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, LinkIcon, Link2, MoreVertical, Trash2, Pause, Play, Check, Crown, User as UserIcon, X,
  Copy, Clock, Mail, Sparkles, RefreshCw, Ban,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { relativeTime } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/access-control")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase.from("profiles").select("is_master_admin").eq("id", data.user.id).maybeSingle();
    if (!prof?.is_master_admin) throw redirect({ to: "/" });
  },
  component: AccessControlPage,
});

type UserRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  email: string | null;
  role: "admin" | "member" | "manager" | "viewer";
  status: "pending" | "active" | "suspended";
  is_master_admin: boolean;
  invited_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
};

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw new Error(error.message);
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

  return (
    <div style={{ padding: "clamp(16px,3vw,32px)", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
          display: "grid", placeItems: "center", color: "#fff",
          boxShadow: "0 8px 24px rgba(29,155,240,.35)",
        }}><ShieldCheck size={26} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
            {l ? "التحكم بالصلاحيات" : "Access Control"}
          </h1>
          <div style={{ color: "#9FB7C9", fontSize: 13.5, marginTop: 2 }}>
            {l ? "الموافقة على الطلبات وإدارة الأدوار" : "Approve access requests and assign roles"}
          </div>
        </div>
        <span title={live ? "Realtime connected" : "Realtime connecting…"} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
          background: live ? "rgba(20,168,110,.14)" : "rgba(159,183,201,.12)",
          color: live ? "#14A86E" : "#9FB7C9",
          border: `1px solid ${live ? "rgba(20,168,110,.35)" : "#1E364D"}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: live ? "#14A86E" : "#9FB7C9",
            boxShadow: live ? "0 0 0 4px rgba(20,168,110,.18)" : "none",
            animation: live ? "pulse 1.6s ease-in-out infinite" : undefined,
          }} />
          {l ? (live ? "مباشر" : "…") : (live ? "Live" : "…")}
        </span>
      </header>

      <div style={{ display: "flex", gap: 10, marginTop: 22, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          display: "inline-flex", background: "#13283D", borderRadius: 12, padding: 4,
          border: "1px solid #1E364D",
        }}>
          {[
            { k: "all", label: l ? "الكل" : "All" },
            { k: "pending", label: (l ? "بانتظار الموافقة" : "Pending") + (pendingCount ? ` · ${pendingCount}` : "") },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k as "all" | "pending")} style={{
              padding: "10px 18px", borderRadius: 8,
              background: tab === k ? "linear-gradient(135deg,#1D9BF0,#0F6BB8)" : "transparent",
              color: tab === k ? "#fff" : "#B9CBDA",
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

      {users === null && <div style={{ padding: 40, textAlign: "center", color: "#9FB7C9" }}>…</div>}
      {shown.length === 0 && users !== null && (
        <div style={{ padding: 40, textAlign: "center", color: "#9FB7C9" }}>
          {tab === "pending"
            ? (l ? "لا توجد طلبات معلّقة" : "No pending requests")
            : (l ? "لا مستخدمين" : "No users")}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((u) => (
          <div key={u.id} style={rowCard}>
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
              <div style={{ fontSize: 12.5, color: "#9FB7C9", marginTop: 2 }} dir="ltr">{u.email ?? "—"}</div>
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
                onChange={(e) => act("set_role", u.id, { role: e.target.value })}
                style={selectStyle}
              >
                <option value="member">{l ? "عضو" : "Member"}</option>
                <option value="admin">{l ? "نائب مدير" : "Admin"}</option>
              </select>
            )}

            {!u.is_master_admin && (
              <UserMenu user={u} lang={lang} busy={busyId === u.id} onAction={(a) => act(a, u.id)} />
            )}
          </div>
        ))}
      </div>

      <PendingInvitesList lang={lang} refreshKey={String(users?.length ?? 0) + String(showInvite)} />

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
  const m = map[status] ?? { bg: "rgba(159,183,201,.16)", text: "#9FB7C9", label: String(status ?? "—") };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: m.bg, color: m.text,
    }}>{m.label}</span>
  );
}


function UserMenu({ user, lang, busy, onAction }: {
  user: UserRow; lang: "ar" | "en"; busy: boolean;
  onAction: (a: "suspend" | "activate" | "delete") => void;
}) {
  const [open, setOpen] = useState(false);
  const l = lang === "ar";
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((s) => !s)} disabled={busy} aria-label="menu" style={{
        width: 40, height: 40, borderRadius: 10, background: "#13283D",
        color: "#EAF2F9", border: "1px solid #1E364D",
        cursor: busy ? "wait" : "pointer", display: "grid", placeItems: "center",
      }}><MoreVertical size={16} /></button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0, zIndex: 41,
            background: "#0F2033", border: "1px solid #1E364D",
            borderRadius: 12, padding: 6, minWidth: 200,
            boxShadow: "0 12px 28px rgba(0,0,0,.45)",
          }}>
            {user.status !== "suspended" && (
              <MenuItem icon={Pause} label={l ? "تعليق الحساب" : "Suspend"}
                onClick={() => { setOpen(false); onAction("suspend"); }} />
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
      color: danger ? "#F0676A" : "#EAF2F9",
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
  const [mode, setMode] = useState<"open" | "locked">("open");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [expiry, setExpiry] = useState<"24h" | "7d" | "30d" | "never">("7d");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ url: string; expires_at: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-invites", {
        body: {
          action: "create",
          role,
          expires_in: expiry,
          email: mode === "locked" ? email.trim().toLowerCase() : null,
          full_name: mode === "locked" ? fullName.trim() : null,
        },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { invite?: { token: string; expires_at: string | null }; error?: string };
      if (res.error) throw new Error(res.error);
      const invite = res.invite;
      if (!invite?.token) throw new Error("No token returned");
      const url = `${window.location.origin}/accept-invite?token=${invite.token}`;
      setGenerated({ url, expires_at: invite.expires_at ?? null });
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }


  async function copyLink() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.url);
      setCopied(true);
      toast.success(l ? "تم نسخ الرابط" : "Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      zIndex: 100, display: "grid", placeItems: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#0F2033", border: "1px solid #1E364D",
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
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9FB7C9", cursor: "pointer" }}>
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
              {l
                ? "انسخ هذا الرابط وأرسله للعضو يدويًا. صالح لاستخدام واحد فقط."
                : "Copy this link and share it manually. Single-use only."}
            </div>
            <div style={{
              padding: 12, borderRadius: 10, background: "#0A1A2B",
              border: "1px solid #1E364D", fontFamily: "monospace",
              fontSize: 12.5, color: "#EAF2F9", wordBreak: "break-all", direction: "ltr",
            }}>{generated.url}</div>
            <button onClick={copyLink} style={{
              minHeight: 48, borderRadius: 12, border: "none", cursor: "pointer",
              background: copied
                ? "linear-gradient(135deg,#14A86E,#0E7B4F)"
                : "linear-gradient(135deg,#F0B429,#F09F26)",
              color: copied ? "#fff" : "#1A1408", fontWeight: 900, fontSize: 14,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: copied ? "0 8px 24px rgba(20,168,110,.35)" : "0 8px 24px rgba(240,180,41,.35)",
              transition: "all .2s",
            }}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? (l ? "تم النسخ" : "Copied!") : (l ? "نسخ الرابط" : "Copy link")}
            </button>
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
                    border: `1.5px solid ${role === v ? "#1D9BF0" : "#1E364D"}`,
                    background: role === v ? "rgba(29,155,240,.08)" : "transparent",
                    color: "#EAF2F9", textAlign: "start",
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 14 }}>
                      <Icon size={14} />{l ? ar : en}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#9FB7C9" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={l ? "نوع الرابط" : "Link binding"}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                {[
                  { v: "open",   ar: "مفتوح للجميع", en: "Open link", desc: l ? "أول من يفتحه يستخدمه" : "First to open claims it" },
                  { v: "locked", ar: "مقيّد ببريد",  en: "Email-locked", desc: l ? "يُقبل من بريد محدد فقط" : "Only a specific email may sign up" },
                ].map(({ v, ar, en, desc }) => (
                  <button key={v} type="button" onClick={() => setMode(v as "open" | "locked")} style={{
                    padding: 12, borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${mode === v ? "#F0B429" : "#1E364D"}`,
                    background: mode === v ? "rgba(240,180,41,.08)" : "transparent",
                    color: "#EAF2F9", textAlign: "start",
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{l ? ar : en}</div>
                    <div style={{ fontSize: 11.5, color: "#9FB7C9" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            {mode === "locked" && (
              <>
                <Field label={l ? "البريد الإلكتروني" : "Email"}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputCss} dir="ltr" />
                </Field>
                <Field label={l ? "الاسم (اختياري)" : "Name (optional)"}>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputCss} />
                </Field>
              </>
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
                    border: `1.5px solid ${expiry === v ? "#1D9BF0" : "#1E364D"}`,
                    background: expiry === v ? "rgba(29,155,240,.12)" : "transparent",
                    color: expiry === v ? "#1D9BF0" : "#B9CBDA",
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
          color: "#9FB7C9", border: "1px solid #1E364D",
          cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4,
        }}><RefreshCw size={12} />{l ? "تحديث" : "Refresh"}</button>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {active.map((r) => {
          const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now();
          return (
            <div key={r.id} style={{
              ...rowCard,
              borderColor: expired ? "rgba(240,103,106,.35)" : "#1E364D",
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
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#B9CBDA" }}>{label}</span>
      {children}
    </label>
  );
}


const rowCard: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, padding: 14, flexWrap: "wrap",
  background: "#0F2033", border: "1px solid #1E364D", borderRadius: 12,
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
  color: "#B9CBDA", border: "1px solid #1E364D", cursor: "pointer",
  fontWeight: 700, fontSize: 13.5, minHeight: 40,
};
const selectStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, background: "#0A1A2B",
  color: "#EAF2F9", border: "1px solid #1E364D", fontSize: 13,
  minWidth: 140, minHeight: 36,
};
const inputCss: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 10, background: "#0A1A2B",
  color: "#EAF2F9", border: "1px solid #1E364D", fontSize: 14,
  width: "100%", boxSizing: "border-box", minHeight: 42,
};
