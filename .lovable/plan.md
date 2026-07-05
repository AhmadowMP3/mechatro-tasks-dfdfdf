## منع حذف أحدث نسخة احتياطية

الهدف: ما نسمح للمستخدم يحذف آخر (أحدث) نسخة احتياطية موجودة في bucket `backups`، حتى ما نضل بدون أي نسخة للاسترجاع.

### التغييرات

**1. `supabase/functions/backup-snapshot/index.ts` (فرع `delete`)**
- قبل تنفيذ `remove()`, نجيب قائمة الملفات من `sb.storage.from("backups").list()`.
- نرتّبها تنازلياً حسب `created_at` (أو الاسم لأنه يحتوي timestamp) ونحدّد اسم الأحدث.
- إذا `body.file === latest.name` → نرجّع `400` مع `{ error: "cannot_delete_latest" }`.
- غير هيك، نكمل الحذف عادي.

**2. `src/routes/_authenticated/settings.tsx`**
- في `BackupsSection`: نحسب `latestName` = أول عنصر بعد الترتيب النازل للنسخ.
- زر الحذف يصير `disabled` للنسخة الأحدث مع `title` توضيحي.
- في `deleteBackup`: نتعامل مع خطأ `cannot_delete_latest` ونعرض `toast` بالمفتاح الجديد.

**3. `src/i18n/dict.ts`**
- مفاتيح جديدة:
  - `cannotDeleteLatest`: "لا يمكن حذف أحدث نسخة احتياطية" / "Cannot delete the latest backup"
  - `latestBackupTooltip`: "الأحدث — محمية من الحذف" / "Latest — protected"

### الحماية بطبقتين
- الواجهة تعطّل الزر (تجربة مستخدم واضحة).
- الـ edge function ترفض الطلب حتى لو انحايل عليها (أمان فعلي).
