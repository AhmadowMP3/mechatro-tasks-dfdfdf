# إصلاح ظهور "NaN KB" في حجم النسخ الاحتياطية

## السبب المؤكَّد

استعلام قائمة النسخ في `src/routes/_authenticated/settings.tsx` يجلب الملفات عبر
`supabase.storage.from("backups").list(...)` ثم يُحوّل النتيجة قسراً إلى النوع
`Backup = { name; size; created_at }`. لكن Storage لا يُرجع حقل `size` على مستوى الكائن —
الحجم موجود داخل `metadata.size`. فتصبح `b.size` قيمة `undefined`، و`undefined / 1024`
تُنتج `NaN`، وتُعرض "NaN KB" في صف كل نسخة وفي بطاقة "آخر نسخة".

## الإصلاح

1. قراءة الحجم من مكانه الصحيح عند تحويل نتيجة `list()`:
   - `size = metadata?.size ?? metadata?.contentLength ?? 0`
   - `created_at = created_at ?? updated_at ?? last_accessed_at` (حماية إضافية من تاريخ فارغ).
2. احتياطي: إن بقي الحجم 0/غير معروف، استخدم `size_bytes` من جدول `backup_drive_files`
   المطابق لاسم الملف (متوفّر أصلاً في الصفحة).
3. دالة تنسيق موحّدة `formatBytes` تعرض B / KB / MB بحسب الحجم بدل القسمة الثابتة على 1024،
   مع أرقام محلية عبر `toLocalDigits`، وتعرض "—" عند غياب الحجم فعلياً بدل NaN.
4. تطبيق نفس التنسيق في الموضعين: صف النسخة داخل القائمة المنسدلة، وبطاقة "آخر نسخة".

## ملفات ستُعدَّل

- `src/routes/_authenticated/settings.tsx` (نوع `Backup`، دالة الاستعلام، وموضعا عرض الحجم).

لا تغييرات في قاعدة البيانات أو الـ Edge Function.
