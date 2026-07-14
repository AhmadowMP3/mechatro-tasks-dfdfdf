## المشكلة

في مودال "مشروع جديد" حقل "تاريخ الاستحقاق" يستخدم `<input type="date">` الافتراضي — أيقونة التقويم شاحبة/غير واضحة والتقويم المنبثق نظام تشغيل، ما بيطابق ألوان الموقع.

يوجد أصلًا مكوّن `DatePickerField` (في `src/components/DatePickerField.tsx`) مصمّم بألوان الموقع (زر بحدّ `var(--border)`، أيقونة ذهبية واضحة، تقويم منبثق بـ `var(--surface-1)` و `--grad-blue` لليوم المختار، دعم RTL/عربي). ومستخدم فعليًا بأماكن ثانية.

## الحل (ملف واحد)

`src/routes/_authenticated/projects.index.tsx` — سطر 461 داخل مودال "New Project":

استبدال:

```tsx
<Field label={t("dueDate")}>
  <input type="date" value={form.due_date}
    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
    style={inp} />
</Field>
```

بـ:

```tsx
<Field label={t("dueDate")}>
  <DatePickerField
    value={form.due_date}
    onChange={(v) => setForm({ ...form, due_date: v })}
    lang={lang}
  />
</Field>
```

وإضافة استيراد `DatePickerField` أعلى الملف. `lang` متوفر عبر `useApp()` الموجود مسبقًا في الكومبوننت (المتحقق منه).

## خارج النطاق

- لا تغيير على `DatePickerField` نفسه.
- لا تغيير على أي حقل تاريخ آخر (المهام وغيرها تستخدم أصلًا `DatePickerField` أو UI مخصّص).
- لا تغيير على منطق الحفظ — الصيغة `YYYY-MM-DD` نفسها.

## النتيجة

- الأيقونة تصبح واضحة (رمز تقويم ذهبي داخل مربع بحدّ ذهبي على خلفية `--surface-2`).
- التقويم المنبثق بألوان الموقع: خلفية داكنة، اليوم المحدّد بتدرّج أزرق (`--grad-blue`)، اليوم الحالي محاط بإطار ذهبي، أسماء الأيام بالعربي.
