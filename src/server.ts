import "./lib/error-capture";

import {
  SELF_HOSTED_SUPABASE_PROJECT_ID,
  SELF_HOSTED_SUPABASE_PUBLISHABLE_KEY,
  SELF_HOSTED_SUPABASE_URL,
} from "./lib/backend-config";

// Pin SSR + server functions to the self-hosted backend, whatever the host injects.
try {
  process.env.SUPABASE_URL = SELF_HOSTED_SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = SELF_HOSTED_SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_PROJECT_ID = SELF_HOSTED_SUPABASE_PROJECT_ID;
} catch {
  /* read-only env in some runtimes — build-time VITE_* values still apply */
}


import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isJavaScriptAsset(pathname: string): boolean {
  return pathname.startsWith("/assets/") && pathname.endsWith(".js");
}

function staleAssetReloadResponse(): Response {
  return new Response(
    `const key = "mechatro-stale-asset-reload";
const now = Date.now();
const previous = Number(sessionStorage.getItem(key) || "0");
sessionStorage.setItem(key, String(now));
if (!previous || now - previous > 30000) {
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(now));
  const reload = () => window.location.replace(url.toString());
  if ("caches" in window) caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(reload);
  else reload();
}
await new Promise(() => {});
export {};`,
    {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0",
      },
    },
  );
}

function withSafeCacheHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url);
  if (response.status === 404 && isJavaScriptAsset(url.pathname)) {
    return staleAssetReloadResponse();
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSafeCacheHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
