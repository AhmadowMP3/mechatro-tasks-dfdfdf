import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to task-related Postgres changes and invoke `onChange` on any
 * insert/update/delete on tasks, task_assignees, task_files, task_comments,
 * or projects. Tears the channel down on unmount.
 */
export function useTasksRealtime(onChange: () => void, channelName = "tasks-rt") {
  useEffect(() => {
    const ch = supabase
      .channel(channelName + "-" + Math.random().toString(36).slice(2, 8))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_files" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, onChange)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);
}
