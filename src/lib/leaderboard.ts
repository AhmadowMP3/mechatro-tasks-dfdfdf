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

  if (error || !data) {
    if (error) console.error("[leaderboard] rpc failed, falling back to profiles:", error);
    // Fallback: direct profiles read (RLS may narrow this to the current user).
    const fb = await supabase
      .from("profiles")
      .select("id,full_name,avatar_url,job_title,total_points,current_streak,longest_streak")
      .order("total_points", { ascending: false });
    if (fb.error) {
      console.error("[leaderboard] profiles fallback failed:", fb.error);
      return [];
    }
    return normalize((fb.data ?? []) as unknown as LeaderboardRow[]);
  }

  return normalize(data);
}

function normalize(rows: LeaderboardRow[]): LeaderboardRow[] {
  return rows.map((r) => ({
    ...r,
    total_points: r.total_points ?? 0,
    current_streak: r.current_streak ?? 0,
    longest_streak: r.longest_streak ?? 0,
  }));
}

