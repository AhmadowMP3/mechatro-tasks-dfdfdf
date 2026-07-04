import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, ShieldAlert, Loader2 } from "lucide-react";
import logo from "@/assets/mechatro-logo.png";
import { shareApi, SHARE_PAGES, SHARE_FUNCTION_URL } from "@/lib/share-links";
import { enterShareMode, firstAllowedPath } from "@/lib/share-mode";

export const Route = createFileRoute("/share/$token/")({
  component: ShareEntry,
});

function ShareEntry() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "password" | "denied" | "ok">("loading");
  const [errCode, setErrCode] = useState<string>("");
  const [pw, setPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState<"ar" | "en">((typeof window !== "undefined" && (localStorage.getItem("lang") as "ar" | "en")) || "ar");
  const ar = lang === "ar";

  const attempt = async (password?: string) => {
    setSubmitting(true);
    try {
      // Bootstrap = resolve link + preload profiles/directory in one call.
      const { link, bootstrap } = await shareApi.bootstrap(token, password);
      enterShareMode({
        token,
        password: password ?? null,
        link,
        bootstrap,
        functionUrl: SHARE_FUNCTION_URL,
      });
      setState("ok");
      // Hard navigation into the real app so route matches re-evaluate with
      // share mode already active (the _authenticated gate consults it).
      const target = firstAllowedPath();
      if (typeof window !== "undefined") window.location.replace(target);
      else navigate({ to: target, replace: true });
    } catch (e) {
      const code = (e as { code?: string }).code || "";
      setErrCode(code);
      if (code === "password_required" || code === "wrong_password") setState("password");
      else setState("denied");
    } finally { setSubmitting(false); }
  };

  useEffect(() => { attempt(); /* eslint-disable-next-line */ }, [token]);


  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = ar ? "rtl" : "ltr";
      document.documentElement.lang = ar ? "ar" : "en";
    }
  }, [ar]);

  const wrap: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20, background: "radial-gradient(1200px 800px at 20% 0%, rgba(43,111,178,.18), transparent 60%), radial-gradient(1000px 700px at 100% 100%, rgba(212,175,55,.12), transparent 55%), #05090F",
    color: "var(--foreground)",
  };
  const card: React.CSSProperties = {
    width: "100%", maxWidth: 460, padding: 32, borderRadius: 24,
    background: "linear-gradient(180deg, rgba(20,32,48,.9), rgba(10,20,32,.9))",
    border: "1px solid rgba(120,150,180,.2)", backdropFilter: "blur(18px)",
    boxShadow: "0 30px 80px -20px rgba(0,0,0,.6)",
    textAlign: "center", display: "flex", flexDirection: "column", gap: 18,
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, position: "absolute", top: 16, insetInlineEnd: 16 }}>
          <button onClick={() => { setLang("ar"); localStorage.setItem("lang", "ar"); }}
            style={langChip(ar)}>عربي</button>
          <button onClick={() => { setLang("en"); localStorage.setItem("lang", "en"); }}
            style={langChip(!ar)}>EN</button>
        </div>

        <img src={logo} alt="Mechatro" style={{ width: 160, alignSelf: "center", filter: "drop-shadow(0 2px 10px rgba(0,0,0,.5))" }} />

        {state === "loading" && (
          <>
            <Loader2 size={32} style={{ margin: "0 auto", animation: "spin 1s linear infinite" }} />
            <div style={{ color: "var(--muted)" }}>{ar ? "جاري التحقق..." : "Verifying..."}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {state === "password" && (
          <form onSubmit={(e) => { e.preventDefault(); attempt(pw); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Lock size={32} style={{ margin: "0 auto", color: "#D4AF37" }} />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{ar ? "هذا الرابط محمي" : "This link is protected"}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{ar ? "أدخل كلمة المرور للمتابعة" : "Enter the password to continue"}</div>
            <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder={ar ? "كلمة المرور" : "Password"}
              style={{ width: "100%", minHeight: 48, padding: "0 14px", borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(120,150,180,.3)", color: "#fff", fontSize: 15, outline: "none" }} />
            {errCode === "wrong_password" && (
              <div style={{ color: "#F0676A", fontSize: 13 }}>{ar ? "كلمة المرور غير صحيحة" : "Wrong password"}</div>
            )}
            <button type="submit" disabled={submitting} style={{
              minHeight: 48, borderRadius: 999, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#D4AF37,#B08C1F)", color: "#0B1116",
              fontWeight: 800, fontSize: 15,
            }}>{submitting ? (ar ? "جاري..." : "Please wait...") : (ar ? "دخول" : "Enter")}</button>
          </form>
        )}

        {state === "denied" && (
          <>
            <ShieldAlert size={40} style={{ margin: "0 auto", color: "#F0676A" }} />
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {errCode === "revoked" ? (ar ? "تم إلغاء هذا الرابط" : "This link has been revoked")
                : errCode === "expired" ? (ar ? "انتهت صلاحية هذا الرابط" : "This link has expired")
                : errCode === "exhausted" ? (ar ? "استُنفدت مرات استخدام هذا الرابط" : "This link has been used up")
                : errCode === "not_found" ? (ar ? "رابط غير موجود" : "Link not found")
                : (ar ? "لا يمكن الوصول لهذا الرابط" : "This link is not accessible")}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {ar ? "يرجى التواصل مع من شارك معك الرابط." : "Please contact whoever shared this link with you."}
            </div>
          </>
        )}

        {state === "ok" && (
          <div style={{ color: "var(--muted)" }}>{ar ? "جاري التوجيه..." : "Redirecting..."}</div>
        )}

        <div style={{ marginTop: 8, fontSize: 11, color: "#5C7285" }}>
          {SHARE_PAGES.length} · Mechatro · {ar ? "عرض للقراءة فقط" : "Read-only preview"}
        </div>
      </div>
    </div>
  );
}

function langChip(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
    background: active ? "rgba(212,175,55,.2)" : "transparent",
    color: active ? "#D4AF37" : "var(--muted)",
    border: `1px solid ${active ? "rgba(212,175,55,.4)" : "rgba(120,150,180,.2)"}`,
  };
}
