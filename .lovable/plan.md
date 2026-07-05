## سبب المشكلة
عند حفظ تقرير عضو، الكود يرفع ملف PDF إلى bucket `member-reports` في Storage ثم يضيف سطر بجدول `member_reports`. الرفع فشل بسبب:

```
StorageApiError: new row violates row-level security policy
```

فحصت `pg_policies` على `storage.objects` — لا توجد أي سياسة (policy) خاصة بـ bucket `member-reports`، فأي رفع للأدمن يُرفَض. الجدول `member_reports` نفسه صحيح (فيه policy `member_reports_admin_all`)، لكن الرفع لا يصل لمرحلة الإدراج.

## الحل
إضافة migration يضيف سياسات Storage للـ bucket `member-reports` تسمح للأدمن بـ SELECT/INSERT/UPDATE/DELETE، باستخدام دالة `private.is_admin(auth.uid())` نفسها المستخدمة في باقي المشروع:

```sql
CREATE POLICY "member_reports_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));

CREATE POLICY "member_reports_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));

CREATE POLICY "member_reports_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'member-reports' AND private.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));

CREATE POLICY "member_reports_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));
```

بعد التطبيق، إعادة توليد التقرير سيرفع الملف بنجاح ويظهر في سجل التقارير.

## ملاحظة
تقارير الفريق (Team) لا تُحفَظ في السجل حالياً — الكود يحمّلها فقط بدون رفع/إدراج. لو تبغى تقارير الفريق تظهر كمان في السجل، قلي وأضيفها في خطوة تالية.
