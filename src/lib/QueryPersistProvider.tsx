import { useEffect, useState, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const CACHE_KEY = "mechatro-cache-v1";
const BUSTER = "v1"; // bump to invalidate persisted cache on schema changes

export function QueryPersistProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  // Only enable persistence on the client — SSR has no localStorage.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready || typeof window === "undefined") {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: CACHE_KEY,
    throttleTime: 1000,
  });

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24h
        buster: BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
