import { useEffect, useState } from "react";
import { ShieldAlert, LogOut, Mail, Clock } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { relativeTime } from "@/lib/format";
import logo from "@/assets/mechatro-logo.png";

type SuspenderInfo = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

export function SuspendedScreen() {
  const { user, signOut, lang, t } = useApp();
  const l = lang === "ar";
  const [by, setBy] = useState<SuspenderInfo | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.suspended_by) return;
      const { data } = await supabase
        .from("team_directory")
        .select("id, full_name, avatar_url")
        .eq("id", user.suspended_by)
        .maybeSingle();
      if (alive && data) setBy({ ...data, job_title: null } as SuspenderInfo);
    })();
    return () => { alive = false; };
  }, [user?.suspended_by]);

  const adminName = by?.full_name || (l ? "المدير" : "the administrator");
  const when = user?.suspended_at ? relativeTime(user.suspended_at, lang) : null;

  return (
    <div
      dir={l ? "rtl" : "ltr"}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        minHeight: "100dvh",
        display: "grid", placeItems: "center",
        padding: "32px 20px",
        background:
          "radial-gradient(1200px 700px at 15% -10%, rgba(240,103,106,.20), transparent 60%)," +
          "radial-gradient(900px 600px at 95% 110%, rgba(29,155,240,.18), transparent 60%)," +
          "linear-gradient(180deg,#050B14 0%, #08121F 100%)",
        color: "var(--foreground)",
        overflow: "auto",
      }}
    >
      {/* Animated warning rings */}
      <div aria-hidden style={{
        position: "absolute", top: "-160px", left: "50%", transform: "translateX(-50%)",
        width: 620, height: 620, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(240,103,106,.14), transparent 65%)",
        filter: "blur(4px)", pointerEvents: "none",
        animation: "pulseGlow 3.4s ease-in-out infinite",
      }} />

      <style>{`
        @keyframes pulseGlow {
          0%,100% { opacity: .55; transform: translateX(-50%) scale(.96); }
          50%     { opacity: 1;   transform: translateX(-50%) scale(1.04); }
        }
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);     }
        }
        @keyframes ringPulse {
          0%   { box-shadow: 0 0 0 0 rgba(240,103,106,.55); }
          70%  { box-shadow: 0 0 0 26px rgba(240,103,106,0); }
          100% { box-shadow: 0 0 0 0 rgba(240,103,106,0); }
        }
      `}</style>

      <div style={{
        position: "relative", width: "100%", maxWidth: 620,
        background: "linear-gradient(180deg,#0F2033 0%, #0B1A2B 100%)",
        border: "1px solid rgba(240,103,106,.35)",
        borderRadius: 24,
        padding: "36px 28px 28px",
        boxShadow: "0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.02) inset",
        animation: "floatIn .5s ease-out both",
        textAlign: "center",
      }}>
        <img src={logo} alt="Mechatro" style={{ height: 28, opacity: .9, marginBottom: 22 }} />

        <div style={{
          margin: "0 auto 20px", width: 96, height: 96, borderRadius: "50%",
          background: "linear-gradient(135deg,#F0676A,#B83338)",
          display: "grid", placeItems: "center",
          animation: "ringPulse 2.2s ease-out infinite",
        }}>
          <ShieldAlert size={48} color="#fff" strokeWidth={2.4} />
        </div>

        <div style={{
          display: "inline-block", padding: "5px 14px", borderRadius: 999,
          background: "rgba(240,103,106,.16)", color: "#F0676A",
          fontWeight: 800, fontSize: 12, letterSpacing: ".08em",
          textTransform: "uppercase", marginBottom: 12,
        }}>
          {l ? "تم تعليق الحساب" : "Account suspended"}
        </div>

        <h1 style={{
          margin: "0 0 10px", fontSize: "clamp(24px, 4.4vw, 34px)",
          lineHeight: 1.2, fontWeight: 900,
          background: "linear-gradient(135deg,#fff, var(--foreground) 60%, #F0676A)",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>
          {l ? `تم تعليق حسابك بواسطة ${adminName}` : `You've been suspended by ${adminName}`}
        </h1>

        <p style={{ margin: "0 auto 22px", maxWidth: 460, color: "var(--muted)", fontSize: 14.5, lineHeight: 1.6 }}>
          {l
            ? "لا يمكنك الوصول إلى مساحة عمل ميكاترو حاليًا. يرجى التواصل مع المدير لاستعادة الوصول."
            : "You can no longer access the Mechatro workspace. Please contact your administrator to restore access."}
        </p>

        {/* Suspended by card */}
        {by && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 14, padding: "12px 14px", margin: "0 auto 14px",
            maxWidth: 420, textAlign: l ? "right" : "left",
          }}>
            <Avatar id={by.id} name={by.full_name || "?"} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "#7A94A9", fontWeight: 700, letterSpacing: ".04em" }}>
                {l ? "تم التعليق بواسطة" : "Suspended by"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>
                {by.full_name || (l ? "مدير" : "Administrator")}
              </div>
            </div>
          </div>
        )}

        {/* Reason */}
        {user?.suspend_reason && (
          <div style={{
            background: "rgba(240,180,41,.08)",
            border: "1px solid rgba(240,180,41,.28)",
            borderRadius: 14, padding: "12px 14px", margin: "0 auto 14px",
            maxWidth: 420, textAlign: l ? "right" : "left",
          }}>
            <div style={{ fontSize: 11.5, color: "#F0B429", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>
              {l ? "السبب" : "Reason"}
            </div>
            <div style={{ fontSize: 14, color: "var(--foreground)", lineHeight: 1.55 }}>
              {user.suspend_reason}
            </div>
          </div>
        )}

        {when && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12.5, color: "#7A94A9", marginBottom: 22,
          }}>
            <Clock size={13} />{l ? `منذ ${when}` : when}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="mailto:admin@mechatro.com"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 20px", borderRadius: 12,
              background: "var(--grad-blue, linear-gradient(135deg,#1D9BF0,#0F6BB8))",
              color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none",
              boxShadow: "0 8px 20px rgba(29,155,240,.28)",
            }}
          >
            <Mail size={16} />{l ? "تواصل مع المدير" : "Contact administrator"}
          </a>
          <button
            onClick={() => signOut()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 20px", borderRadius: 12,
              background: "transparent", border: "1px solid rgba(255,255,255,.14)",
              color: "var(--foreground)", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            <LogOut size={16} />{t("logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
