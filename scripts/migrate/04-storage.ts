/**
 * Mirror every storage bucket + file from the current backend to the target
 * Supabase (self-hosted). Both sides are accessed with their service keys.
 *
 * Usage:
 *   SOURCE_URL=... SOURCE_SERVICE_KEY=... \
 *   TARGET_URL=... TARGET_SERVICE_KEY=... bun scripts/migrate/04-storage.ts
 */
const SOURCE_URL = process.env.SOURCE_URL!;
const SOURCE_KEY = process.env.SOURCE_SERVICE_KEY!;
const TARGET_URL = process.env.TARGET_URL!;
const TARGET_KEY = process.env.TARGET_SERVICE_KEY!;

if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
  throw new Error("set SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL, TARGET_SERVICE_KEY");
}

const h = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` });

type Bucket = { id: string; name: string; public: boolean; file_size_limit: number | null };
type Entry = { name: string; id: string | null };

async function listBuckets(url: string, key: string): Promise<Bucket[]> {
  const r = await fetch(`${url}/storage/v1/bucket`, { headers: h(key) });
  if (!r.ok) throw new Error(`list buckets ${r.status}: ${await r.text()}`);
  return r.json();
}

async function listFiles(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${SOURCE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...h(SOURCE_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`list ${bucket}/${prefix} ${r.status}: ${await r.text()}`);
    const page: Entry[] = await r.json();
    if (page.length === 0) break;
    for (const e of page) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listFiles(bucket, path)));
      else out.push(path);
    }
    if (page.length < 100) break;
    offset += 100;
  }
  return out;
}

const sourceBuckets = await listBuckets(SOURCE_URL, SOURCE_KEY);
const targetBuckets = new Set((await listBuckets(TARGET_URL, TARGET_KEY)).map((b) => b.id));

for (const b of sourceBuckets) {
  if (!targetBuckets.has(b.id)) {
    const r = await fetch(`${TARGET_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...h(TARGET_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit }),
    });
    console.log(`bucket ${b.id}: ${r.ok ? "created" : `FAILED ${await r.text()}`}`);
  } else {
    console.log(`bucket ${b.id}: exists`);
  }

  const files = await listFiles(b.id, "");
  let ok = 0;
  let bad = 0;

  for (let i = 0; i < files.length; i += 5) {
    await Promise.all(
      files.slice(i, i + 5).map(async (path) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const dl = await fetch(`${SOURCE_URL}/storage/v1/object/${b.id}/${encodeURI(path)}`, {
              headers: h(SOURCE_KEY),
            });
            if (!dl.ok) throw new Error(`download ${dl.status}`);
            const body = await dl.arrayBuffer();
            const up = await fetch(`${TARGET_URL}/storage/v1/object/${b.id}/${encodeURI(path)}`, {
              method: "POST",
              headers: {
                ...h(TARGET_KEY),
                "Content-Type": dl.headers.get("content-type") || "application/octet-stream",
                "x-upsert": "true",
              },
              body,
            });
            if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
            ok++;
            return;
          } catch (err) {
            if (attempt === 2) {
              bad++;
              console.log(`  FAILED ${b.id}/${path}: ${(err as Error).message}`);
            }
          }
        }
      }),
    );
  }
  console.log(`  ${b.id}: ${ok}/${files.length} copied${bad ? `, ${bad} failed` : ""}`);
}
