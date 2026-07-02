import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, UserPlus, MailPlus, MoreVertical, Trash2, Pause, Play, Check, Crown, User as UserIcon, X,
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
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
            {l ? "التحكم بالصلاحيات" : "Access Control"}
          </h1>
          <div style={{ color: "#9FB7C9", fontSize: 13.5, marginTop: 2 }}>
            {l ? "الموافقة على الطلبات وإدارة الأدوار" : "Approve access requests and assign roles"}
          </div>
        </div>
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
          <UserPlus size={16} />{l ? "دعوة مستخدم" : "Invite user"}
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

      {showInvite && (
        <InviteModal
          lang={lang}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); load(); }}
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
  onAction: (a: "suspend" | "activate" | "delete" | "resend_invite") => void;
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
            {user.status === "pending" && (
              <MenuItem icon={MailPlus} label={l ? "إعادة إرسال الدعوة" : "Resend invite"}
                onClick={() => { setOpen(false); onAction("resend_invite"); }} />
            )}
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
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call({
        action: "invite",
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role,
        redirect_to: `${window.location.origin}/reset-password`,
      });
      toast.success(l ? "تم إرسال الدعوة" : "Invite sent");
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      zIndex: 100, display: "grid", placeItems: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#0F2033", border: "1px solid #1E364D",
        borderRadius: 16, padding: 22, width: "100%", maxWidth: 440,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{l ? "دعوة مستخدم جديد" : "Invite a new user"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9FB7C9", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={l ? "الاسم الكامل" : "Full name"}>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inputCss} />
          </Field>
          <Field label={l ? "البريد الإلكتروني" : "Email"}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputCss} dir="ltr" />
          </Field>
          <Field label={l ? "الدور" : "Role"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={ghostBtn}>{l ? "إلغاء" : "Cancel"}</button>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              <MailPlus size={16} />{l ? "إرسال الدعوة" : "Send invite"}
            </button>
          </div>
        </form>
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
  display: "flex", alignItems: "center", gap: 14, padding: 14,
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
