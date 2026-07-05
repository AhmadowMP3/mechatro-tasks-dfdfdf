## ملاحظة مهمة قبل ما نبدأ

**رفع إيصالات المصاريف موجود فعلاً وشغّال** في `finance.expenses.tsx`:
- رفع الملف إلى bucket `expense-receipts` عند إنشاء/تعديل المصروف
- عرض/تحميل الإيصال عبر `createSignedUrl` (سطر 71 و 216)

فش شي ناقص هنا — إلا إذا بدك ميزات إضافية (رفع متعدد، معاينة داخل الصفحة، سحب وإفلات). خبّرني إذا بدك تحسينات وإلا رح أعتبرها منتهية وأركّز على الأربعة الباقية.

---

## المخطط: 4 مزايا

### 1) PDF احترافي بالهوية البصرية

**النهج:** استبدال `window.print()` بـ edge function تولد PDF فعلي، لأن `@react-pdf/renderer` ما يشتغل على Cloudflare Workers (يحتاج Node runtime + native). الحل الموثوق: توليد HTML مصمم بالكامل مع الخطوط والشعار من داخل TanStack server function ثم استخدام مكتبة **pdfmake** (Pure JS، تشتغل على Workers) أو الأبسط: توليد HTML جاهز للطباعة + ملف `.pdf.html` يفتحه المستخدم ويطبعه بأمر واحد.

**بعد بحث موجز:** الحل الأنظف على Cloudflare Workers = مكتبة **`pdf-lib`** (Pure JS، متوافقة مع Workers، تدعم النصوص العربية عبر custom fonts embed). لكنها بدون HTML — كل شي رسم يدوي.

**النهج المختار (عملي وسريع):**
- **Supabase Edge Function** `generate-pdf` (Deno runtime، يدعم كل شي) باستخدام `jspdf` + `jspdf-autotable` للجداول، مع تضمين خط Almarai كـ Base64 لدعم العربية.
- الشعار يُضمّن كصورة PNG (base64) داخل الـ edge function.
- يستقبل payload من ثلاث أنواع: `invoice`, `payment_receipt`, `payroll_slip`.
- يرجّع PDF binary → المتصفح يحمّله مباشرة.

**التصميم:**
- Header بتدرج `--grad-blue` (#3B82F6 → #1E40AF)
- شعار Mechatro يسار (أو يمين حسب اللغة)
- Footer فيه رقم الوثيقة + تاريخ الإصدار + رقم الصفحة
- ألوان: أزرق (رئيسي)، أخضر #50C878 (مدفوع)، أحمر #F0676A (متأخر)
- خط Almarai للعربي، خط Montserrat للإنكليزي

**نقاط الاستدعاء:**
- `finance.invoices.$id.tsx` → زر "تحميل PDF" يستدعي `generate-pdf` بـ `type=invoice`
- `finance.payroll.tsx` → قسيمة الراتب `type=payroll_slip`

### 2) تذكيرات الاستحقاق (Cron Job)

**Server Route:** `src/routes/api/public/hooks/finance-reminders.ts`
- يُشغَّل يومياً الساعة 8 صباحاً (توقيت UTC)
- يمر على:
  - **اشتراكات صادرة** (`subscriptions_expense`) قريبة التجديد ضمن `reminder_days` → ينشئ إشعار للمشرفين الماليين نوع `subscription_due`
  - **اشتراكات عملاء** (`subscriptions_income`) قريبة الفاتورة القادمة → إشعار
  - **فواتير غير مدفوعة** (`invoices` بحالة `issued` أو `partially_paid`) خلال 3 أيام من `due_date` → إشعار
  - **فواتير متأخرة** (`due_date < today` وليست `paid`) → إشعار + تحديث الحالة إلى `overdue`
- يستخدم `supabaseAdmin` (خدمة داخلية) ومحمي بحقل `apikey` header
- يمنع التكرار عبر جدول `finance_reminders_log(entity_type, entity_id, sent_on DATE)` مع unique constraint

**pg_cron:**
```sql
SELECT cron.schedule('finance-daily-reminders','0 8 * * *', $$
  SELECT net.http_post(
    url:='https://project--70935899-f801-4b02-9f3a-e174fc26093c.lovable.app/api/public/hooks/finance-reminders',
    headers:='{"Content-Type":"application/json","apikey":"..."}'::jsonb,
    body:='{}'::jsonb
  );
$$);
```

**نوع إشعار جديد** يُضاف لجدول `notifications` (النوع موجود كنص، لا يحتاج enum).

### 3) إيصالات الدفع (Payment Receipts)

- في `finance.invoices.$id.tsx` بجانب كل دفعة → زر "إيصال" (Receipt icon)
- يفتح modal فيه معاينة الإيصال ثم زر "تحميل PDF"
- يستدعي نفس `generate-pdf` بـ `type=payment_receipt` مع payload:
  ```
  { invoiceNumber, customerName, paymentAmount, paymentMethod, paidAt, reference, remainingBalance }
  ```
- تصميم الإيصال: صفحة A5 أو A4 مبسّطة، فيها ختم "RECEIVED" أخضر مائل، أرقام الفاتورة والإيصال، توقيع الشركة

### 4) تصدير Excel حقيقي (.xlsx)

- إضافة مكتبة `xlsx` (SheetJS، Pure JS، شغّالة في المتصفح)
- استبدال جميع `downloadCsv` في `finance.reports.tsx` بـ `downloadXlsx` تولد ملف واحد فيه sheets متعددة:
  - Sheet "P&L"
  - Sheet "A/R Aging"
  - Sheet "Project Profitability"
  - Sheet "Client Balances"
- تنسيق مع rich formatting: عمود العملة يستخدم `numFmt: '#,##0.00'`، الرؤوس ملوّنة بالأزرق، RTL sheet direction إذا كان العرض بالعربي
- زر جديد "تصدير Excel" بجانب "تصدير / طباعة PDF" في الهيدر، مع الاحتفاظ بأزرار CSV لكل قسم منفصل

---

## Technical details

**الملفات الجديدة:**
- `supabase/functions/generate-pdf/index.ts` (Deno edge function)
- `supabase/functions/generate-pdf/assets/almarai-base64.ts` (خط عربي)
- `supabase/functions/generate-pdf/assets/logo-base64.ts` (شعار)
- `supabase/functions/generate-pdf/templates.ts` (قوالب الفاتورة/الإيصال/قسيمة الراتب)
- `src/routes/api/public/hooks/finance-reminders.ts` (TanStack server route)
- `src/lib/xlsx-export.ts` (helper لبناء sheets)
- `src/components/finance/PaymentReceiptModal.tsx`

**تعديل:**
- `src/routes/_authenticated/finance.invoices.$id.tsx`: `downloadPdf` يستدعي edge function، زر إيصال لكل دفعة
- `src/routes/_authenticated/finance.payroll.tsx`: زر PDF لقسيمة الراتب
- `src/routes/_authenticated/finance.reports.tsx`: زر Excel
- `src/i18n/dict.ts`: مفاتيح جديدة (receipt, paymentReceipt, exportXlsx, dueSoon, etc.)

**هجرات SQL:**
- جدول `finance_reminders_log` مع RLS ومنح صلاحيات
- تفعيل `pg_cron` و `pg_net` إذا لم تكن مفعّلة
- schedule الـ cron عبر supabase--insert tool (بعد نشر الـ route)

**الأمان:**
- edge function `generate-pdf`: `verify_jwt=false` مع فحص داخلي أن المستخدم مصادق عبر بيرر توكن ممرر يدوياً، أو نجعله عام لأن الـ payload يأتي كامل من العميل (لا نقرأ من DB)
- `finance-reminders` route: يتحقق من header `apikey` يطابق anon key + logic كلها من داخل SQL/service role
- Excel export: كلياً client-side، بدون endpoint

**مكتبات جديدة:**
- `xlsx` (~700kb لكن lazy-imported فقط عند الضغط على زر التصدير)
- edge function تستخدم `jspdf` + `jspdf-autotable` عبر esm.sh

---

## ترتيب التنفيذ

1. Excel exports (أسرع، بدون backend)
2. Migration جدول التذكيرات + إشعارات
3. Server route + جدولة cron
4. Edge function `generate-pdf` + قوالب
5. ربط PDF بالفواتير + قسائم الرواتب
6. Modal إيصال الدفع

---

هل الخطة توافق توقعاتك؟ ولا بدك تعديل على أي جزء (مثلاً: PDF بدون edge function، أو تذكيرات كل ساعة بدل يومي، أو تصدير Excel لكل قسم منفصل بدل ملف واحد)؟