# تفعيل Google OAuth للنسخ الاحتياطي بعد توفّر المفاتيح

الهدف: التأكد أن زر «الربط بحساب Google» يعمل الآن وأن النسخ ترتفع تلقائياً إلى Google Drive.

## الحالة الحالية

- الكود جاهز: `src/lib/drive-oauth.functions.ts` تبدأ OAuth، و `src/routes/api/public/google/drive-callback.ts` تستقبل الرد.
- المستخدم زوّد المفتاحين كأسرار: `GOOGLE_OAUTH_CLIENT_ID` و `GOOGLE_OAUTH_CLIENT_SECRET`.
- بقي: التحقق من أن الخادم يرى الأسرار، وأن عنوان الإرجاع (Redirect URI) مطابق، وأن التدفق كامل يعمل.

## الخطوات

1. **التحقق من الأسرار في بيئة التشغيل**
   - قراءة `process.env['GOOGLE_OAUTH_CLIENT_ID']` داخل server function بسيط للتأكد أن القيم واصلة.
   - التأكد أن `GOOGLE_OAUTH_CLIENT_SECRET` موجود أيضاً.

2. **التأكد من Redirect URI في Google Cloud**
   - يجب أن يكون مسجلاً بالضبط:
     - `https://mechatro.hub4tech.net/api/public/google/drive-callback` (النطاق المنشور)
     - `https://mechatro-tasks.lovable.app/api/public/google/drive-callback` (النطاق المدار)
     - `http://localhost:8080/api/public/google/drive-callback` (للمعاينة المحلية إن احتجنا اختبار)
   - أي اختلاف حرف واحد يسبّب `redirect_uri_mismatch`.

3. **تصحيح واجهة الإعدادات**
   - في `src/routes/_authenticated/settings.tsx`: التأكد أن `oauthReady` يصبح `true` عند وجود الأسرار.
   - إزالة/تعديل السطر الإرشادي الأصفر لما تكون المفاتيح جاهزة.
   - التأكد أن زر «الربط بحساب Google» لا يبقى معطّلاً بعد توفّر الأسرار.

4. **اختبار التدفق الكامل**
   - الضغط على زر الربط في الإعدادات → يجب أن يفتح نافذة Google consent.
   - الموافقة → العودة إلى `/settings?drive=connected`.
   - التحقق من حفظ `refresh_token` في `drive_config`.

5. **اختبار النسخة الاحتياطية**
   - تشغيل نسخة يدوية أو انتظار الجدولة.
   - التأكد أن `backup-snapshot` يستطيع تجديد التوكن ورفع الملف إلى Drive.

6. **معالجة الأخطاء المحتملة**
   - `redirect_uri_mismatch`: إضافة/تصحيح الـ Redirect URI في Google Cloud.
   - `access_denied`: التأكد من وضع OAuth consent screen على External وإضافة البريد كـ Test user.
   - `Drive API has not been used`: تفعيل Google Drive API في المشروع.

## النتيجة المتوقعة

زر «الربط بحساب Google» يعمل، والنسخ الاحتياطية ترتفع تلقائياً إلى مجلد/مجلدات Google Drive المختارة.
