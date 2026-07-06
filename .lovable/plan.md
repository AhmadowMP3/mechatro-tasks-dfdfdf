
## نظام ملاحظات (Admin Notes)

نظام ملاحظات مخصص للمدير المسؤول (Master Admin) والمدراء العاديين، بتجربة شبيهة بتطبيقات الملاحظات على الهاتف (Apple Notes / Google Keep) — سريع، سلس، غني بالميزات، وبتصميم يتناسق مع باقي التطبيق.

## المسار الرئيسي

`/notes` (تحت `_authenticated`) — محمي بحيث لا يظهر إلا للمدراء (`role='admin'` أو `is_master_admin`). يظهر رابط "الملاحظات" في الشريط الجانبي للمدراء فقط.

## هيكل الواجهة (Two-Pane Layout)

```text
┌─────────────────┬─────────────────────────────────────┐
│  Sidebar (280px)│  Editor Pane                        │
│                 │                                     │
│  [+ ملاحظة جديدة]│  [Title___________________]        │
│  🔍 بحث          │  🏷️ tags   📁 folder   🎨 color     │
│                 │  ─────────────────────────────       │
│  📌 مثبتة       │  [B I U ~ H1 H2 • 1. ☑ 🖼 📎]      │
│  ├ ملاحظة 1     │                                     │
│  ├ ملاحظة 2     │  محرر Rich Text كامل...              │
│                 │                                     │
│  📁 مجلدات      │                                     │
│  ├ عمل          │                                     │
│  ├ اجتماعات     │                                     │
│                 │                                     │
│  الكل           │  ─────────────────────────           │
│  ├ ملاحظة أ     │  آخر تعديل: منذ دقيقتين              │
│  ├ ملاحظة ب     │  [🗑 حذف] [📌 تثبيت] [📄 PDF] [⋯]   │
└─────────────────┴─────────────────────────────────────┘
```

على الموبايل: عرض واحد يتبدّل بين قائمة الملاحظات والمحرر (slide transition).

## الميزات

**المحرر (Rich Text)** — باستخدام TipTap (خفيف، RTL، متوافق مع React):
- Bold, Italic, Underline, Strike
- Headings (H1, H2, H3)
- قوائم نقطية ومرقمة
- Checkboxes (task list) قابلة للنقر
- Blockquote, code inline
- روابط
- محاذاة يمين/يسار/وسط
- Undo/Redo

**التنظيم:**
- **مجلدات (Folders):** المستخدم ينشئها ويعيد تسميتها ويحذفها
- **تثبيت (Pin):** ملاحظات مهمة تظهر في الأعلى مع أيقونة 📌
- **وسوم (Tags):** متعددة لكل ملاحظة، تعرض كـ pills ملوّنة
- **لون خلفية:** 6 ألوان جاهزة (أصفر، وردي، أزرق، أخضر، برتقالي، أرجواني) + رمادي/أبيض افتراضي

**البحث والفلترة:**
- بحث فوري (debounced) بالعنوان + المحتوى النصي
- فلتر حسب المجلد / الوسم / اللون
- ترتيب: آخر تعديل (افتراضي) / تاريخ الإنشاء / أبجدي

**المشاركة:**
- كل ملاحظة خاصة بمنشئها افتراضياً
- زر "مشاركة" يفتح modal لاختيار مدراء محددين أو "جميع المدراء"
- الشخص المشارك معه يرى الملاحظة للقراءة فقط (لا يعدّل)
- شارة "مشاركة معي" على الملاحظات المستلمة

**المرفقات:**
- رفع صور ومستندات (PDF/DOCX/…) في bucket جديد `note-attachments`
- الصور تُدرج inline في المحرر
- المرفقات الأخرى تظهر كبطاقات ملفات قابلة للتحميل

**تجربة الاستخدام:**
- **حفظ تلقائي** كل ~1.5 ثانية بعد التوقف عن الكتابة (Debounced autosave)
- عدّاد كلمات/أحرف في الأسفل
- اختصارات لوحة مفاتيح (Ctrl+N جديد، Ctrl+S حفظ فوري، Ctrl+F بحث، Ctrl+K لوحة أوامر)
- Empty state جميل عند عدم وجود ملاحظات
- Skeleton loading

**تصدير PDF (Branded):**
- زر "📄 تصدير PDF" في شريط الأدوات
- يستخدم نفس نظام العلامة التجارية الموجود (`html2canvas + jsPDF` من `pdf-export.ts` و `BrandedDocuments.tsx`)
- الـ PDF يتضمن:
  - Header بتدرج `--grad-blue` مع لوغو Mechatro
  - عنوان الملاحظة
  - meta: الكاتب، التاريخ، الوسوم، المجلد
  - المحتوى بالكامل مع الحفاظ على التنسيق (bold, headings, lists, checkboxes, صور inline)
  - Footer بالتاريخ ورقم الصفحة
  - خط Almarai للعربي + Montserrat للإنكليزي
- تصدير ملاحظة واحدة في كل مرة (كما اخترت)

## قاعدة البيانات

**جدول `notes`:**
- `id`, `owner_id` → `profiles.id`
- `title` (text)
- `content_html` (text) — HTML الناتج من TipTap
- `content_text` (text) — نسخة plain للبحث
- `folder_id` (uuid, nullable)
- `color` (text: default/yellow/pink/blue/green/orange/purple)
- `is_pinned` (bool)
- `created_at`, `updated_at`

**جدول `note_folders`:**
- `id`, `owner_id`, `name`, `color`, `sort_order`, `created_at`

**جدول `note_tags`:** (tags خاصة بكل مدير)
- `id`, `owner_id`, `name`, `color`

**جدول `note_tag_links`:** (many-to-many)
- `note_id`, `tag_id`

**جدول `note_shares`:**
- `note_id`, `shared_with_user_id`, `created_at`
- (لا وجود لهذا الصف = خاصة)

**جدول `note_attachments`:**
- `id`, `note_id`, `file_path`, `file_name`, `mime_type`, `size`, `created_at`

**Storage bucket:** `note-attachments` (private) + RLS.

**RLS Policies (باختصار):**
- `notes`: المالك يرى/يعدّل ملاحظاته + المشارك معه يرى فقط. الإنشاء مقيّد للمدراء عبر `has_role(auth.uid(),'admin')` أو `is_master_admin`.
- المجلدات والوسوم: خاصة بالمالك بالكامل.
- المرفقات: المالك يديرها، المشارك معه يقرأ فقط.
- Storage: مسار `{owner_id}/{note_id}/…` مع policy تتحقق من العلاقة بالجدول.
- GRANT `SELECT, INSERT, UPDATE, DELETE` للـ `authenticated` و `ALL` للـ `service_role`.

## الملفات الجديدة

- `src/routes/_authenticated/notes.tsx` — layout ثنائي مع sidebar وeditor
- `src/routes/_authenticated/notes.$id.tsx` — عرض/تحرير ملاحظة (nested)
- `src/routes/_authenticated/notes.index.tsx` — الحالة الافتراضية (empty state)
- `src/components/notes/NotesSidebar.tsx` — قائمة الملاحظات + بحث + مجلدات
- `src/components/notes/NoteEditor.tsx` — محرر TipTap + toolbar
- `src/components/notes/NoteToolbar.tsx` — أزرار التنسيق
- `src/components/notes/FolderManager.tsx` — إدارة المجلدات
- `src/components/notes/TagPicker.tsx` — اختيار/إنشاء وسوم
- `src/components/notes/ColorPicker.tsx` — 6 ألوان
- `src/components/notes/ShareNoteModal.tsx` — مشاركة مع مدراء
- `src/components/notes/NotePdfDocument.tsx` — قالب PDF مبرَند (يعاد استخدام نمط `BrandedDocuments`)
- `src/lib/notes.ts` — types + helpers + query functions
- `src/lib/notes-pdf.ts` — دالة `exportNoteToPdf(note)` تستخدم `renderAndDownloadPdf`

## الملفات المعدَّلة

- `src/components/layout/Sidebar.tsx` — إضافة رابط "الملاحظات" للمدراء
- `src/components/layout/MobileTabBar.tsx` — إضافة الأيقونة (اختياري)
- `src/i18n/dict.ts` — مفاتيح جديدة (notes, newNote, folder, pin, share, exportPdf, colors, tags, searchNotes, لا ملاحظات، إلخ)
- `src/routeTree.gen.ts` — يُحدَّث تلقائياً

## الحزم الجديدة

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-text-align`, `@tiptap/extension-placeholder`

## ترتيب التنفيذ

1. **Migration:** جميع الجداول + RLS + GRANTs + bucket + policies تخزين
2. **الأنواع والـ helpers:** `src/lib/notes.ts`
3. **الواجهة الأساسية:** الـ layout + sidebar + list
4. **المحرر:** TipTap + toolbar + autosave
5. **المجلدات والوسوم والألوان**
6. **البحث والفلترة**
7. **المرفقات (رفع صور + ملفات)**
8. **المشاركة (modal + عرض المستلمة)**
9. **تصدير PDF المبرَند**
10. **رابط الشريط الجانبي + التحقق من الصلاحيات + i18n**

هل تريد أي تعديل قبل ما نبدأ التنفيذ؟ (مثلاً: نستخدم Lexical أو ProseMirror بدل TipTap، أو ما نحتاج المرفقات، أو نضيف تصدير PDF لعدة ملاحظات مختارة أيضاً؟)
