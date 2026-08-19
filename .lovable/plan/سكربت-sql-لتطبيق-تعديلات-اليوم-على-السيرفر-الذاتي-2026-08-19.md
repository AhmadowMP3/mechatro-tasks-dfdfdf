# سكربت SQL لتطبيق تعديلات اليوم على السيرفر الذاتي

## الهدف
ملف SQL واحد جاهز للنسخ في SQL Editor على `supamecha.hub4tech.net`، يحتوي كل تغييرات قاعدة البيانات التي تمت اليوم (19 آب) بعد النقل.

## المحتوى (3 ترحيلات مدمجة)
1. جعل حقل المشروع في المهمة اختيارياً: `ALTER TABLE public.tasks ALTER COLUMN project_id DROP NOT NULL;`
2. تقييد رؤية المهام حسب الصلاحية:
   - دالتان في مخطط `private`: `is_task_assignee` و `can_view_task`.
   - إعادة إنشاء سياسات RLS على `tasks` و `task_assignees` و `task_comments` و `task_files` (قراءة/تعديل/إضافة).
3. دالة `public.team_pulse()` مع صلاحيات التنفيذ للمستخدمين المسجّلين فقط (سحب الصلاحية من `PUBLIC` و `anon`).

## التفاصيل التقنية
- الملف الجديد: `scripts/sql/2026-08-19-latest.sql` (لا يعدّل أي ملف مصدري آخر).
- الأوامر مكتوبة بصيغة قابلة لإعادة التشغيل: `CREATE OR REPLACE FUNCTION` و `DROP POLICY IF EXISTS` قبل كل `CREATE POLICY`.
- في بدايته سطر تحقق `CREATE SCHEMA IF NOT EXISTS private;` ضماناً لوجود المخطط قبل إنشاء الدوال.
- تعليقات عربية قصيرة تفصل الأقسام الثلاثة لتسهيل التنفيذ الجزئي عند الحاجة.
- بعد الإنشاء أشرح لك بجملة كيف تنسخه وتشغّله في SQL Editor.
