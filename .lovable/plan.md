## استبدال رسائل التأكيد المتصفحية برسائل popup بتصميم الموقع

### الفكرة
نبني مكوّن `ConfirmProvider` عام + hook `useConfirm()` بيرجّع دالة `confirm(options): Promise<boolean>`، مبني فوق `AlertDialog` من shadcn ومنسّق بستايل الموقع (`brand-card`, `--grad-*`) — عربي/إنجليزي حسب اللغة الحالية.

### الملفات

**1. جديد: `src/components/confirm-dialog.tsx`**
- `ConfirmProvider` يلفّ التطبيق ويحتفظ بحالة الحوار الحالي.
- `useConfirm()` يرجّع دالة `confirm({ title?, message, confirmText?, cancelText?, danger? }) => Promise<boolean>`.
- استخدام `AlertDialog` مع كلاسات الموقع + دعم RTL/lang. زر التأكيد يستخدم `--grad-red` عند `danger: true`، وإلا `--grad-blue`.

**2. `src/routes/__root.tsx` (أو أعلى مزوّد موجود)**
- تغليف الشجرة بـ `<ConfirmProvider>` بجانب `<Toaster />`.

**3. استبدال جميع `confirm(...)` بـ `await confirm(...)`**
- `src/routes/_authenticated/settings.tsx` — حذف نسخة احتياطية.
- `src/routes/_authenticated/team.index.tsx` — حذف عضو.
- `src/routes/_authenticated/share-links.tsx` — تعطيل/حذف رابط (رسالتان).
- `src/routes/_authenticated/access-control.tsx` — حذف مستخدم، إلغاء دعوة.
- `src/routes/_authenticated/references.tsx` — حذف مرجع.
- `src/routes/_authenticated/league.tsx` — حذف موسم (+ ترجمة للعربية).
- `src/lib/bulk-selection.tsx` — استبدال `window.confirm(a.confirm)` باستدعاء الـ hook.

كل مكان يستخدم `const confirm = useConfirm();` بدل الدالة العامة، مع تعليم الأزرار الخطرة `danger: true`.

### مفاتيح i18n جديدة
- `confirmDefaultTitle`: "تأكيد" / "Confirm"
- `cancel` (موجود على الأرجح — نتحقق)، `confirm`
- ترجمة رسالة "Delete season?" و "Revoke this link?" و "Delete permanently?" لمفاتيح i18n منظمة.

### التحقق
بعد التنفيذ، فحص عبر `rg "\bconfirm\(" src` للتأكد ما ضل ولا استدعاء للـ `window.confirm`.
