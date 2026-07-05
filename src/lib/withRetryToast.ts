import { toast } from "sonner";

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const isNetworkError = (err: unknown): boolean => {
  if (!err) return false;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? "";
  return (
    isOffline() ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("load failed")
  );
};

/**
 * Run an async operation and, if it fails due to network trouble,
 * show a friendly toast and retry once the browser reports online.
 * Returns a promise that resolves with the successful result (or the
 * final error after the retry).
 */
export async function withRetryOnReconnect<T>(
  op: () => Promise<T>,
  opts: { offlineMessage?: string; retryingMessage?: string } = {},
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const offlineMsg = opts.offlineMessage ?? "Offline — will retry when back online";
    toast.warning(offlineMsg, { duration: 6000 });
    return await new Promise<T>((resolve, reject) => {
      const onOnline = async () => {
        window.removeEventListener("online", onOnline);
        try {
          toast.info(opts.retryingMessage ?? "Retrying…", { duration: 2500 });
          resolve(await op());
        } catch (e) {
          reject(e);
        }
      };
      window.addEventListener("online", onOnline);
    });
  }
}
