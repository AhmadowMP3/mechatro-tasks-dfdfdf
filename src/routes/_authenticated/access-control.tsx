import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, UserPlus, MailPlus, MoreVertical, Trash2, Pause, Play,
  Plus, Save, X, Shield, Users as UsersIcon, KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type PermissionKey } from "@/lib/app-context";
import { Avatar } from "@/components/Avatar";
import { formatDate, relativeTime } from "@/lib/format";

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

// ─── Permission catalogue (mirrors the DB enum) ─────────────────────────────
const PERM_GROUPS: Array<{
  key: string; ar: string; en: string;
  perms: Array<{ key: PermissionKey; ar: string; en: string }>;
}> = [
  {
    key: "users", ar: "المستخدمون", en: "Users",
    perms: [
      { key: "users.invite",       ar: "دعوة مستخدم",       en: "Invite users" },
      { key: "users.suspend",      ar: "تعليق مستخدم",       en: "Suspend users" },
      { key: "users.delete",       ar: "حذف مستخدم",         en: "Delete users" },
      { key: "users.change_role",  ar: "تغيير الدور",         en: "Change role" },
    ],
  },
  {
    key: "roles", ar: "الأدوار", en: "Roles",
    perms: [{ key: "roles.manage", ar: "إدارة الأدوار", en: "Manage roles" }],
  },
  {
    key: "projects", ar: "المشاريع", en: "Projects",
    perms: [
      { key: "projects.view",    ar: "عرض", en: "View" },
      { key: "projects.create",  ar: "إنشاء", en: "Create" },
      { key: "projects.edit",    ar: "تعديل", en: "Edit" },
      { key: "projects.delete",  ar: "حذف", en: "Delete" },
      { key: "projects.archive", ar: "أرشفة", en: "Archive" },
    ],
  },
  {
    key: "tasks", ar: "المهام", en: "Tasks",
    perms: [
      { key: "tasks.view",      ar: "عرض", en: "View" },
      { key: "tasks.create",    ar: "إنشاء", en: "Create" },
      { key: "tasks.edit_any",  ar: "تعديل أي مهمة", en: "Edit any" },
      { key: "tasks.edit_own",  ar: "تعديل الخاصة", en: "Edit own" },
      { key: "tasks.delete",    ar: "حذف", en: "Delete" },
      { key: "tasks.comment",   ar: "التعليق", en: "Comment" },
    ],
  },
  {
    key: "misc", ar: "أخرى", en: "Other",
    perms: [
      { key: "team.view",           ar: "عرض الفريق",   en: "View team" },
      { key: "league.view",         ar: "عرض الدوري",   en: "View league" },
      { key: "notifications.view",  ar: "عرض الإشعارات", en: "View notifications" },
      { key: "settings.view",       ar: "عرض الإعدادات", en: "View settings" },
      { key: "settings.edit",       ar: "تعديل الإعدادات", en: "Edit settings" },
      { key: "backups.view",        ar: "عرض النسخ",    en: "View backups" },
      { key: "backups.run",         ar: "تشغيل نسخة",   en: "Run backup" },
      { key: "backups.restore",     ar: "استعادة",      en: "Restore backup" },
      { key: "activity.view",       ar: "سجل النشاط",   en: "Activity log" },
    ],
  },
];

const ALL_PERMS: PermissionKey[] = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

// ─── Types ────────────────────────────────────────────────────────────────
type UserRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  email: string | null;
  status: "pending" | "active" | "suspended";
  is_master_admin: boolean;
  invited_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  roles: Array<{ id: string; name: string; slug: string }>;
};

type RoleRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_system: boolean;
  permissions: PermissionKey[];
  user_count: number;
};

// ─── API helper (invokes edge functions with bearer) ──────────────────────
async function call(fn: "admin-users" | "admin-roles", body: unknown) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  const payload = data as { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return data;
}

// ═════════════════════════════════════════════════════════════════════════
function AccessControlPage() {
  const { lang } = useApp();
  const l = lang === "ar";
  const [tab, setTab] = useState<"users" | "roles">("users");

  return (
    <div style={{ padding: "clamp(16px,3vw,32px)", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
          display: "grid", placeItems: "center", color: "#fff",
          boxShadow: "0 8px 24px rgba(29,155,240,.35)",
        }}>
          <ShieldCheck size={26} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
            {l ? "التحكم بالصلاحيات" : "Access Control"}
          </h1>
          <div style={{ color: "var(--text-muted, #9FB7C9)", fontSize: 13.5, marginTop: 2 }}>
            {l ? "إدارة المستخدمين والأدوار والصلاحيات" : "Manage users, roles, and permissions"}
          </div>
        </div>
      </header>

      <div style={{
        display: "inline-flex", background: "var(--surface-2, #13283D)",
        borderRadius: 12, padding: 4, marginTop: 22, marginBottom: 20,
        border: "1px solid var(--border, #1E364D)",
      }}>
        {[
          { k: "users",  icon: UsersIcon, label: l ? "المستخدمون" : "Users" },
          { k: "roles",  icon: Shield,    label: l ? "الأدوار" : "Roles" },
        ].map(({ k, icon: Icon, label }) => (
          <button
            key={k}
            onClick={() => setTab(k as "users" | "roles")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 8,
              background: tab === k ? "linear-gradient(135deg,#1D9BF0,#0F6BB8)" : "transparent",
              color: tab === k ? "#fff" : "var(--text-muted, #B9CBDA)",
              border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
              minHeight: 40,
            }}
          ><Icon size={16} />{label}</button>
        ))}
      </div>

      {tab === "users" ? <UsersTab /> : <RolesTab />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
function UsersTab() {
  const { lang } = useApp();
  const l = lang === "ar";
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const [u, r] = await Promise.all([
        call("admin-users", { action: "list" }) as Promise<{ users: UserRow[] }>,
        call("admin-roles", { action: "list" }) as Promise<{ roles: RoleRow[] }>,
      ]);
      setUsers(u.users); setRoles(r.roles);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); }, []);

  async function act(action: string, user_id: string, extra?: Record<string, unknown>) {
    setBusyId(user_id);
    try {
      await call("admin-users", { action, user_id, ...extra });
      await load();
      toast.success(l ? "تم" : "Done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted, #9FB7C9)" }}>
          {l ? `${users?.length ?? 0} مستخدم` : `${users?.length ?? 0} users`}
        </div>
        <button onClick={() => setShowInvite(true)} style={primaryBtn}>
          <UserPlus size={16} />{l ? "دعوة مستخدم" : "Invite user"}
        </button>
      </div>

      {users === null && <Skel />}
      {users?.length === 0 && <Empty label={l ? "لا مستخدمين" : "No users"} />}

      <div style={{ display: "grid", gap: 10 }}>
        {users?.map((u) => {
          const currentRoleId = u.roles[0]?.id ?? "";
          return (
            <div key={u.id} style={rowCard}>
              <Avatar id={u.id} name={u.full_name} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{u.full_name}</span>
                  {u.is_master_admin && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                      background: "linear-gradient(135deg,#F0B429,#F09F26)", color: "#1A1408",
                    }}>{l ? "مسؤول رئيسي" : "MASTER"}</span>
                  )}
                  <StatusPill status={u.status} lang={lang} />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted,#9FB7C9)", marginTop: 2 }} dir="ltr">
                  {u.email ?? "—"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted,#7A94A9)", marginTop: 3 }}>
                  {u.last_sign_in_at
                    ? (l ? "آخر دخول: " : "Last sign-in: ") + relativeTime(u.last_sign_in_at, lang)
                    : (l ? "لم يسجّل الدخول بعد" : "Has not signed in yet")}
                </div>
              </div>

              <select
                disabled={u.is_master_admin || busyId === u.id}
                value={currentRoleId}
                onChange={(e) => act("assign_role", u.id, { role_id: e.target.value })}
                style={selectStyle}
              >
                <option value="">{l ? "— بدون دور —" : "— No role —"}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>

              {!u.is_master_admin && (
                <UserMenu
                  user={u}
                  lang={lang}
                  busy={busyId === u.id}
                  onAction={(a) => act(a, u.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {showInvite && (
        <InviteModal
          roles={roles}
          lang={lang}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); load(); }}
        />
      )}
    </div>
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
      <button
        onClick={() => setOpen((s) => !s)}
        disabled={busy}
        aria-label="menu"
        style={{
          width: 40, height: 40, borderRadius: 10,
          background: "var(--surface-2,#13283D)",
          color: "var(--text,#EAF2F9)",
          border: "1px solid var(--border,#1E364D)",
          cursor: busy ? "wait" : "pointer",
          display: "grid", placeItems: "center",
        }}
      ><MoreVertical size={16} /></button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0, zIndex: 41,
            background: "var(--surface,#0F2033)", border: "1px solid var(--border,#1E364D)",
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
            <MenuItem
              icon={Trash2}
              danger
              label={l ? "حذف نهائي" : "Delete permanently"}
              onClick={() => {
                if (confirm(l ? "حذف هذا المستخدم نهائيًا؟" : "Delete this user permanently?")) {
                  setOpen(false); onAction("delete");
                }
              }}
            />
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
      padding: "10px 12px", borderRadius: 8,
      background: "transparent",
      color: danger ? "#F0676A" : "var(--text,#EAF2F9)",
      border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
      textAlign: "start",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(240,103,106,.1)" : "rgba(255,255,255,.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    ><Icon size={15} />{label}</button>
  );
}

function InviteModal({ roles, lang, onClose, onInvited }: {
  roles: RoleRow[]; lang: "ar" | "en"; onClose: () => void; onInvited: () => void;
}) {
  const l = lang === "ar";
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState(roles.find((r) => r.slug === "member")?.id ?? roles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call("admin-users", {
        action: "invite",
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role_id: roleId || null,
        redirect_to: `${window.location.origin}/reset-password`,
      });
      toast.success(l ? "تم إرسال الدعوة" : "Invite sent");
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <ModalShell title={l ? "دعوة مستخدم جديد" : "Invite a new user"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FormField label={l ? "الاسم الكامل" : "Full name"}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inputCss} />
        </FormField>
        <FormField label={l ? "البريد الإلكتروني" : "Email"}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputCss} dir="ltr" />
        </FormField>
        <FormField label={l ? "الدور المبدئي" : "Initial role"}>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={inputCss}>
            <option value="">{l ? "— بدون دور —" : "— No role —"}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </FormField>
        <div style={{
          padding: 10, borderRadius: 10,
          background: "rgba(29,155,240,.08)", border: "1px solid rgba(29,155,240,.3)",
          fontSize: 12, color: "var(--text-muted,#B9CBDA)",
        }}>
          <MailPlus size={14} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />
          {l
            ? "سيصل للمستخدم رابط لتعيين كلمة المرور وتفعيل الحساب."
            : "The user will receive a secure link to set their password and activate the account."}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={ghostBtn}>{l ? "إلغاء" : "Cancel"}</button>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            <UserPlus size={16} />{busy ? "…" : (l ? "إرسال الدعوة" : "Send invite")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ═════════════════════════════════════════════════════════════════════════
function RolesTab() {
  const { lang } = useApp();
  const l = lang === "ar";
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const r = await call("admin-roles", { action: "list" }) as { roles: RoleRow[] };
      setRoles(r.roles);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }
  useEffect(() => { load(); }, []);

  async function del(id: string) {
    if (!confirm(l ? "حذف هذا الدور؟" : "Delete this role?")) return;
    try {
      await call("admin-roles", { action: "delete", role_id: id });
      await load();
      toast.success(l ? "تم الحذف" : "Deleted");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted, #9FB7C9)" }}>
          {l ? `${roles?.length ?? 0} دور` : `${roles?.length ?? 0} roles`}
        </div>
        <button onClick={() => setCreating(true)} style={primaryBtn}>
          <Plus size={16} />{l ? "دور جديد" : "New role"}
        </button>
      </div>

      {roles === null && <Skel />}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {roles?.map((r) => (
          <div key={r.id} style={{
            background: "var(--surface,#0F2033)",
            border: "1px solid var(--border,#1E364D)",
            borderRadius: 14, padding: 16,
            borderInlineStart: `4px solid ${r.color}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{r.name}</span>
                  {r.is_system && (
                    <span style={{
                      padding: "1px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                      background: "rgba(29,155,240,.15)", color: "#66C0F5",
                      border: "1px solid rgba(29,155,240,.3)",
                    }}>{l ? "نظامي" : "SYSTEM"}</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted,#9FB7C9)", marginTop: 4 }}>
                  {r.description || (l ? "بدون وصف" : "No description")}
                </div>
              </div>
            </div>

            <div style={{
              display: "flex", gap: 10, marginTop: 14,
              paddingTop: 12, borderTop: "1px dashed var(--border,#1E364D)",
              fontSize: 12, color: "var(--text-muted,#9FB7C9)",
            }}>
              <span><KeyRound size={12} style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
                {r.permissions.length} {l ? "صلاحية" : "perms"}
              </span>
              <span><UsersIcon size={12} style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
                {r.user_count} {l ? "مستخدم" : "users"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditing(r)} style={{ ...ghostBtn, flex: 1 }}>
                {l ? "تعديل" : "Edit"}
              </button>
              {!r.is_system && (
                <button
                  onClick={() => del(r.id)}
                  style={{
                    ...ghostBtn,
                    color: "#F0676A", borderColor: "rgba(240,103,106,.3)",
                    background: "rgba(240,103,106,.06)",
                  }}
                ><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <RoleEditor
          role={editing}
          lang={lang}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function RoleEditor({ role, lang, onClose, onSaved }: {
  role: RoleRow | null; lang: "ar" | "en";
  onClose: () => void; onSaved: () => void;
}) {
  const l = lang === "ar";
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#1D9BF0");
  const [perms, setPerms] = useState<Set<PermissionKey>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);

  const toggle = (k: PermissionKey) => {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const toggleGroup = (groupPerms: PermissionKey[]) => {
    const all = groupPerms.every((p) => perms.has(p));
    setPerms((prev) => {
      const next = new Set(prev);
      for (const p of groupPerms) { if (all) next.delete(p); else next.add(p); }
      return next;
    });
  };

  const selectedList = useMemo(() => Array.from(perms), [perms]);

  async function save() {
    setBusy(true);
    try {
      if (role) {
        await call("admin-roles", {
          action: "update", role_id: role.id,
          name, description: description || null, color,
        });
        await call("admin-roles", {
          action: "set_permissions", role_id: role.id, permissions: selectedList,
        });
      } else {
        await call("admin-roles", {
          action: "create", name, description: description || null, color,
          permissions: selectedList,
        });
      }
      toast.success(l ? "تم الحفظ" : "Saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const colors = ["#1D9BF0", "#30C074", "#F09F26", "#F0676A", "#A855F7", "#0EA5E9", "#F0B429"];

  return (
    <ModalShell
      title={role ? (l ? `تعديل: ${role.name}` : `Edit: ${role.name}`) : (l ? "دور جديد" : "New role")}
      onClose={onClose}
      wide
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label={l ? "الاسم" : "Name"}>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={role?.is_system} style={inputCss} required />
          </FormField>
          <FormField label={l ? "اللون" : "Color"}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {colors.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  aria-label={c}
                  style={{
                    width: 30, height: 30, borderRadius: 8, background: c,
                    border: color === c ? "3px solid #fff" : "2px solid transparent",
                    cursor: "pointer",
                  }} />
              ))}
            </div>
          </FormField>
        </div>
        <FormField label={l ? "الوصف" : "Description"}>
          <input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} style={inputCss} />
        </FormField>

        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {l ? "الصلاحيات" : "Permissions"} <span style={{
                marginInlineStart: 8, padding: "2px 8px", borderRadius: 999, fontSize: 11,
                background: "rgba(29,155,240,.15)", color: "#66C0F5",
              }}>{perms.size}/{ALL_PERMS.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setPerms(perms.size === ALL_PERMS.length ? new Set() : new Set(ALL_PERMS))}
              style={{
                background: "transparent", border: "none", color: "#66C0F5",
                fontWeight: 700, fontSize: 12.5, cursor: "pointer",
              }}
            >{perms.size === ALL_PERMS.length ? (l ? "مسح الكل" : "Clear all") : (l ? "تحديد الكل" : "Select all")}</button>
          </div>

          <div style={{ display: "grid", gap: 10, maxHeight: "50vh", overflowY: "auto", paddingInlineEnd: 4 }}>
            {PERM_GROUPS.map((g) => {
              const groupKeys = g.perms.map((p) => p.key);
              const allOn = groupKeys.every((p) => perms.has(p));
              const someOn = groupKeys.some((p) => perms.has(p));
              return (
                <div key={g.key} style={{
                  background: "var(--surface-2,#13283D)",
                  border: "1px solid var(--border,#1E364D)",
                  borderRadius: 10, padding: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{l ? g.ar : g.en}</div>
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKeys)}
                      style={{
                        background: "transparent", border: "none", color: "#9FB7C9",
                        fontSize: 11.5, cursor: "pointer", fontWeight: 700,
                      }}
                    >{allOn ? (l ? "إلغاء" : "None") : someOn ? (l ? "الكل" : "All") : (l ? "تحديد" : "Select")}</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 6 }}>
                    {g.perms.map((p) => {
                      const on = perms.has(p.key);
                      return (
                        <label key={p.key} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                          background: on ? "rgba(48,192,116,.10)" : "transparent",
                          border: `1px solid ${on ? "rgba(48,192,116,.35)" : "transparent"}`,
                          fontSize: 12.5,
                        }}>
                          <input
                            type="checkbox" checked={on}
                            onChange={() => toggle(p.key)}
                            style={{ accentColor: "#30C074" }}
                          />
                          <span>{l ? p.ar : p.en}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={ghostBtn}><X size={14} />{l ? "إلغاء" : "Cancel"}</button>
          <button type="button" disabled={busy || !name.trim()} onClick={save} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            <Save size={16} />{busy ? "…" : (l ? "حفظ" : "Save")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Small building blocks ────────────────────────────────────────────────
function StatusPill({ status, lang }: { status: UserRow["status"]; lang: "ar" | "en" }) {
  const map = {
    active:    { bg: "rgba(48,192,116,.14)", fg: "#30C074", ar: "نشط",    en: "Active" },
    pending:   { bg: "rgba(240,159,38,.14)", fg: "#F09F26", ar: "بانتظار", en: "Pending" },
    suspended: { bg: "rgba(240,103,106,.14)", fg: "#F0676A", ar: "معلَّق",  en: "Suspended" },
  } as const;
  const s = map[status];
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
      background: s.bg, color: s.fg,
    }}>{lang === "ar" ? s.ar : s.en}</span>
  );
}

function ModalShell({ title, children, onClose, wide }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(3,10,18,.75)", backdropFilter: "blur(4px)",
        display: "grid", placeItems: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: wide ? 720 : 460,
          maxHeight: "92vh", overflowY: "auto",
          background: "var(--surface,#0A1A2B)",
          border: "1px solid var(--border,#1E364D)",
          borderRadius: 16, padding: 22,
          boxShadow: "0 24px 60px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} aria-label="close" style={{
            width: 36, height: 36, borderRadius: 10, border: "none",
            background: "var(--surface-2,#13283D)", color: "var(--text,#EAF2F9)",
            cursor: "pointer", display: "grid", placeItems: "center",
          }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted,#9FB7C9)" }}>{label}</span>
      {children}
    </label>
  );
}

function Skel() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          height: 72, borderRadius: 12,
          background: "linear-gradient(90deg, var(--surface,#0F2033) 25%, var(--surface-2,#13283D) 50%, var(--surface,#0F2033) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.4s infinite",
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0}100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{
      padding: 40, textAlign: "center", borderRadius: 14,
      border: "1px dashed var(--border,#1E364D)",
      color: "var(--text-muted,#9FB7C9)", fontSize: 13,
    }}>{label}</div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "10px 18px", minHeight: 42, borderRadius: 10,
  background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
  color: "#fff", fontWeight: 700, fontSize: 13.5,
  border: "none", cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "9px 14px", minHeight: 40, borderRadius: 10,
  background: "var(--surface-2,#13283D)",
  color: "var(--text,#EAF2F9)",
  border: "1px solid var(--border,#1E364D)",
  fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const inputCss: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  background: "var(--surface-2,#13283D)", color: "var(--text,#EAF2F9)",
  border: "1px solid var(--border,#1E364D)", fontSize: 13.5, minHeight: 42, outline: "none",
};
const selectStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 10, minWidth: 140,
  background: "var(--surface-2,#13283D)", color: "var(--text,#EAF2F9)",
  border: "1px solid var(--border,#1E364D)", fontSize: 13, minHeight: 40, cursor: "pointer",
};
const rowCard: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  background: "var(--surface,#0F2033)",
  border: "1px solid var(--border,#1E364D)",
  borderRadius: 14, padding: 14,
};

// silence unused imports
void formatDate;
