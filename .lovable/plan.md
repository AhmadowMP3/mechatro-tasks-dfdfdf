## إصلاح شفافية نافذة التأكيد

### السبب
في `src/components/confirm-dialog.tsx` استخدمت `var(--surface)` و `var(--grad-red)` — والاثنان غير معرّفَين في `src/styles.css` (الموجود فقط `--surface-2`, `--surface-3`, `--card`, `--grad-blue`, `--grad-orange`). فطبقت المتصفح `background: transparent` وطلعت النافذة شفافة.

### التغيير
`src/components/confirm-dialog.tsx`:
- `background` للحوار: `var(--card)` بدل `var(--surface)`.
- زر الخطر: تدرّج أحمر صريح `linear-gradient(135deg,#d9484b,#a83236)` بدل `var(--grad-red, …)` (كان fallback مكتوب لكن CSS ما بيقبل تدرّج داخل fallback بهاي الطريقة موثوق).
- إضافة `backdrop-filter: blur(2px)` خفيف للمحتوى + التأكد من overlay معتم (موجود أصلاً من shadcn `bg-black/80`).
