import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Persist the full set of assignees for a task.
 * - Writes the earliest user id as the primary `tasks.assignee_id` (kept for
 *   points, notifications, and existing filters/reports).
 * - Deletes join rows no longer selected.
 * - Upserts the rest into `task_assignees`.
 */
export async function saveTaskAssignees(
  taskId: string,
  userIds: string[],
  opts?: { assignedBy?: string | null },
): Promise<{ error: { message: string } | null }> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const primary = ids[0] ?? null;

  // 1. Primary on tasks row.
  const upd = await supabase.from("tasks").update({ assignee_id: primary }).eq("id", taskId);
  if (upd.error) return { error: upd.error };

  // 2. Delete rows not in the new set.
  if (ids.length === 0) {
    const del = await supabase.from("task_assignees").delete().eq("task_id", taskId);
    if (del.error) return { error: del.error };
    return { error: null };
  }

  const del = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .not("user_id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
  if (del.error) return { error: del.error };

  // 3. Upsert current set.
  const rows = ids.map((user_id) => ({
    task_id: taskId,
    user_id,
    assigned_by: opts?.assignedBy ?? null,
  }));
  const ins = await supabase
    .from("task_assignees")
    .upsert(rows, { onConflict: "task_id,user_id", ignoreDuplicates: true });
  if (ins.error) return { error: ins.error };

  return { error: null };
}

/**
 * Load all assignees for a batch of tasks. Returns Map<taskId, userIds[]>.
 * Falls back to empty map on error.
 */
export function useTaskAssigneesMap(taskIds: string[]) {
  // Stable key: sorted ids joined.
  const key = [...taskIds].sort().join(",");
  return useQuery({
    queryKey: ["task-assignees-map", key],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_assignees")
        .select("task_id,user_id,assigned_at")
        .in("task_id", taskIds)
        .order("assigned_at", { ascending: true });
      if (error) return new Map<string, string[]>();
      const map = new Map<string, string[]>();
      for (const row of data ?? []) {
        const arr = map.get(row.task_id) ?? [];
        arr.push(row.user_id);
        map.set(row.task_id, arr);
      }
      return map;
    },
  });
}

/** Load assignees for a single task (used by the detail modal). */
export function useTaskAssignees(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ["task-assignees", taskId ?? ""],
    enabled: !!taskId,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_assignees")
        .select("user_id,assigned_at")
        .eq("task_id", taskId!)
        .order("assigned_at", { ascending: true });
      return (data ?? []).map((r) => r.user_id);
    },
  });
}

export type BulkAssigneeMode = "add" | "replace" | "remove";

/**
 * Update assignees across many tasks at once.
 * - add: union current ∪ userIds
 * - replace: overwrite current with userIds
 * - remove: current \ userIds
 * Returns per-task success/failure.
 */
export async function bulkUpdateAssignees(
  taskIds: string[],
  userIds: string[],
  mode: BulkAssigneeMode,
  opts?: { assignedBy?: string | null },
): Promise<{ ok: string[]; failed: { taskId: string; message: string }[] }> {
  const ok: string[] = [];
  const failed: { taskId: string; message: string }[] = [];
  if (taskIds.length === 0) return { ok, failed };

  // Load current assignees for all target tasks in one query.
  const current = new Map<string, string[]>();
  const { data, error } = await supabase
    .from("task_assignees")
    .select("task_id,user_id,assigned_at")
    .in("task_id", taskIds)
    .order("assigned_at", { ascending: true });
  if (error) {
    return { ok, failed: taskIds.map((taskId) => ({ taskId, message: error.message })) };
  }
  for (const row of data ?? []) {
    const arr = current.get(row.task_id) ?? [];
    arr.push(row.user_id);
    current.set(row.task_id, arr);
  }

  const clean = Array.from(new Set(userIds.filter(Boolean)));
  const results = await Promise.allSettled(
    taskIds.map(async (taskId) => {
      const existing = current.get(taskId) ?? [];
      let next: string[];
      if (mode === "replace") next = clean;
      else if (mode === "add") next = Array.from(new Set([...existing, ...clean]));
      else next = existing.filter((id) => !clean.includes(id));
      const { error } = await saveTaskAssignees(taskId, next, opts);
      if (error) throw new Error(error.message);
      return taskId;
    }),
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push(taskIds[i]);
    else failed.push({ taskId: taskIds[i], message: (r.reason as Error).message });
  });
  return { ok, failed };
}
