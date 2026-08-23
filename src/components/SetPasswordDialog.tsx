import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { KeyRound, Sparkles, Copy, Check } from "lucide-react";

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";

function generatePassword(len = 14) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

export function SetPasswordDialog({ userName, lang, onSave, onClose }: {
  userName: string;
  lang: "ar" | "en";
  onSave: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const l = lang === "ar";
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    if (pw.length < 8) {
      toast.error(l ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل." : "Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirmPw) {
      toast.error(l ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await onSave(pw);
      setDone(pw);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function fillGenerated() {
    const g = generatePassword();
    setPw(g);
    setConfirmPw(g);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 320,
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} dir={l ? "rtl" : "ltr"} className="sheet-panel" style={{
        width: "100%", maxWidth: 460, background: "var(--card)",
        border: "1px solid var(--border)", borderRadius: 18,
        padding: 22, color: "var(--foreground)",
        boxShadow: "0 24px 60px rgba(0,0,0,.55)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)", display: "grid", placeItems: "center",
          }}><KeyRound size={18} color="#fff" /></div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{l ? "تعيين كلمة مرور" : "Reset password"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{userName}</div>
          </div>
        </div>

        {done ? (
          <>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
              {l ? "تم التحديث. انسخ كلمة المرور وسلّمها للمستخدم — لن تظهر مرة أخرى." : "Updated. Copy the password and hand it over — it will not be shown again."}
            </div>
            <div dir="ltr" style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 14px", borderRadius: 10, background: "#0A1826",
              border: "1px solid var(--border)", fontFamily: "monospace", fontSize: 15,
            }}>
              <span style={{ flex: 1, wordBreak: "break-all" }}>{done}</span>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(done); setCopied(true); } catch { /* ignore */ }
                }}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", display: "inline-flex" }}
                aria-label="copy"
              >{copied ? <Check size={16} color="#14A86E" /> : <Copy size={16} />}</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={onClose} style={{
                padding: "10px 18px", borderRadius: 10,
                background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
                color: "#fff", border: "none", cursor: "pointer", fontWeight: 700,
              }}>{l ? "تم" : "Done"}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" autoFocus
                maxLength={72} autoComplete="off"
                placeholder={l ? "كلمة المرور الجديدة" : "New password"}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10, background: "#0A1826",
                  color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 14, minHeight: 44,
                }}
              />
              <input
                value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} dir="ltr"
                maxLength={72} autoComplete="off"
                placeholder={l ? "تأكيد كلمة المرور" : "Confirm password"}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10, background: "#0A1826",
                  color: "var(--foreground)", border: "1px solid var(--border)", fontSize: 14, minHeight: 44,
                }}
              />
              <button onClick={fillGenerated} style={{
                alignSelf: "flex-start", padding: "8px 12px", borderRadius: 10,
                background: "var(--surface-3)", color: "var(--foreground)",
                border: "1px solid var(--border)", cursor: "pointer", fontWeight: 700, fontSize: 12.5,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}><Sparkles size={14} />{l ? "توليد كلمة مرور قوية" : "Generate strong password"}</button>
            </div>

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
              {l ? "8 أحرف على الأقل." : "At least 8 characters."}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={onClose} disabled={busy} style={{
                padding: "10px 16px", borderRadius: 10, background: "transparent",
                color: "var(--foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 600,
              }}>{l ? "إلغاء" : "Cancel"}</button>
              <button onClick={save} disabled={busy} style={{
                padding: "10px 16px", borderRadius: 10,
                background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
                color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", fontWeight: 700,
                opacity: busy ? 0.6 : 1,
              }}>{busy ? "…" : (l ? "حفظ" : "Save")}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
