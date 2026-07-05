## الهدف

إضافة إمكانية حذف النسخ الاحتياطية من صفحة الإعدادات (متاحة للمسؤول الرئيسي فقط).

## التغييرات

### 1. `supabase/functions/backup-snapshot/index.ts`

إضافة فرع جديد للحذف:
```
{ delete: true, file: "backup-....json" }
```
- التحقق أن المستخدم `is_master_admin` (موجود مسبقاً في بداية الدالة).
- استدعاء `sb.storage.from("backups").remove([body.file])`.
- إرجاع `{ ok: true, deleted: filename }`.

### 2. `src/routes/_authenticated/settings.tsx`

داخل `BackupsSection` (للمسؤول الرئيسي فقط):
- إضافة `handleDelete(b)` يستدعي الـ edge function بـ body `{ delete: true, file: b.name }` بعد تأكيد بسيط.
- إضافة زر **حذف** بجانب زري "تنزيل" و"استعادة" في كل من عرض الجوال والجدول، بأيقونة `Trash2` من `lucide-react` وألوان تحذير (نفس نمط الاستعادة لكن باللون الأحمر).
- إظهار `confirm()` بسيط بنص الترجمة قبل التنفيذ.
- استدعاء `refetch()` بعد النجاح.

### 3. `src/i18n/dict.ts`

مفاتيح ترجمة جديدة:
- `delete` → "حذف" / "Delete" (إن لم يكن موجوداً؛ إن وُجد نُعيد استخدامه)
- `confirmDeleteBackup` → "هل تريد حذف هذه النسخة الاحتياطية نهائياً؟" / "Delete this backup permanently?"
- `backupDeleted` → "تم حذف النسخة" / "Backup deleted"

## ملاحظات

- الحذف يقتصر على المسؤول الرئيسي لأن الأزرار داخل الفرع المحمي بـ `isMasterAdmin` أصلاً، والـ edge function تتحقق مجدداً من الصلاحية.
- لا حاجة لتغييرات في قاعدة البيانات أو سياسات Storage.
