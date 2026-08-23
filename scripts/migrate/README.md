# نقل الباك-إند إلى Supabase الخاص بك

الترتيب:

```bash
export TARGET_URL=https://supabase.mechatro-sy.com
export TARGET_SERVICE_KEY=<service_role key>
export TARGET_DB_URL=postgresql://postgres:<pass>@<host>:5432/postgres

# 1) البنية: الجداول والدوال والسياسات والصلاحيات
bash scripts/migrate/01-schema.sh

# 2) حسابات المستخدمين (نفس الـUUID، كلمة مرور مؤقتة)
bun scripts/migrate/03-users.ts        # يقرأ /tmp/migrate/profiles.json

# 3) بيانات الجداول
bash scripts/migrate/02-data.sh

# 4) ملفات التخزين
SOURCE_URL=... SOURCE_SERVICE_KEY=... bun scripts/migrate/04-storage.ts
```

ملاحظات:

- كلمات المرور الحالية لا يمكن تصديرها من الباك-إند المُدار (الهاش غير متاح عبر الـAPI)،
  لذلك تُنشأ الحسابات بكلمة مرور مؤقتة (`TEMP_PASSWORD`) ويغيّرها كل مستخدم من داخل التطبيق،
  أو يضبطها المدير من صفحة التحكم بالوصول.
- الخطوة 2 قبل الخطوة 3 لأن جداول كثيرة ترتبط بـ`auth.users`.
- بيانات المالية تنتقل مشفّرة كما هي وتُفتح بنفس كلمة الخزنة.
