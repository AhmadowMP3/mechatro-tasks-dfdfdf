## المشكلة

المستخدم `zizo` أدمن عادي وليس Master Admin. زر "نسخة الآن" في صفحة الإعدادات يستدعي `backup-snapshot` مباشرة، والدالة ترفض أي شخص غير Master Admin وترجع 403 → لذلك تظهر رسالة "Edge Function returned a non-2xx status code".

بالإضافة، أزرار التحميل والاسترجاع لكل نسخة تعتمد على صلاحيات Master Admin (سياسات Storage تحصر القراءة به)، فحتى لو ظهرت للأدمن العادي فلن تعمل.

## الحل

في `src/routes/_authenticated/settings.tsx` نميّز بين Master Admin والأدمن العادي داخل `BackupsSection`:

1. **Master Admin** — كما هو الآن: زر "نسخة الآن" (تنفيذ فوري)، قائمة النسخ مع تحميل واسترجاع، ومراجعة الطلبات المعلقة.
2. **أدمن عادي** —
   - نستبدل زر "نسخة الآن" بزر **"طلب نسخة احتياطية"** (`requestBackup`) الذي يُدرج صفاً في `backup_requests` بحالة `pending` و `requested_by = auth.uid()`.
   - إذا كان هناك طلب معلق سابق للمستخدم نفسه، نُعطل الزر ونعرض "طلبك قيد المراجعة".
   - نُخفي جدول النسخ الاحتياطية وأزرار التحميل/الاسترجاع (لأن سياسات Storage تمنعه أصلاً وسيرى قائمة فارغة/أخطاء).
   - نضيف بطاقة توضيحية: "سيراجع الطلب المسؤول الرئيسي".

3. نضيف الترجمات اللازمة في `src/i18n/dict.ts`:
   - `requestBackup` → "طلب نسخة احتياطية" / "Request backup"
   - `backupRequestPending` → "طلبك قيد المراجعة من المسؤول الرئيسي" / "Your request is pending master admin approval"
   - `backupRequestSent` → "تم إرسال الطلب" / "Request sent"
   - `backupsMasterOnlyNote` → "إدارة النسخ الاحتياطية متاحة للمسؤول الرئيسي فقط" / "Backup management is restricted to the master admin"

## تفاصيل تقنية

- الإدراج من الواجهة:
  ```ts
  await supabase.from("backup_requests").insert({ status: "pending", requested_by: user.id });
  ```
  (سياسات RLS الحالية تسمح للأدمن بإنشاء طلب — نتحقق قبل التنفيذ؛ إن لم تكن مسموحة، نستخدم استدعاء `backup-snapshot` مع body جديد `{ create_request: true }` يُنفَّذ بصلاحيات service role.)

- نستخدم `useQuery` لجلب آخر طلب pending للمستخدم الحالي ليعرف زر الطلب حالته.

- لا تغييرات في الـ edge function ولا في قاعدة البيانات إن كانت سياسات `backup_requests` تسمح بالإدراج للأدمن (سأتحقق قبل التنفيذ وأضيف سياسة/فرع في الـ edge function عند الحاجة).

## ملفات ستُعدَّل

- `src/routes/_authenticated/settings.tsx` — تفريع المنطق بين Master Admin والأدمن.
- `src/i18n/dict.ts` — مفاتيح ترجمة جديدة.
- (اختياري) `supabase/functions/backup-snapshot/index.ts` — فرع `create_request` احتياطي إن منعت RLS الإدراج المباشر.
