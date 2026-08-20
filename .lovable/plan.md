# معنى الخطأ `oauth_not_configured` وكيفية إنهائه

## ما الذي يحدث بالضبط

زر «الربط بحساب Google» يطلب من الخادم بدء جلسة OAuth. الخادم يقرأ المتغيّر `GOOGLE_OAUTH_CLIENT_ID`، وإذا لم يجده يرمي `oauth_not_configured` — وهذا ما ظهر في الرسالة الحمراء. الأماكن التي تتحقق من ذلك:

- `src/lib/drive-oauth.functions.ts` (بدء الربط)
- `src/routes/api/public/google/drive-callback.ts` (استقبال رد Google)
- `supabase/functions/backup-snapshot/index.ts` (تجديد التوكن أثناء النسخ)

أي: الكود جاهز بالكامل، الناقص فقط قيمتان من Google Cloud لم تُضافا بعد. أما شريط «Google Drive sync is not configured» فهو نتيجة طبيعية لعدم وجود ربط بعد، وسيختفي فور اكتمال الربط واختيار مجلد.

## الخطوات لإنهائه

1. **من Google Cloud** (نفس الخطوات المكتوبة في «دليل الإعداد الكامل» أسفل البطاقة):
   إنشاء مشروع ← تفعيل Google Drive API ← ضبط OAuth consent screen (External + إضافة بريدك في Test users) ← إنشاء OAuth Client ID نوع **Web application** ← لصق عنوان الإرجاع:
   `https://mechatro.hub4tech.net/api/public/google/drive-callback`
   ثم نسخ **Client ID** و **Client Secret**.

2. **حفظ القيمتين كأسرار للمشروع** باسمَي `GOOGLE_OAUTH_CLIENT_ID` و`GOOGLE_OAUTH_CLIENT_SECRET` — سأفتح لك نموذج الإدخال الآمن حال موافقتك، ولن تظهر القيم في الكود أو الواجهة.

3. **للسيرفر الذاتي**: إضافة نفس المتغيّرين إلى بيئة دالة `backup-snapshot` ثم إعادة نشرها عبر `scripts/deploy-edge-functions.sh` (بدونهما لن يستطيع الخادم تجديد التوكن أثناء النسخ التلقائي).

4. **تحسين صغير في الواجهة** بعد ذلك: عند غياب المفاتيح، يُعطَّل زر «الربط بحساب Google» ويظهر تحته سطر إرشادي «يحتاج إعداد مفاتيح OAuth — راجع الدليل أدناه» بدل ظهور رسالة خطأ حمراء عند كل ضغطة. الحالة `oauth_available` موجودة أصلاً في رد `drive_status`، ستُستخدم لهذا الغرض في `src/routes/_authenticated/settings.tsx`.

## البديل الفوري بدون Google Cloud

إذا أردت البدء الآن دون انتظار: افتح «خيارات متقدّمة (حساب خدمة)» وارفع ملف JSON لحساب خدمة وشارك مجلد Drive معه بصلاحية Editor. المزامنة ستعمل بالكامل بهذا المسار، ويبقى مسار الربط بضغطة متاحاً لاحقاً.
