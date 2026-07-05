## سبب المشكلة
الخطأ `permission denied for function is_master_admin` يظهر لأن دالة `private.is_master_admin(uuid)` مستخدمة في سياسات RLS على:
- `storage.objects` (policy: `backups_read_master_admin`)
- `share_links` (policy: `master admin manages share links`)

لكنها **لم تُمنح صلاحية EXECUTE للدور `authenticated`** — على عكس `private.is_admin` اللي أصلاً ممنوحة. عند فتح صفحة "سجل التقارير" أو أي عملية تلمس `storage.objects`، Postgres يقيّم كل سياسات SELECT على الجدول (بما فيها policy النسخ الاحتياطية) وواحدة منها تستدعي `private.is_master_admin` — فيرجع الخطأ ويوقف الاستعلام.

فحصت `pg_proc.proacl`:
```
private.is_admin        → authenticated ✅
private.is_master_admin → authenticated ❌
```

## الحل
Migration يمنح EXECUTE على `private.is_master_admin(uuid)` للأدوار `authenticated` و`service_role`:

```sql
GRANT EXECUTE ON FUNCTION private.is_master_admin(uuid) TO authenticated, service_role;
```

بعد التطبيق، سياسات storage و share_links اللي تعتمد على الدالة ستعمل بشكل صحيح، والتوست الأحمر يختفي.
