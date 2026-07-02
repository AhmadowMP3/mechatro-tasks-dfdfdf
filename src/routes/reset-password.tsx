import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import logo from "@/assets/mechatro-logo.png";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور · Mechatro Tasks" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const l = lang === "ar";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(l ? "تم تحديث كلمة المرور" : "Password updated");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={l ? "rtl" : "ltr"} style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      background: "linear-gradient(160deg,#050D17 0%,#0A1A2B 60%,#0E2338 100%)",
      color: "#EAF2F9",
      fontFamily: l ? "'Almarai', system-ui, sans-serif" : "'Montserrat', system-ui, sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 420, padding: 32, borderRadius: 20,
        background: "rgba(10,26,43,.85)", border: "1px solid #1E364D",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <img src={logo} alt="Mechatro" style={{ width: 180, alignSelf: "center", marginBottom: 8 }} />
        <h2 style={{ margin: 0, textAlign: "center" }}>{l ? "كلمة مرور جديدة" : "New password"}</h2>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          minLength={6} required dir="ltr"
          placeholder={l ? "كلمة المرور الجديدة" : "New password"}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            background: "#13283D", color: "#EAF2F9", border: "1px solid #1E364D",
            fontSize: 14, minHeight: 44, outline: "none",
          }}
        />
        <button type="submit" disabled={busy} style={{
          minHeight: 48, borderRadius: 12, background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
          color: "#fff", fontWeight: 800, border: "none", cursor: busy ? "wait" : "pointer",
        }}>{busy ? "…" : l ? "حفظ" : "Save"}</button>
      </form>
    </div>
  );
}
