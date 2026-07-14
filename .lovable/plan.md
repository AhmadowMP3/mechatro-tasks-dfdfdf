## المطلوب

في نافذة تفاصيل المهمة (`TaskDetailModal`)، أضِف قسمًا للسوبر أدمن/الأدمن يعرض من بدأ العمل ومتى، مع عدّاد وقت مباشر بصيغة `HH:MM:SS`، ويتحدث فوريًا (realtime) بدون إعادة تحميل.

## التغييرات

### 1) `src/components/TaskDetailModal.tsx`
- إضافة دالة `formatHMS(seconds)` تُخرج `HH:MM:SS` (مع الأرقام العربية عبر `toLocalDigits` عند اللغة العربية).
- الاشتراك بالـ realtime على `work_sessions` لهذه المهمة داخل `useEffect`:
  ```
  supabase.channel(`ws-${taskId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'work_sessions', filter: `task_id=eq.${taskId}` }, () => load())
    .subscribe();
  ```
  مع تنظيف عبر `removeChannel` عند unmount.
- إضافة قسم جديد يظهر فقط لمن يملك `can("manage_tasks")` (السوبر أدمن/الأدمن):
  - **الجلسات النشطة الآن**: كل صف يعرض Avatar + اسم العضو + "بدأ في: HH:MM (تاريخ)" + عدّاد حي `HH:MM:SS` يعتمد على `now - started_at` (يتحدّث كل ثانية عبر `now` الموجود أصلًا).
  - **سجل الجلسات**: قائمة مختصرة بالجلسات المنتهية: اسم العضو + بدأ في + انتهى في + المدة بصيغة `HH:MM:SS`.
- تغيير عدّاد "إجمالي الوقت" الحالي من `formatMinutes` إلى `HH:MM:SS` محسوب بالثواني (جمع مدد الجلسات المنتهية + الفارق الحي للجلسات المفتوحة) ليكون بالثواني والدقائق والساعات ومباشرًا.
- إبقاء زر "بدء العمل / إيقاف مؤقت" كما هو (منطق `toggleTimer` بدون تغيير).

### تفاصيل فنية
- الـ RLS الحالية على `work_sessions` تسمح للأدمن بقراءة كل الجلسات، لذا لا تعديل قاعدة بيانات.
- `work_sessions` مُضاف مسبقًا لـ `supabase_realtime`، لذا لا يلزم migration.
- `useState<now>` الموجود يعمل بتحديث كل ثانية — يكفي للعدّاد الحي.
- المدة الحية = `Math.floor((now - new Date(started_at).getTime()) / 1000)`.
- المدة المخزّنة `duration_minutes` تُحوَّل إلى ثوانٍ للعرض `HH:MM:SS`.

### خارج نطاق التغيير
- لا تغيير في صفحات أخرى (Dashboard / Tasks list).
- لا تغيير في صلاحيات أو RLS.
