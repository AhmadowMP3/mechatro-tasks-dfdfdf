# نشر Edge Functions على Supabase self-hosted (Coolify)

## الطريقة المعتمدة — rsync + docker cp

من مجلد المشروع على جهازك:

```bash
chmod +x scripts/deploy-edge-functions.sh
GOOGLE_OAUTH_CLIENT_ID=xxx \
GOOGLE_OAUTH_CLIENT_SECRET=yyy \
./scripts/deploy-edge-functions.sh
```

السكربت بيعمل:

1. رفع الملفات:
    ```bash
    rsync -avz --exclude 'main' supabase/functions/ deploy@179.198.193.155:/tmp/fn/
    ```
2. كتابة الأسرار المحليّة إلى ملف `.env` داخل مجلد الدالة `backup-snapshot` على السيرفر.
3. الدخول عبر SSH، إيجاد كونتينر الـfunctions تلقائياً (`functions` أو `edge-runtime`)،
    نسخ كل دالة إلى `/home/deno/functions/<name>` جوّا الكونتينر، وبعدين `docker restart`.

> ملاحظة: الأسرار المطلوبة للنسخ إلى Google Drive (`GOOGLE_OAUTH_CLIENT_ID` و `GOOGLE_OAUTH_CLIENT_SECRET`) يجب أن تكون متوفّرة في بيئة دالة `backup-snapshot`. السكربت يحقنها تلقائياً إذا مرّرتها كمتغيرات بيئة محليّة. إذا كانت مضبوطة مسبقاً في Coolify كـ container env vars، فالدالة ستستخدمها بدون تعديل.

### متغيرات اختيارية

```bash
SSH_TARGET=deploy@179.198.193.155 \
FUNCTIONS_CONTAINER=supabase-edge-functions-xxxx \
REMOTE_FUNCTIONS_DIR=/home/deno/functions \
GOOGLE_OAUTH_CLIENT_ID=xxx \
GOOGLE_OAUTH_CLIENT_SECRET=yyy \
./scripts/deploy-edge-functions.sh
```

## يدوياً خطوة بخطوة

```bash
# 1) الرفع
rsync -avz --exclude 'main' supabase/functions/ deploy@179.198.193.155:/tmp/fn/

# 2) على السيرفر
ssh deploy@179.198.193.155
docker ps | grep -Ei 'functions|edge-runtime'      # خذ اسم الكونتينر
C=<container-name>
for d in /tmp/fn/*/; do
  fn=$(basename "$d")
  docker exec "$C" mkdir -p /home/deno/functions/$fn
  docker cp "$d." "$C:/home/deno/functions/$fn"
done
docker restart "$C"
```

إذا كان مجلد الـfunctions مربوط بـvolume على المضيف (شائع بـCoolify)، فينك تنسخ مباشرة:

```bash
docker inspect "$C" --format '{{ range .Mounts }}{{ .Source }} -> {{ .Destination }}{{"\n"}}{{ end }}'
sudo cp -r /tmp/fn/* /path/on/host/functions/
docker restart "$C"
```

## التحقق

```bash
curl -i -X OPTIONS https://supabase.mechatro-sy.com/functions/v1/admin-users
```

لازم يرجع 200 مع هيدرز CORS.

للتأكد من أن أسرار Google OAuth وصلت للدالة:

```bash
curl -s -X POST https://supabase.mechatro-sy.com/functions/v1/backup-snapshot \
  -H "Authorization: Bearer <service-role-key>" \
  -H "apikey: <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"drive_status":true}' | jq '.oauth_available'
```

## الدوال الستّة

`admin-users` · `admin-invites` · `backup-snapshot` · `claim-device-slot` · `redeem-invite` · `share-access`
