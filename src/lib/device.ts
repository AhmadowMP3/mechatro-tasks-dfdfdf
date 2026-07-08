// Device-slot enforcement client.
// Uses a stable per-browser UUID stored in localStorage as the device id.
// Calls the `claim-device-slot` edge function on sign-in and periodically,
// and subscribes to realtime updates on the user's user_sessions row so a
// kicked device is signed out immediately.
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "mechatro.device_id";
const HEARTBEAT_MS = 5 * 60 * 1000;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

export type ClaimResult = { ok: boolean; kicked: boolean; max_devices: number };

export async function claimDeviceSlot(): Promise<ClaimResult | null> {
  try {
    const device_id = getDeviceId();
    const user_agent = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const { data, error } = await supabase.functions.invoke("claim-device-slot", {
      body: { device_id, user_agent },
    });
    if (error) return null;
    return data as ClaimResult;
  } catch {
    return null;
  }
}

type Controller = {
  stop: () => void;
};

let current: Controller | null = null;

export function startDeviceEnforcement(
  userId: string,
  onKicked: () => void,
): Controller {
  stopDeviceEnforcement();

  const device_id = getDeviceId();
  let cancelled = false;

  async function tick() {
    if (cancelled) return;
    const res = await claimDeviceSlot();
    if (res?.kicked && !cancelled) {
      cancelled = true;
      onKicked();
    }
  }
  void tick();
  const heartbeat = window.setInterval(() => { void tick(); }, HEARTBEAT_MS);

  // Realtime: fire the moment our row is revoked on any device.
  const channel = supabase
    .channel(`user-sessions-${userId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "user_sessions", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { device_id: string; revoked_at: string | null };
        if (row?.device_id === device_id && row.revoked_at && !cancelled) {
          cancelled = true;
          onKicked();
        }
      },
    )
    .subscribe();

  current = {
    stop: () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      void supabase.removeChannel(channel);
    },
  };
  return current;
}

export function stopDeviceEnforcement() {
  if (current) {
    current.stop();
    current = null;
  }
}
