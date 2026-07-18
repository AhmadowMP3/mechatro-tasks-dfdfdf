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

  // Not-null / FK / check violations — humanize with friendly field names.
  if (code === "23502") {
    const col = extractColumn(message, details);
    const field = col ? friendlyField(col, lang) : null;
    return field
      ? L(lang, `الحقل «${field}» مطلوب. الرجاء تعبئته قبل الحفظ.`, `The "${field}" field is required. Please fill it in before saving.`)
      : L(lang, "هناك حقل مطلوب فارغ. الرجاء تعبئة جميع الحقول الأساسية.", "A required field is empty. Please fill in all required fields.");
  }
  if (code === "23503") {
    const col = extractColumn(message, details);
    const field = col ? friendlyField(col, lang) : null;
    return field
      ? L(lang, `القيمة المحددة في «${field}» غير موجودة أو تم حذفها.`, `The selected value in "${field}" no longer exists.`)
      : L(lang, "أحد العناصر المرتبطة غير موجود. حدّث الصفحة وحاول مجدداً.", "A linked item no longer exists. Refresh the page and try again.");
  }
  if (code === "23505") {
    const col = extractColumn(message, details);
    const field = col ? friendlyField(col, lang) : null;
    return field
      ? L(lang, `القيمة الموجودة في «${field}» مستخدمة مسبقاً. اختر قيمة أخرى.`, `The value in "${field}" is already in use. Please pick another.`)
      : L(lang, "هذه القيمة موجودة مسبقاً. اختر قيمة مختلفة.", "That value already exists. Please choose a different one.");
  }
  if (code === "23514") {
    return L(lang, "القيمة المدخلة غير مقبولة. تحقق من الحدود المسموحة.", "The entered value isn't accepted. Please check the allowed range.");
  }
  if (code === "22P02") {
    return L(lang, "صيغة القيمة غير صحيحة. تحقق من الحقول المدخلة.", "One of the values has an invalid format. Please check the fields.");
  }
  if (code === "PGRST116") {
    return L(lang, "العنصر المطلوب غير موجود أو تم حذفه.", "The requested item wasn't found or has been removed.");
  }

  // Fallback — friendly, no raw SQL leakage.
  const msg = message ?? "";
  if (msg && !/violates|null value in column|constraint|relation|schema/i.test(msg)) {
    return L(lang, `تعذّر إتمام العملية: ${msg}`, `Couldn't complete the action: ${msg}`);
  }
  void hint;
  return L(
    lang,
    "حدث خطأ غير متوقع أثناء حفظ البيانات. الرجاء المحاولة مرة أخرى.",
    "Something went wrong while saving. Please try again.",
  );
}

function extractColumn(message?: string, details?: string): string | null {
  const src = `${message ?? ""} ${details ?? ""}`;
  const m =
    src.match(/null value in column "([^"]+)"/i) ||
    src.match(/column "([^"]+)"/i) ||
    src.match(/Key \(([^)]+)\)=/i);
  return m ? m[1].split(",")[0].trim() : null;
}

function friendlyField(col: string, lang: Lang): string {
  const map: Record<string, [string, string]> = {
    number: ["رقم الفاتورة", "invoice number"],
    invoice_number: ["رقم الفاتورة", "invoice number"],
    customer_id: ["العميل", "customer"],
    project_id: ["المشروع", "project"],
    user_id: ["المستخدم", "user"],
    assignee_id: ["المسؤول", "assignee"],
    created_by: ["المُنشئ", "creator"],
    issue_date: ["تاريخ الإصدار", "issue date"],
    due_date: ["تاريخ الاستحقاق", "due date"],
    paid_at: ["تاريخ الدفع", "payment date"],
    amount: ["المبلغ", "amount"],
    total: ["الإجمالي", "total"],
    currency: ["العملة", "currency"],
    title: ["العنوان", "title"],
    name: ["الاسم", "name"],
    name_ar: ["الاسم بالعربية", "Arabic name"],
    name_en: ["الاسم بالإنجليزية", "English name"],
    email: ["البريد الإلكتروني", "email"],
    phone: ["رقم الهاتف", "phone number"],
    status: ["الحالة", "status"],
    category_id: ["الفئة", "category"],
    description: ["الوصف", "description"],
    quantity: ["الكمية", "quantity"],
    unit_price: ["سعر الوحدة", "unit price"],
    date: ["التاريخ", "date"],
  };
  const hit = map[col.toLowerCase()];
  if (hit) return lang === "ar" ? hit[0] : hit[1];
  return col.replace(/_/g, " ");
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
