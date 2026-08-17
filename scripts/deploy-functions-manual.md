# نشر Edge Functions على Supabase self-hosted (Coolify)

## الطريقة المعتمدة — rsync + docker cp

من مجلد المشروع على جهازك:

```bash
chmod +x scripts/deploy-edge-functions.sh
./scripts/deploy-edge-functions.sh
```

السكربت بيعمل:

1. رفع الملفات:
   ```bash
   rsync -avz --exclude 'main' supabase/functions/ deploy@179.198.193.155:/tmp/fn/
   ```
2. الدخول عبر SSH، إيجاد كونتينر الـfunctions تلقائياً (`functions` أو `edge-runtime`)،
   نسخ كل دالة إلى `/home/deno/functions/<name>` جوّا الكونتينر، وبعدين `docker restart`.

### متغيرات اختيارية

```bash
SSH_TARGET=deploy@179.198.193.155 \
FUNCTIONS_CONTAINER=supabase-edge-functions-xxxx \
REMOTE_FUNCTIONS_DIR=/home/deno/functions \
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
curl -i -X OPTIONS https://supamecha.hub4tech.net/functions/v1/admin-users
```

لازم يرجع 200 مع هيدرز CORS.

## الدوال الستّة

`admin-users` · `admin-invites` · `backup-snapshot` · `claim-device-slot` · `redeem-invite` · `share-access`
