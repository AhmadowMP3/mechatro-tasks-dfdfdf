# مزامنة النسخ الاحتياطية مع Google Drive

نعم، هذا ممكن بالكامل. بعد كل نسخة احتياطية (يدوية أو تلقائية كل 10 أيام) يتم إنشاء ملف ZIP واحد ورفعه تلقائياً إلى مجلد على Google Drive، مع الاحتفاظ بآخر 12 نسخة هناك أيضاً.

## كيف رح يشتغل

```text
backup-snapshot  →  JSON لقاعدة البيانات + ملفات التخزين
                 →  ضغطها بملف واحد: mechatro-backup-YYYY-MM-DD.zip
                 →  رفعه إلى Google Drive (Service Account)
                 →  حذف النسخ الأقدم من آخر 12 على Drive
                 →  تسجيل الحالة + رابط الملف داخل الإعدادات
```

- الرفع يتم داخل نفس عملية النسخ، فلا حاجة لأي خطوة يدوية.
- إذا فشل الرفع لأي سبب، النسخة تبقى محفوظة داخل النظام كالمعتاد وتظهر رسالة تنبيه — لا تفشل عملية النسخ كلها.
- في صفحة الإعدادات: مؤشر «مزامَن مع Drive» بجانب كل نسخة، رابط فتح الملف على Drive، وزر «رفع هذه النسخة إلى Drive» للنسخ القديمة.

## اللي بحاجته منك (خطوات لمرة واحدة)

1. من Google Cloud Console: إنشاء مشروع → تفعيل **Google Drive API** → إنشاء **Service Account** → إنشاء مفتاح JSON وتنزيله.
2. تعطيني محتوى ملف JSON (سيُخزَّن كسر مشفَّر على السيرفر، ولن يظهر في الكود أو الواجهة).
3. إنشاء مجلد على Google Drive (مثلاً `Mechatro Backups`) ومشاركته مع بريد الـ Service Account (`...@...iam.gserviceaccount.com`) بصلاحية **Editor**، ثم تعطيني رابط المجلد.

ملاحظة مهمة: مساحة Service Account في Drive صفر، لذلك يجب الرفع داخل مجلد مشترك من حسابك (أو Shared Drive) حتى تُحتسب المساحة على حسابك.

## التفاصيل التقنية

- سر جديد: `GOOGLE_DRIVE_SA_JSON` + `GOOGLE_DRIVE_FOLDER_ID` في بيئة السيرفر.
- وحدة جديدة `supabase/functions/_shared/gdrive.ts`: توليد JWT موقّع بـ RS256 من الـ Service Account، استبداله بـ access token عبر `oauth2.googleapis.com/token`، ثم:
  - `POST /upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true` للرفع،
  - `GET /drive/v3/files?q='<folderId>' in parents` + `DELETE` لتطبيق سياسة الاحتفاظ (12).
- ضغط ZIP داخل الدالة عبر مكتبة Deno خفيفة (`jsr:@zip-js/zip-js`) بدون كتابة على القرص — تجميع JSON القاعدة + ملفات الباكتات في stream واحد.
- جدول `backup_requests` / سجلّ النسخ: إضافة عمودَي `drive_file_id` و`drive_synced_at` عبر migration لعرض الحالة في الواجهة.
- إجراء جديد في الدالة: `{ sync_to_drive: true, file: "backup-....json" }` لرفع نسخة موجودة يدوياً (Master Admin فقط).
- تحديث `scripts/sql/` بملف SQL للسيرفر الـ self-hosted، وتحديث `scripts/deploy-edge-functions.sh` عند الحاجة.

## التحقق

تشغيل نسخة يدوية من الإعدادات والتأكد من ظهور ملف ZIP في مجلد Drive، ثم تشغيل ثانية للتأكد من عمل الاحتفاظ والحالة في الواجهة.
