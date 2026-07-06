import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ActionSchema = z.object({
  action: z.enum(["summarize", "rewrite", "translate_en", "translate_ar", "continue", "fix_grammar", "outline"]),
  text: z.string().min(1).max(20000),
  lang: z.enum(["en", "ar"]).default("en"),
});

const PROMPTS: Record<string, (lang: "en" | "ar") => string> = {
  summarize: (l) =>
    l === "ar"
      ? "لخّص النص التالي بنقاط واضحة ومختصرة باللغة العربية. أرجع HTML فقط باستخدام <ul><li>."
      : "Summarize the following text as clear, concise bullet points. Return HTML only using <ul><li>.",
  rewrite: (l) =>
    l === "ar"
      ? "أعد صياغة النص التالي ليكون أوضح وأكثر احترافية مع الحفاظ على المعنى. أرجع HTML فقط."
      : "Rewrite the following text to be clearer and more professional while keeping the meaning. Return HTML only.",
  translate_en: () => "Translate the following text to English. Preserve tone and formatting. Return HTML only.",
  translate_ar: () => "Translate the following text to Arabic. Preserve tone and formatting. Return HTML only.",
  continue: (l) =>
    l === "ar"
      ? "تابع الكتابة بعد النص التالي بنفس الأسلوب واللغة العربية. أعد جملتين أو ثلاث فقط. HTML فقط."
      : "Continue writing after the following text in the same tone. Return two or three additional sentences. HTML only.",
  fix_grammar: (l) =>
    l === "ar"
      ? "صحّح القواعد والإملاء في النص التالي مع الحفاظ على المعنى والأسلوب. HTML فقط."
      : "Fix grammar and spelling in the following text while preserving meaning and tone. HTML only.",
  outline: (l) =>
    l === "ar"
      ? "أنشئ مخطط مفصّل (Outline) للموضوع التالي باستخدام <h2> و<ul><li>. HTML فقط."
      : "Create a detailed outline for the following topic using <h2> and <ul><li>. HTML only.",
};

export const noteAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActionSchema.parse(data))
  .handler(async ({ data }): Promise<{ html: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");
    const system = PROMPTS[data.action](data.lang);
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.text },
        ],
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      if (resp.status === 429) throw new Error("Rate limit — please try again in a moment.");
      if (resp.status === 402) throw new Error("AI credits exhausted — add credits in the workspace.");
      throw new Error(`AI request failed: ${resp.status} ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    // Strip fenced markdown wrappers if the model included them.
    const html = raw
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return { html };
  });
