import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { listShares, setNoteShares, errMsg } from "@/lib/notes";
import { toast } from "sonner";

type AdminRow = { id: string; full_name: string; email: string | null; is_master_admin: boolean | null };

export function ShareNoteModal({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const { t, user, lang } = useApp();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: profs }, shares] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,is_master_admin,role,active,status").eq("active", true),
        listShares(noteId),
      ]);
      const list = (profs ?? []).filter((p) => (p.role === "admin" || p.is_master_admin) && p.id !== user?.id && p.status === "active") as AdminRow[];
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setAdmins(list);
      setSelected(new Set(shares.map((s) => s.shared_with_user_id)));
      setLoading(false);
    })();
  }, [noteId, user?.id]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectAll = () => setSelected(new Set(admins.map((a) => a.id)));
  const clearAll = () => setSelected(new Set());

  const save = async () => {
    setSaving(true);
    try {
      await setNoteShares(noteId, Array.from(selected));
      toast.success(lang === "ar" ? "تم حفظ المشاركة" : "Sharing saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-panel" style={{
        background: "var(--card, #0f172a)", backdropFilter: "none", border: "1px solid var(--border)", borderRadius: 14,
        width: "min(520px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,.5)",
      }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>{t("shareWith")}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "10px 16px", display: "flex", gap: 8, borderBottom: "1px solid var(--border)" }}>
          <button onClick={selectAll} style={btnStyle}>{t("allAdmins")}</button>
          <button onClick={clearAll} style={btnStyle}>{lang === "ar" ? "إلغاء الكل" : "Clear all"}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>…</div>
          ) : admins.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>{lang === "ar" ? "لا يوجد مدراء آخرون" : "No other admins"}</div>
          ) : admins.map((a) => {
            const on = selected.has(a.id);
            return (
              <button key={a.id} onClick={() => toggle(a.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                background: on ? "rgba(59,130,246,.1)" : "transparent",
                border: "1px solid " + (on ? "rgba(59,130,246,.4)" : "transparent"),
                borderRadius: 10, cursor: "pointer", color: "var(--foreground)",
                marginBottom: 4, textAlign: "start",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  border: "1.5px solid " + (on ? "#3B82F6" : "var(--border)"),
                  background: on ? "#3B82F6" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {on && <Check size={13} color="#fff" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.full_name}</div>
                  {a.email && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.email}</div>}
                </div>
                {a.is_master_admin && <span style={{ fontSize: 10, fontWeight: 800, color: "#D4AF37" }}>MASTER</span>}
              </button>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btnStyle}>{lang === "ar" ? "إلغاء" : "Cancel"}</button>
          <button onClick={save} disabled={saving} style={{ ...btnStyle, background: "var(--grad-blue)", color: "#fff", border: "none", fontWeight: 700 }}>{saving ? (lang === "ar" ? "…" : "…") : (lang === "ar" ? "حفظ" : "Save")}</button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, background: "transparent",
  border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer",
  fontSize: 13, fontWeight: 600,
};
