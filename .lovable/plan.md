## المشكلة
html2canvas يرسم النص حرف حرف بدون Arabic shaping engine، فحروف "إجمالي المهام" تطلع منفصلة "إج مل ال مه ما م". هذي مشكلة معروفة في html2canvas.

## الحل
تفعيل `foreignObjectRendering: true` في `renderSectionToCanvas` بدل `false` الحالي (سطر 122 في `src/lib/report/generator.ts`). هذا الوضع يستخدم SVG `<foreignObject>` اللي يخلي المتصفح نفسه يرسم النص، فيحافظ على ربط الحروف العربية بالكامل.

### مخاطر ومعالجة
- `foreignObjectRendering` قد يفشل تحميل الصور cross-origin. الحل: نحن أصلاً نحوّل الشعار إلى data URL (`inlineLogo`)، والـ SVG charts inline بالكامل، فما في تبعية على شبكة داخل الـ foreignObject.
- بعض المتصفحات القديمة ما تدعمها بشكل ممتاز. Chrome/Edge/Safari الحديث يدعمها.
- إذا فشل الرندر نضيف fallback بسيط: نجرب `foreignObjectRendering: true` أولاً، وإذا رمى خطأ نعيد المحاولة بـ `false`.

## الملفات المعدَّلة
- `src/lib/report/generator.ts` فقط — تغيير خيار واحد في `html2canvas()` مع try/catch fallback.
