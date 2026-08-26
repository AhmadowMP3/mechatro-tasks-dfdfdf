import { supabase } from "@/integrations/supabase/client";

export type LeaderboardRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  total_points: number | null;
  current_streak: number | null;
  longest_streak: number | null;
};

/**
 * Overall ranking of all active members, visible to every signed-in user.
 * Reads through a security-definer DB function so members can see the whole
 * board (not just their own row) without exposing private profile fields.
 */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: LeaderboardRow[] | null; error: unknown }>;
    }
  ).rpc("leaderboard");
  if (error) return [];
  return (data ?? []).map((r) => ({
    ...r,
    total_points: r.total_points ?? 0,
    current_streak: r.current_streak ?? 0,
    longest_streak: r.longest_streak ?? 0,
  }));
}
