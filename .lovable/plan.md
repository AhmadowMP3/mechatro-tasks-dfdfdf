## الهدف

ترقية الحساب `zizo` (id: `d90cf90e-9301-4ffd-aad3-8b2000ee34e3`) إلى Master Admin، وإزالة العلامة عن `tester@mechatro.test` حتى يبقى مسؤول رئيسي واحد.

## الخطوات

1. تشغيل Migration بيانات على جدول `profiles`:
   - `UPDATE profiles SET is_master_admin = false WHERE is_master_admin = true;`
   - `UPDATE profiles SET is_master_admin = true, role = 'admin', status = 'active' WHERE id = 'd90cf90e-9301-4ffd-aad3-8b2000ee34e3';`
2. تحديث `app_config.master_admin_email` لبريد zizo لكي لا تُعيده دالة `sync_master_admin()` إلى الحساب القديم لاحقاً.
3. جلب البريد الحالي لـ zizo من `profiles` واستخدامه في التحديث.

## بعد التنفيذ

سيتمكن zizo فور تحديث الصفحة من:
- رؤية زر "نسخة الآن" (تنفيذ فوري) بدل زر "طلب نسخة احتياطية".
- الموافقة/الرفض للطلبات المعلقة.
- تحميل واستعادة النسخ الاحتياطية.
- ظهور قسم "Test users" في الإعدادات.
