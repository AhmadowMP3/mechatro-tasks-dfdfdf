# توحيد شكل القوائم المنسدلة

## المشكلة
معظم القوائم المنسدلة بالموقع مبنية بعنصر `<select>` الأصلي (native)، وشكل قائمة الخيارات لما تفتح بيتحدد من المتصفح/نظام التشغيل — خلفية بيضاء، خط النظام، بدون حواف مستديرة، بدون ألوان الموقع، وما بيحترم الوضع الداكن ولا اللغة العربية/RTL. نتيجة: كل `select` بالموقع بيطلع بشكل مختلف عن باقي عناصر الواجهة.

## الحل
إنشاء مكوّن موحّد `ThemedSelect` مبني على `Select` من shadcn (Radix)، بحيث:
- زر القائمة (Trigger) نفس ستايل الإدخالات الحالية: `--surface-2`، حدود `--border`، `border-radius` مستدير، ارتفاع 40–44px، أيقونة chevron.
- قائمة الخيارات (Content) بخلفية `--card`، حدود `--border`، ظل، وخيارات hover بلون `--surface-2`.
- الخيار المحدد بلون `--grad-blue` أو accent الموقع.
- يدعم RTL تلقائياً (الأيقونة والمحاذاة).
- API بسيطة مطابقة للـ `FilterSelect` الحالية:
  ```tsx
  <ThemedSelect value={v} onChange={setV} placeholder="..." options={[{value,label}]} />
  ```

## الملفات

**1. جديد: `src/components/ui/ThemedSelect.tsx`**
مكوّن `ThemedSelect` يغلّف `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` من `@/components/ui/select` مع تطبيق ألوان الموقع عبر `style` inline (نفس طريقة باقي الملفات مثل `FilterDrawer.tsx`) — لتفادي تعارض shadcn theming.

**2. تحديث: `src/components/filters/FilterDrawer.tsx`**
استبدال `FilterSelect` الداخلي ليستخدم `ThemedSelect` بدل `<select>` الأصلي — هذا يغطي كل الفلاتر بجميع الصفحات (مهام، فريق، مشاريع، دوري، تقارير، مرجعيات، نشاطات).

**3. تحديث الاستخدامات المباشرة لـ `<select>` (10 مواقع):**
- `src/components/NewTaskModal.tsx` — مشروع، مسؤول، أولوية، حالة (4 selects).
- `src/components/TaskDetailModal.tsx` — مسؤول، أولوية، حالة (3 selects).
- `src/routes/_authenticated/team.tsx` — الدور (1).
- `src/routes/_authenticated/access-control.tsx` — الدور (1).
- `src/routes/_authenticated/projects.index.tsx` — لون المشروع (1).
- `src/routes/_authenticated/projects.$id.tsx` — (1).
- `src/routes/_authenticated/league.tsx` — مشروع (1).
- `src/routes/_authenticated/references.tsx` — (2).

كل موقع: استبدال `<select>...<option>` بـ `<ThemedSelect options={[...]} />` مع الحفاظ على نفس `value`/`onChange`/placeholder والستايل الحالي (`inp`/`selectStyle`).

## خارج النطاق
- ما رح يتغير سلوك الفلاتر أو التحقق أو أي منطق أعمال.
- الحقول النصية والتواريخ ما تتأثر.
- shadcn `Select` الأصلي يبقى موجود، بس ما رح نستعمله مباشرة — كلشي عبر `ThemedSelect`.

## التحقق
- فتح كل صفحة فيها فلاتر (`/tasks`, `/team`, `/projects`, `/league`, `/activity`, `/references`) والتأكد إن القائمة تفتح بخلفية داكنة مطابقة للموقع.
- نافذة "مهمة جديدة" وتفاصيل المهمة: كل القوائم بنفس الشكل.
- تجربة عربي/إنجليزي — الأيقونة والمحاذاة صح بالاتجاهين.
- تجربة موبايل: القائمة تفتح بشكل مقروء وضمن مساحة الشاشة.
