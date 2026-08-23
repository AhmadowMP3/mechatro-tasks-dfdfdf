// This file bridges the real Supabase client with Share Mode (see
// `src/lib/share-mode.ts`). The share-mode interceptors are consulted first
// so `supabase.from(...)`, `supabase.channel(...)`, `supabase.removeChannel(...)`,
// and `supabase.auth.getUser/getSession/onAuthStateChange/signOut(...)` are
// transparently rewired for public share-link viewers. When share mode is not
// active every call passes straight through to the real client.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';
import {
  shareFromInterceptor,
  shareChannelInterceptor,
  shareRemoveChannelInterceptor,
  shareAuthInterceptor,
} from '@/lib/share-mode';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}


function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Connect Supabase in Lovable Cloud.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Wraps `auth` so getUser/getSession/onAuthStateChange/signOut can be
// intercepted by Share Mode without breaking direct property access
// (e.g. `supabase.auth.admin`, `supabase.auth.setSession`, ...).
function makeAuthProxy(target: ReturnType<typeof createSupabaseClient>['auth']) {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === 'getUser' || prop === 'getSession' || prop === 'onAuthStateChange' || prop === 'signOut') {
        const shim = shareAuthInterceptor(prop);
        if (shim) return shim;
      }
      const value = Reflect.get(t, prop, receiver);
      return typeof value === 'function' ? value.bind(t) : value;
    },
  });
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    if (prop === 'from') {
      return (table: string) => {
        const shim = shareFromInterceptor(table);
        if (shim) return shim;
        return _supabase!.from(table as never);
      };
    }
    if (prop === 'channel') {
      return (name: string, opts?: unknown) => {
        const shim = shareChannelInterceptor();
        if (shim) return shim;
        return _supabase!.channel(name, opts as never);
      };
    }
    if (prop === 'removeChannel') {
      return (ch: unknown) => {
        const shim = shareRemoveChannelInterceptor();
        if (shim) return shim;
        return _supabase!.removeChannel(ch as never);
      };
    }
    if (prop === 'auth') {
      return makeAuthProxy(_supabase!.auth);
    }
    return Reflect.get(_supabase, prop, receiver);
  },
});
