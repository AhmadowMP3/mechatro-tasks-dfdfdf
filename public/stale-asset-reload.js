const key = "mechatro-stale-asset-reload";
const now = Date.now();
const previous = Number(sessionStorage.getItem(key) || "0");

sessionStorage.setItem(key, String(now));

if (!previous || now - previous > 30000) {
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(now));
  const reload = () => window.location.replace(url.toString());

  if ("caches" in window) {
    caches.keys().then((keys) => Promise.all(keys.map((cacheKey) => caches.delete(cacheKey)))).finally(reload);
  } else {
    reload();
  }
}

await new Promise(() => {});
export {};