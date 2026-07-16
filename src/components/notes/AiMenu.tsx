import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { useApp } from "@/lib/app-context";
import { Sparkles, Loader2, Languages, Wand2, PenLine, RefreshCw, ListOrdered, CheckCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { noteAi } from "@/lib/notes-ai.functions";
import { toast } from "sonner";

type Action = "summarize" | "rewrite" | "translate_en" | "translate_ar" | "continue" | "fix_grammar" | "outline";

const ACTIONS: { key: Action; label: string; icon: React.ReactNode; replace: boolean }[] = [
  { key: "summarize", label: "aiSummarize", icon: <ListOrdered size={16} />, replace: false },
  { key: "rewrite", label: "aiRewrite", icon: <RefreshCw size={16} />, replace: true },
  { key: "fix_grammar", label: "aiFixGrammar", icon: <CheckCheck size={16} />, replace: true },
  { key: "translate_en", label: "aiTranslateEn", icon: <Languages size={16} />, replace: true },
  { key: "translate_ar", label: "aiTranslateAr", icon: <Languages size={16} />, replace: true },
  { key: "continue", label: "aiContinue", icon: <PenLine size={16} />, replace: false },
  { key: "outline", label: "aiOutline", icon: <Wand2 size={16} />, replace: false },
];

export function AiMenu({ editor }: { editor: Editor | null }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = useServerFn(noteAi);

  const trigger = async (a: Action, replace: boolean) => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const selText = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
    const wholeText = editor.getText();
    const text = selText || wholeText;
    if (!text.trim()) { toast.error(t("aiEmptyText")); return; }
    setBusy(true);
    setOpen(false);
    try {
      const { html } = await run({ data: { action: a, text, lang } });
      if (!html) { toast.error("Empty AI response"); return; }
      if (replace && !empty) {
        editor.chain().focus().deleteRange({ from, to }).insertContent(html).run();
      } else {
        // append at end of doc with a separator
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, `<hr>${html}`).run();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg === "aiCannotTranslate" ? t("aiCannotTranslate") : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy || !editor}
        style={{
          height: 34, padding: "0 12px", borderRadius: 8, cursor: "pointer",
          background: "linear-gradient(135deg, #189FD1 0%, #7C5CFA 100%)",
          border: "none", color: "#fff", fontWeight: 700, fontSize: 12,
          display: "inline-flex", alignItems: "center", gap: 6, opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? <Loader2 size={14} className="ai-spin" /> : <Sparkles size={14} />}
        {busy ? t("aiWorking") : t("aiAssistant")}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.4)",
              padding: 6, zIndex: 40, minWidth: 240,
            }}
          >
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => trigger(a.key, a.replace)}
                style={{
                  width: "100%", padding: "9px 10px", background: "transparent",
                  border: "none", borderRadius: 8, color: "var(--foreground)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                  fontSize: 13, fontWeight: 600, textAlign: "start",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(24,159,209,.14)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "#189FD1", display: "inline-flex" }}>{a.icon}</span>
                {t(a.label as never)}
              </button>
            ))}
          </div>
        </>
      )}
      <style>{`@keyframes ai-spin { to { transform: rotate(360deg); } } .ai-spin { animation: ai-spin 1s linear infinite; }`}</style>
    </div>
  );
}
