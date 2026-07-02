import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, Ban, Pencil, Plus, Link2, Eye, RefreshCw, Lock, Calendar, Users2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/lib/app-context";
import { shareApi, SHARE_PAGES, type ShareLinkRow } from "@/lib/share-links";

export const Route = createFileRoute("/_authenticated/share-links")({
  beforeLoad: ({ context }) => {
    // Route context isn't strongly typed with profile; check happens in component too.
    void context;
  },
  component: SharePage,
});

function shareUrl(token: string) {
  if (typeof window === "undefined") return `/share/${token}`;
  return `${window.location.origin}/share/${token}`;
}

function SharePage() {
  const { lang, isMasterAdmin } = useApp();
  const ar = lang === "ar";
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ShareLinkRow | "new" | null>(null);

  const load = async () => {
    try { setLoading(true); const { links } = await shareApi.list(); setLinks(links); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isMasterAdmin) load(); }, [isMasterAdmin]);

  if (!isMasterAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
        {ar ? "متاح فقط لمدير النظام الرئيسي" : "Master admin only"}
      </div>
    );
  }


  return (
    <AppShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, background: "var(--grad-gold)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {ar ? "روابط المشاركة" : "Share Links"}
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
              {ar
                ? "أنشئ روابط عرض للقراءة فقط. المستلم يشاهد الصفحات التي تحددها فقط، بدون تسجيل دخول، وبدون إمكانية التعديل."
                : "Generate read-only preview links. Recipients see only the pages you allow, without login, with no editing power."}
            </p>
          </div>
          <button
            onClick={() => setEditing("new")}
            style={{
              minHeight: 44, padding: "0 18px", borderRadius: 999,
              background: "var(--grad-gold)", color: "#0B1116",
              fontWeight: 800, border: "none", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
              boxShadow: "0 10px 30px -12px rgba(212,175,55,.55)",
            }}
          >
            <Plus size={18} /> {ar ? "رابط جديد" : "New link"}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
            {ar ? "جاري التحميل..." : "Loading..."}
          </div>
        ) : links.length === 0 ? (
          <div style={{
            padding: 48, borderRadius: 20, border: "1px dashed var(--border)",
            background: "var(--card)", textAlign: "center", color: "var(--muted-foreground)",
          }}>
            <Link2 size={40} style={{ opacity: .5, marginBottom: 8 }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>{ar ? "لا يوجد روابط بعد" : "No links yet"}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {ar ? "أنشئ أول رابط للمشاركة" : "Create your first share link"}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {links.map((l) => (
              <LinkCard key={l.id} link={l} onEdit={() => setEditing(l)} onChanged={load} />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <LinkModal
          link={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </AppShell>
  );
}

function LinkCard({ link, onEdit, onChanged }: { link: ShareLinkRow; onEdit: () => void; onChanged: () => void }) {
  const { lang } = useApp();
  const ar = lang === "ar";
  const url = shareUrl(link.token);
  const expired = link.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false;
  const exhausted = link.max_uses != null && link.use_count >= link.max_uses;
  const dead = link.revoked || expired || exhausted;

  const statusChip = link.revoked
    ? { txt: ar ? "معطّل" : "Revoked", bg: "rgba(240,103,106,.15)", fg: "#F0676A" }
    : expired
    ? { txt: ar ? "منتهي" : "Expired", bg: "rgba(255,180,80,.15)", fg: "#FFB450" }
    : exhausted
    ? { txt: ar ? "استُنفد" : "Used up", bg: "rgba(255,180,80,.15)", fg: "#FFB450" }
    : { txt: ar ? "نشط" : "Active", bg: "rgba(80,200,120,.15)", fg: "#50C878" };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success(ar ? "تم نسخ الرابط" : "Link copied"); }
    catch { toast.error(ar ? "فشل النسخ" : "Copy failed"); }
  };
  const revoke = async () => {
    if (!confirm(ar ? "تعطيل هذا الرابط؟" : "Revoke this link?")) return;
    try { await shareApi.revoke(link.id); toast.success(ar ? "تم تعطيل الرابط" : "Link revoked"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async () => {
    if (!confirm(ar ? "حذف نهائي؟" : "Delete permanently?")) return;
    try { await shareApi.remove(link.id); toast.success(ar ? "تم الحذف" : "Deleted"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div style={{
      padding: 18, borderRadius: 18, background: "var(--card)",
      border: `1px solid ${dead ? "rgba(240,103,106,.3)" : "var(--border)"}`,
      opacity: dead ? .8 : 1,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>
              {link.label || (ar ? "بدون عنوان" : "Untitled")}
            </div>
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800,
              background: statusChip.bg, color: statusChip.fg,
            }}>{statusChip.txt}</span>
            {link.password_hash && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted-foreground)" }}>
                <Lock size={12} /> {ar ? "محمي" : "Protected"}
              </span>
            )}
          </div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {link.allowed_pages.map((p) => {
              const page = SHARE_PAGES.find((sp) => sp.key === p);
              return (
                <span key={p} style={{
                  padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: "var(--surface-2)", color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}>{page ? (ar ? page.ar : page.en) : p}</span>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px", borderRadius: 12,
        background: "var(--surface-2)", border: "1px solid var(--border)",
      }}>
        <Link2 size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: 12.5, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {url}
        </div>
        <button onClick={copy} title={ar ? "نسخ" : "Copy"} style={iconBtn}><Copy size={16} /></button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "var(--muted-foreground)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Eye size={13} /> {link.use_count}{link.max_uses ? ` / ${link.max_uses}` : ""} {ar ? "استخدام" : "uses"}
        </span>
        {link.expires_at && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Calendar size={13} /> {ar ? "ينتهي" : "expires"} {new Date(link.expires_at).toLocaleString(ar ? "ar-EG" : "en-US")}
          </span>
        )}
        {link.last_used_at && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Users2 size={13} /> {ar ? "آخر استخدام" : "last used"} {new Date(link.last_used_at).toLocaleString(ar ? "ar-EG" : "en-US")}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={onEdit} style={{ ...primaryBtn, background: "var(--grad-blue)" }}>
          <Pencil size={15} /> {ar ? "تحديث" : "Update"}
        </button>
        <a href={`/share/${link.token}`} target="_blank" rel="noreferrer" style={{ ...primaryBtn, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", textDecoration: "none" }}>
          <Eye size={15} /> {ar ? "معاينة" : "Preview"}
        </a>
        {!link.revoked && (
          <button onClick={revoke} style={{ ...primaryBtn, background: "rgba(255,180,80,.12)", color: "#FFB450", border: "1px solid rgba(255,180,80,.3)" }}>
            <Ban size={15} /> {ar ? "تعطيل" : "Revoke"}
          </button>
        )}
        <button onClick={remove} style={{ ...primaryBtn, background: "rgba(240,103,106,.12)", color: "#F0676A", border: "1px solid rgba(240,103,106,.3)" }}>
          <Trash2 size={15} /> {ar ? "حذف" : "Delete"}
        </button>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, background: "transparent",
  border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const primaryBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 10, border: "none",
  color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};

function LinkModal({ link, onClose, onSaved }: { link: ShareLinkRow | null; onClose: () => void; onSaved: () => void }) {
  const { lang } = useApp();
  const ar = lang === "ar";
  const [label, setLabel] = useState(link?.label ?? "");
  const [pages, setPages] = useState<string[]>(link?.allowed_pages ?? ["dashboard"]);
  const [expiresAt, setExpiresAt] = useState<string>(link?.expires_at ? new Date(link.expires_at).toISOString().slice(0, 16) : "");
  const [maxUses, setMaxUses] = useState<string>(link?.max_uses != null ? String(link.max_uses) : "");
  const [password, setPassword] = useState<string>("");
  const [changePw, setChangePw] = useState(!link);
  const [resetUses, setResetUses] = useState(false);
  const [saving, setSaving] = useState(false);

  const togglePage = (key: string) => {
    setPages((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };

  const submit = async () => {
    if (!pages.length) { toast.error(ar ? "اختر صفحة واحدة على الأقل" : "Select at least one page"); return; }
    setSaving(true);
    try {
      const payload = {
        label: label.trim(),
        allowed_pages: pages,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_uses: maxUses ? Number(maxUses) : null,
      };
      if (!link) {
        await shareApi.create({ ...payload, password: password || null });
        toast.success(ar ? "تم إنشاء الرابط" : "Link created");
      } else {
        const patch: Parameters<typeof shareApi.update>[1] = { ...payload };
        if (changePw) patch.password = password || null;
        if (resetUses) patch.reset_uses = true;
        await shareApi.update(link.id, patch);
        toast.success(ar ? "تم التحديث" : "Updated");
      }
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      backdropFilter: "blur(6px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20,
        padding: 24, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            {link ? (ar ? "تحديث الرابط" : "Update link") : (ar ? "رابط مشاركة جديد" : "New share link")}
          </h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <Field label={ar ? "العنوان (داخلي)" : "Label (internal)"}>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder={ar ? "مثال: عرض للعميل XYZ" : "e.g. Client XYZ preview"} style={input} />
        </Field>

        <Field label={ar ? "الصفحات المسموحة" : "Allowed pages"}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
            {SHARE_PAGES.map((p) => {
              const on = pages.includes(p.key);
              return (
                <button key={p.key} type="button" onClick={() => togglePage(p.key)} style={{
                  padding: "10px 12px", borderRadius: 10, fontWeight: 700, fontSize: 13,
                  cursor: "pointer", border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                  background: on ? "var(--grad-blue)" : "var(--surface-2)",
                  color: on ? "#fff" : "var(--foreground)",
                }}>{ar ? p.ar : p.en}</button>
              );
            })}
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={ar ? "تاريخ الانتهاء (اختياري)" : "Expiry (optional)"}>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={input} />
          </Field>
          <Field label={ar ? "أقصى استخدامات" : "Max uses"}>
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
              placeholder={ar ? "بلا حد" : "Unlimited"} style={input} />
          </Field>
        </div>

        <Field label={ar ? "كلمة مرور (اختياري)" : "Password (optional)"}>
          {link && !changePw ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted-foreground)", fontSize: 13 }}>
                {link.password_hash ? (ar ? "محمي بكلمة مرور" : "Password protected") : (ar ? "بدون كلمة مرور" : "No password")}
              </div>
              <button type="button" onClick={() => setChangePw(true)} style={{ ...primaryBtn, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                {ar ? "تغيير" : "Change"}
              </button>
            </div>
          ) : (
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={ar ? "اتركه فارغًا للإزالة" : "Leave blank to remove"} style={input} autoComplete="new-password" />
          )}
        </Field>

        {link && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={resetUses} onChange={(e) => setResetUses(e.target.checked)} />
            <RefreshCw size={14} /> {ar ? `إعادة تعيين عدّاد الاستخدام (حاليًا ${link.use_count})` : `Reset use counter (currently ${link.use_count})`}
          </label>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button onClick={onClose} disabled={saving} style={{ ...primaryBtn, background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
            {ar ? "إلغاء" : "Cancel"}
          </button>
          <button onClick={submit} disabled={saving} style={{ ...primaryBtn, background: "var(--grad-gold)", color: "#0B1116" }}>
            {saving ? (ar ? "جاري الحفظ..." : "Saving...") : link ? (ar ? "حفظ التغييرات" : "Save changes") : (ar ? "إنشاء الرابط" : "Create link")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10,
  background: "var(--surface-2)", border: "1px solid var(--border)",
  color: "var(--foreground)", fontSize: 14, outline: "none",
};
