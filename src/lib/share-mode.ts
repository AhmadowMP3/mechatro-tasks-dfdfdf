// Share Mode
// -----------------------------------------------------------------------------
// Global state that turns the entire app into a public read-only viewer for a
// given share link. `src/integrations/supabase/client.ts` consults the
// interceptors below so every `supabase.from(...)`, `supabase.channel(...)`,
// and `supabase.auth.getUser/getSession(...)` call transparently routes
// through the share-access edge function without touching the authenticated
// pages themselves.

export type ShareBootstrap = {
  viewerId: string;
  fullName: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: "admin" | "manager" | "member" | "viewer";
    active: boolean;
    is_master_admin: boolean;
    status: "pending" | "active" | "suspended";
    job_title?: string | null;
  }[];
  directory: { id: string; full_name: string; avatar_url: string | null }[];
};

export type ShareLinkMeta = {
  label: string;
  allowed_pages: string[];
  expires_at: string | null;
};

type ShareState = {
  token: string;
  password: string | null;
  link: ShareLinkMeta;
  bootstrap: ShareBootstrap;
  functionUrl: string;
};

const STORAGE_KEY = "mechatro.share.state";
let STATE: ShareState | null = null;

// Hydrate synchronously from sessionStorage so guards like
// `_authenticated/route.tsx#beforeLoad` see share mode immediately after a
// full-page redirect from the share landing route.
if (typeof window !== "undefined") {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) STATE = JSON.parse(raw) as ShareState;
  } catch { /* ignore */ }
}

// ---------- Lifecycle ----------
export function enterShareMode(input: ShareState): void {
  STATE = input;
  if (typeof window !== "undefined") {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(input)); } catch { /* ignore */ }
    (window as unknown as { __mechatroShare?: ShareState }).__mechatroShare = STATE;
  }
}
export function leaveShareMode(): void {
  STATE = null;
  if (typeof window !== "undefined") {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    delete (window as unknown as { __mechatroShare?: ShareState }).__mechatroShare;
  }
}
export function isShareMode(): boolean { return STATE !== null; }
export function getShareLink(): ShareLinkMeta | null { return STATE?.link ?? null; }
export function getShareBootstrap(): ShareBootstrap | null { return STATE?.bootstrap ?? null; }
export function getShareToken(): string | null { return STATE?.token ?? null; }

const PAGE_TO_PATH: Record<string, string> = {
  dashboard: "/", projects: "/projects", tasks: "/tasks", team: "/team",
  league: "/league", references: "/references", activity: "/activity",
};
const PATH_TO_PAGE: Record<string, string> = {
  "": "dashboard", "/": "dashboard", "projects": "projects", "tasks": "tasks",
  "team": "team", "league": "league", "references": "references", "activity": "activity",
};

export function isPageAllowed(page: string): boolean {
  if (!STATE) return true;
  return STATE.link.allowed_pages.includes(page);
}
export function isPathAllowed(pathname: string): boolean {
  if (!STATE) return true;
  const first = pathname.replace(/^\//, "").split("/")[0];
  const key = PATH_TO_PAGE[first] ?? first;
  return STATE.link.allowed_pages.includes(key);
}
export function shareAllowedPaths(): { key: string; path: string }[] {
  if (!STATE) return [];
  return STATE.link.allowed_pages
    .map((k) => ({ key: k, path: PAGE_TO_PATH[k] }))
    .filter((x) => !!x.path);
}
export function firstAllowedPath(): string {
  const list = shareAllowedPaths();
  return list[0]?.path ?? "/";
}

// ---------- Edge-function transport ----------
async function callShareFn(payload: Record<string, unknown>): Promise<unknown> {
  if (!STATE) throw new Error("share mode not active");
  const res = await fetch(STATE.functionUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, token: STATE.token, password: STATE.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ---------- Query plan (mirrors PostgREST filter chain) ----------
type FilterOp =
  | { kind: "eq" | "neq" | "gte" | "gt" | "lte" | "lt" | "like" | "ilike" | "is"; col: string; val: unknown }
  | { kind: "in"; col: string; val: unknown[] }
  | { kind: "not"; col: string; op: string; val: unknown };

type QueryPlan = {
  table: string;
  select: string;
  filters: FilterOp[];
  order: { column: string; ascending: boolean }[];
  range: [number, number] | null;
  limit: number | null;
  mode: "array" | "single" | "maybeSingle";
};

function newPlan(table: string): QueryPlan {
  return { table, select: "*", filters: [], order: [], range: null, limit: null, mode: "array" };
}

async function runPlan(plan: QueryPlan): Promise<{ data: unknown; error: null | { message: string }; count: null }> {
  try {
    const res = (await callShareFn({ action: "query", plan })) as { data: unknown };
    return { data: res.data ?? null, error: null, count: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message }, count: null };
  }
}

function makeReadBuilder(plan: QueryPlan): unknown {
  const b: Record<string, unknown> = {};
  b.select = (sel?: string) => { plan.select = sel || "*"; return b; };
  b.eq   = (c: string, v: unknown) => { plan.filters.push({ kind: "eq", col: c, val: v }); return b; };
  b.neq  = (c: string, v: unknown) => { plan.filters.push({ kind: "neq", col: c, val: v }); return b; };
  b.gte  = (c: string, v: unknown) => { plan.filters.push({ kind: "gte", col: c, val: v }); return b; };
  b.gt   = (c: string, v: unknown) => { plan.filters.push({ kind: "gt", col: c, val: v }); return b; };
  b.lte  = (c: string, v: unknown) => { plan.filters.push({ kind: "lte", col: c, val: v }); return b; };
  b.lt   = (c: string, v: unknown) => { plan.filters.push({ kind: "lt", col: c, val: v }); return b; };
  b.like = (c: string, v: unknown) => { plan.filters.push({ kind: "like", col: c, val: v }); return b; };
  b.ilike= (c: string, v: unknown) => { plan.filters.push({ kind: "ilike", col: c, val: v }); return b; };
  b.is   = (c: string, v: unknown) => { plan.filters.push({ kind: "is", col: c, val: v }); return b; };
  b.in   = (c: string, v: unknown[]) => { plan.filters.push({ kind: "in", col: c, val: v }); return b; };
  b.not  = (c: string, op: string, v: unknown) => { plan.filters.push({ kind: "not", col: c, op, val: v }); return b; };
  b.or   = () => b;
  b.match = () => b;
  b.order = (c: string, o?: { ascending?: boolean }) => {
    plan.order.push({ column: c, ascending: o?.ascending !== false }); return b;
  };
  b.range = (from: number, to: number) => { plan.range = [from, to]; return b; };
  b.limit = (n: number) => { plan.limit = n; return b; };
  b.abortSignal = () => b;
  b.single = () => { plan.mode = "single"; return b; };
  b.maybeSingle = () => { plan.mode = "maybeSingle"; return b; };
  b.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => runPlan(plan).then(onOk, onErr);
  b.catch = (onErr: (e: unknown) => unknown) => runPlan(plan).catch(onErr);
  b.finally = (cb: () => void) => runPlan(plan).finally(cb);
  return b;
}
function makeWriteBuilder(): unknown {
  const noop = { data: null, error: null, count: null };
  const b: Record<string, unknown> = {};
  ["select","eq","neq","in","is","gte","gt","lte","lt","match","single","maybeSingle","order","limit","abortSignal","not","or"].forEach((k) => { b[k] = () => b; });
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(noop).then(ok);
  b.catch = (err: (e: unknown) => unknown) => Promise.resolve(noop).catch(err);
  b.finally = (cb: () => void) => Promise.resolve(noop).finally(cb);
  return b;
}

// ---------- Interceptors ----------
export function shareFromInterceptor(table: string): unknown | null {
  if (!STATE) return null;
  return {
    select(sel?: string) { const p = newPlan(table); p.select = sel || "*"; return makeReadBuilder(p); },
    insert() { return makeWriteBuilder(); },
    update() { return makeWriteBuilder(); },
    delete() { return makeWriteBuilder(); },
    upsert() { return makeWriteBuilder(); },
  };
}
export function shareChannelInterceptor(): unknown | null {
  if (!STATE) return null;
  const ch = {
    on() { return ch; },
    subscribe() { return ch; },
    unsubscribe() { return Promise.resolve("ok"); },
  };
  return ch;
}
export function shareRemoveChannelInterceptor(): unknown | null {
  if (!STATE) return null;
  return Promise.resolve("ok");
}
export function shareAuthInterceptor(method: "getUser" | "getSession" | "onAuthStateChange" | "signOut"): unknown | null {
  if (!STATE) return null;
  const user = {
    id: STATE.bootstrap.viewerId,
    email: `share-${STATE.token.slice(0, 8)}@share.local`,
    user_metadata: { full_name: STATE.bootstrap.fullName },
    app_metadata: {},
  };
  if (method === "getUser") return () => Promise.resolve({ data: { user }, error: null });
  if (method === "getSession") return () => Promise.resolve({
    data: { session: { user, access_token: "share-viewer", refresh_token: "share-viewer", expires_at: 0, expires_in: 0, token_type: "bearer" } },
    error: null,
  });
  if (method === "onAuthStateChange") return () => ({ data: { subscription: { unsubscribe() { /* noop */ } } } });
  if (method === "signOut") return () => Promise.resolve({ error: null });
  return null;
}
