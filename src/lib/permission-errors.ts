// Translates raw Supabase/PostgREST errors into detailed, human-readable
// permission messages so users see exactly why a create/update was blocked.
import type { PostgrestError } from "@supabase/supabase-js";
import type { Profile } from "@/lib/app-context";

type Lang = "ar" | "en";

type ActionContext = {
  action: "create" | "update" | "delete";
  entity: "project" | "task" | string;
  user: Profile | null;
  lang: Lang;
};

const L = (lang: Lang, ar: string, en: string) => (lang === "ar" ? ar : en);

export function explainSupabaseError(
  error: Pick<PostgrestError, "code" | "message" | "details" | "hint"> | null | undefined,
  ctx: ActionContext,
): string {
  if (!error) return "";
  const { code, message, details, hint } = error;
  const { user, lang, entity, action } = ctx;
  const role = user?.is_master_admin ? "master_admin" : (user?.role ?? "anonymous");
  const status = user?.status ?? "unknown";

  const entityLabel = L(
    lang,
    entity === "project" ? "مشروع" : entity === "task" ? "مهمة" : entity,
    entity,
  );
  const actionLabel = L(
    lang,
    action === "create" ? "إنشاء" : action === "update" ? "تعديل" : "حذف",
    action,
  );

  // Row-Level Security violation — the most common permission failure.
  // Postgres error 42501 = insufficient_privilege, PGRST error "new row violates row-level security policy" ~ code 42501
  const isRLS =
    code === "42501" ||
    /row-level security|violates row-level|permission denied/i.test(message || "") ||
    /row-level security/i.test(details || "");

  if (isRLS) {
    const required =
      entity === "project" || entity === "task"
        ? L(lang, "Admin أو Master Admin", "Admin or Master Admin")
        : L(lang, "صلاحية أعلى", "a higher role");

    if (status === "suspended") {
      return L(
        lang,
        `تم رفض ${actionLabel} ${entityLabel}: حسابك موقوف.`,
        `${cap(action)} ${entity} denied: your account is suspended.`,
      );
    }
    if (status === "pending") {
      return L(
        lang,
        `تم رفض ${actionLabel} ${entityLabel}: حسابك بانتظار التفعيل من المدير.`,
        `${cap(action)} ${entity} denied: your account is pending admin approval.`,
      );
    }

    return L(
      lang,
      `تم رفض ${actionLabel} ${entityLabel} بواسطة سياسة الأمان (RLS). دورك الحالي: "${role}". الدور المطلوب: ${required}. اطلب من أحد المدراء ترقية حسابك أو إنشاء العنصر بالنيابة عنك.`,
      `${cap(action)} ${entity} denied by security policy (RLS). Your current role: "${role}". Required: ${required}. Ask an admin to promote your account or create the ${entity} for you.`,
    );
  }

  // Trigger-raised RAISE EXCEPTION messages (P0001) — surface them verbatim, they're already descriptive.
  if (code === "P0001") {
    return L(
      lang,
      `تم رفض ${actionLabel} ${entityLabel}: ${message}`,
      `${cap(action)} ${entity} blocked: ${message}`,
    );
  }

  // Missing GRANT / schema permission
  if (code === "42501" || /permission denied for/i.test(message || "")) {
    return L(
      lang,
      `تم رفض ${actionLabel} ${entityLabel}: صلاحيات قاعدة البيانات ناقصة (${message}).`,
      `${cap(action)} ${entity} denied: database privileges missing (${message}).`,
    );
  }

  // Not-null / FK / check violations — keep them descriptive
  if (code === "23502") return L(lang, `حقل مطلوب مفقود: ${message}`, `Required field missing: ${message}`);
  if (code === "23503") return L(lang, `مرجع غير صالح: ${message}`, `Invalid reference: ${message}`);
  if (code === "23505") return L(lang, `قيمة مكررة: ${message}`, `Duplicate value: ${message}`);
  if (code === "23514") return L(lang, `القيمة لا تحقق شروط التحقق: ${message}`, `Value fails check constraint: ${message}`);

  // Fallback — include code + hint so it's still useful to admins.
  const parts = [message || L(lang, "خطأ غير معروف", "Unknown error")];
  if (code) parts.push(`(code: ${code})`);
  if (hint) parts.push(`hint: ${hint}`);
  return parts.join(" ");
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
