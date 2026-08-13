import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/security/db";

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

  // 0. Snapshot current assignees so we can notify only newly added users.
  const before = await supabase.from("task_assignees").select("user_id").eq("task_id", taskId);
  const previous = new Set<string>((before.data ?? []).map((r) => r.user_id));

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

  // 4. Notify newly added assignees (not the actor).
  const actor = opts?.assignedBy ?? null;
  const added = ids.filter((id) => !previous.has(id) && id !== actor);
  if (added.length > 0) {
    await notifyAssignees(taskId, added, actor);
  }

  return { error: null };
}

/** Insert a "task_assigned" notification for each newly added user. */
async function notifyAssignees(taskId: string, userIds: string[], actorId: string | null) {
  const [taskR, actorR] = await Promise.all([
    supabase.from("tasks").select("title").eq("id", taskId).maybeSingle(),
    actorId ? supabase.from("profiles").select("full_name").eq("id", actorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const title = taskR.data?.title ?? "";
  const actorName = (actorR.data as { full_name?: string } | null)?.full_name ?? null;
  const bodyAr = actorName ? `${actorName} أضافك إلى: ${title}` : `تمت إضافتك إلى: ${title}`;
  const bodyEn = actorName ? `${actorName} assigned you to: ${title}` : `You were assigned to: ${title}`;
  const rows = userIds.map((uid) => ({
    user_id: uid,
    type: "task_assigned",
    title_ar: "تم تعيينك على مهمة",
    title_en: "You were assigned a task",
    body: `${bodyAr} · ${bodyEn}`,
    entity_id: taskId,
  }));
  await supabase.from("notifications").insert(rows);
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
