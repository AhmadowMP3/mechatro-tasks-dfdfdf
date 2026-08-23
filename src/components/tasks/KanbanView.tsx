import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/security/db";
import { useApp, type Profile } from "@/lib/app-context";
import { STATUS_STYLES, PROJECT_COLORS } from "@/lib/ui-tokens";
import { AssigneeNames } from "@/components/AssigneeNames";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { formatDate, isOverdue, toLocalDigits } from "@/lib/format";

import type { TaskRow } from "@/components/TaskCard";

type Project = { id: string; name_ar: string; name_en: string; color: string };
const COLUMNS = ["todo", "in_progress", "paused", "in_review", "done"] as const;
type ColStatus = (typeof COLUMNS)[number];

function isColumnId(id: string): id is ColStatus {
  return (COLUMNS as readonly string[]).includes(id);
}

export function KanbanView({
  tasks, projects, users, assigneesByTask, onOpen, onChanged,
}: {
  tasks: TaskRow[];
  projects: Project[];
  users: Profile[];
  assigneesByTask?: Record<string, string[]>;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {

  const { t, lang, isAdmin, user } = useApp();

  // Local sort/status overlay so drags feel instant while Supabase catches up.
  const [override, setOverride] = useState<Record<string, { status: ColStatus; sort_order: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeCol, setActiveCol] = useState<ColStatus>("todo");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Track which column is centered on mobile.
  useEffect(() => {
    if (!isMobile) return;
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        const center = box.left + box.width / 2;
        let best: ColStatus = activeCol;
        let bestD = Infinity;
        for (const c of COLUMNS) {
          const node = colRefs.current[c];
          if (!node) continue;
          const r = node.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - center);
          if (d < bestD) { bestD = d; best = c; }
        }
        setActiveCol((cur) => (cur === best ? cur : best));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [isMobile, activeCol]);

  const goToCol = useCallback((c: ColStatus) => {
    const node = colRefs.current[c];
    node?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveCol(c);
  }, []);

  function canMove(task: TaskRow | undefined, target: ColStatus): boolean {
    if (!task) return false;
    if (isAdmin) return true;
    if (task.assignee_id !== user?.id) return false;
    if (target === "done") return false;
    return true;
  }

  // Build columns from tasks + overrides, sorted by sort_order.
  const columns = useMemo(() => {
    const byCol: Record<ColStatus, TaskRow[]> = {
      todo: [], in_progress: [], paused: [], in_review: [], done: [],
    };
    for (const raw of tasks) {
      const ov = override[raw.id];
      const merged: TaskRow = ov
        ? { ...raw, status: ov.status, sort_order: ov.sort_order }
        : raw;
      const col = (merged.status as ColStatus);
      if (byCol[col]) byCol[col].push(merged);
    }
    for (const c of COLUMNS) {
      byCol[c].sort((a, b) => {
        const ao = a.sort_order ?? Number.POSITIVE_INFINITY;
        const bo = b.sort_order ?? Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return (a.id < b.id ? -1 : 1);
      });
    }
    return byCol;
  }, [tasks, override]);

  const findContainer = (id: string): ColStatus | null => {
    if (isColumnId(id)) return id;
    for (const c of COLUMNS) if (columns[c].some((x) => x.id === id)) return c;
    return null;
  };

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const activeIdStr = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const from = findContainer(activeIdStr);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;

    const active = tasks.find((x) => x.id === activeIdStr);
    if (!canMove(active, to)) return;

    // Cross-column preview: move active to end of target col.
    const targetList = columns[to];
    const last = targetList[targetList.length - 1];
    const nextOrder = (last?.sort_order ?? 0) + 1000;
    setOverride((cur) => ({
      ...cur,
      [activeIdStr]: { status: to, sort_order: nextOrder },
    }));
  }

  async function handleDragEnd(e: DragEndEvent) {
    const activeIdStr = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    setActiveId(null);
    if (!overId) { setOverride({}); return; }

    const originalTask = tasks.find((x) => x.id === activeIdStr);
    if (!originalTask) { setOverride({}); return; }

    const previewStatus = override[activeIdStr]?.status ?? (originalTask.status as ColStatus);
    const to = findContainer(overId) ?? previewStatus;
    if (!to || !isColumnId(to)) { setOverride({}); return; }

    if (!canMove(originalTask, to)) {
      toast.error(t("onlyAdminCanComplete"));
      setOverride({});
      return;
    }

    // Compute final position within target column (excluding the active item).
    const listWithoutActive = columns[to].filter((x) => x.id !== activeIdStr);
    let insertAt = listWithoutActive.length;
    if (!isColumnId(overId)) {
      const overIdx = listWithoutActive.findIndex((x) => x.id === overId);
      if (overIdx >= 0) insertAt = overIdx;
    }
    // Reinsert active to compute neighbors.
    const reordered = [...listWithoutActive];
    reordered.splice(insertAt, 0, { ...originalTask, status: to } as TaskRow);
    const idx = reordered.findIndex((x) => x.id === activeIdStr);
    const prev = reordered[idx - 1];
    const next = reordered[idx + 1];
    const prevO = prev?.sort_order ?? null;
    const nextO = next?.sort_order ?? null;
    let newOrder: number;
    if (prevO == null && nextO == null) newOrder = 1000;
    else if (prevO == null) newOrder = (nextO as number) - 1000;
    else if (nextO == null) newOrder = (prevO as number) + 1000;
    else newOrder = ((prevO as number) + (nextO as number)) / 2;

    const statusChanged = originalTask.status !== to;
    const orderChanged = originalTask.sort_order !== newOrder;
    if (!statusChanged && !orderChanged) { setOverride({}); return; }

    // Optimistic local overlay.
    setOverride({ [activeIdStr]: { status: to, sort_order: newOrder } });

    const patch: { sort_order: number; status?: ColStatus; completed_at?: string | null } = { sort_order: newOrder };
    if (statusChanged) {
      patch.status = to;
      if (to === "done") patch.completed_at = new Date().toISOString();
      if (originalTask.status === "done" && to !== "done") patch.completed_at = null;
    }

    const { error } = await supabase.from("tasks").update(patch).eq("id", activeIdStr);
    if (error) {
      toast.error(error.message);
      setOverride({});
      return;
    }
    if (statusChanged && to === "in_review") toast.success(t("awaitingReview"));
    // Refresh from server, then drop the overlay.
    onChanged();
    setOverride({});
  }

  // Mobile "move to" menu: same rules and patch shape as drag-and-drop.
  async function moveTaskTo(taskId: string, to: ColStatus) {
    const original = tasks.find((x) => x.id === taskId);
    if (!original) return;
    if (original.status === to) return;
    if (!canMove(original, to)) { toast.error(t("onlyAdminCanComplete")); return; }

    const list = columns[to].filter((x) => x.id !== taskId);
    const last = list[list.length - 1];
    const newOrder = (last?.sort_order ?? 0) + 1000;

    setOverride({ [taskId]: { status: to, sort_order: newOrder } });

    const patch: { sort_order: number; status: ColStatus; completed_at?: string | null } = {
      sort_order: newOrder,
      status: to,
    };
    if (to === "done") patch.completed_at = new Date().toISOString();
    if (original.status === "done" && to !== "done") patch.completed_at = null;

    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
    if (error) { toast.error(error.message); setOverride({}); return; }
    if (to === "in_review") toast.success(t("awaitingReview"));
    onChanged();
    setOverride({});
    goToCol(to);
  }

  const draggingTask = activeId ? tasks.find((x) => x.id === activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveId(null); setOverride({}); }}
    >
      {isMobile && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 8,
            paddingInline: 2,
            scrollbarWidth: "none",
          }}
        >
          {COLUMNS.map((c) => {
            const s = STATUS_STYLES[c];
            const on = activeCol === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => goToCol(c)}
                style={{
                  flex: "0 0 auto",
                  minHeight: 40,
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${on ? s.text : "var(--border)"}`,
                  background: on ? s.bg : "var(--surface-2)",
                  color: on ? s.text : "var(--muted)",
                  fontSize: 12,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {t(c as never)}
                <span style={{ opacity: 0.85 }}>{toLocalDigits(columns[c].length, lang)}</span>
              </button>
            );
          })}
        </div>
      )}
      <div
        ref={scrollerRef}
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: isMobile ? "100%" : "minmax(280px, 1fr)",
          gap: isMobile ? 10 : 14,
          overflowX: "auto",
          overscrollBehavior: "contain",
          paddingBottom: 12,
          paddingInline: isMobile ? 0 : 4,
          scrollSnapType: "x mandatory",
          scrollPaddingInline: isMobile ? 0 : 12,
          touchAction: "pan-x pan-y",
          scrollbarWidth: isMobile ? "none" : undefined,
        }}
      >
        {COLUMNS.map((col) => {
          const dropAllowed = !draggingTask || canMove(draggingTask, col);
          return (
            <KanbanColumn
              key={col}
              col={col}
              colRef={(n) => { colRefs.current[col] = n; }}
              tasks={columns[col]}
              projects={projects}
              users={users}
              assigneesByTask={assigneesByTask}
              onOpen={onOpen}
              onMove={isMobile ? moveTaskTo : undefined}
              canMoveTo={(task, target) => canMove(task, target)}
              dropAllowed={dropAllowed}
              draggingId={activeId}
              currentUserId={user?.id}
              isAdmin={!!isAdmin}
              lang={lang}
              t={t}
            />
          );
        })}
      </div>
      {isMobile && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, paddingBottom: 6 }}>
          {COLUMNS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t(c as never)}
              onClick={() => goToCol(c)}
              style={{
                width: 34, height: 34, display: "grid", placeItems: "center",
                background: "transparent", border: "none", padding: 0,
              }}
            >
              <span
                style={{
                  display: "block",
                  width: activeCol === c ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  background: activeCol === c ? STATUS_STYLES[c].text : "var(--border)",
                  transition: "width .2s ease, background .2s ease",
                }}
              />
            </button>
          ))}
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {draggingTask ? (
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--foreground)",
              boxShadow: "0 20px 40px -12px rgba(0,0,0,.5)",
              maxWidth: 280,
              cursor: "grabbing",
            }}
          >
            {draggingTask.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  col, tasks, projects, users, assigneesByTask, onOpen,
  dropAllowed, draggingId, currentUserId, isAdmin, lang, t,
}: {
  col: ColStatus;
  tasks: TaskRow[];
  projects: Project[];
  users: Profile[];
  assigneesByTask?: Record<string, string[]>;
  onOpen: (id: string) => void;
  dropAllowed: boolean;
  draggingId: string | null;
  currentUserId: string | undefined;
  isAdmin: boolean;
  lang: "ar" | "en";
  t: (k: never) => string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  const style = STATUS_STYLES[col];
  const isReview = col === "in_review";
  const isDone = col === "done";
  const highlight = isOver && dropAllowed && draggingId;

  return (
    <div
      ref={setNodeRef}
      className="brand-card kanban-col"
      style={{
        padding: 12,
        minHeight: 200,
        scrollSnapAlign: "start",
        background: highlight ? "var(--surface-2)" : "var(--card)",
        border: `1px solid ${highlight ? style.text : (isReview ? "rgba(168,85,247,.35)" : "var(--border)")}`,
        boxShadow: isReview ? `0 0 0 1px rgba(168,85,247,.15) inset, 0 8px 24px -18px ${style.text}` : undefined,
        backgroundImage: isReview
          ? "radial-gradient(120% 60% at 50% 0%, rgba(168,85,247,.08), transparent 70%)"
          : undefined,
        transition: "border-color .15s ease, background .15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: draggingId && !dropAllowed ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: `2px solid ${style.text}` }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: style.text, boxShadow: isReview ? `0 0 10px ${style.text}` : undefined }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, flex: 1, color: style.text, display: "flex", alignItems: "center", gap: 6 }}>
          {t(col as never)}
          {isDone && !isAdmin && <span title={t("onlyAdminCanComplete" as never)} style={{ fontSize: 11 }}>🔒</span>}
        </h3>
        <span style={{
          fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: "center",
          padding: "2px 8px", borderRadius: 999, background: style.bg, color: style.text,
        }}>{toLocalDigits(tasks.length, lang)}</span>
      </div>
      {isReview && (
        <div style={{ fontSize: 11, color: "var(--muted)", padding: "0 2px", lineHeight: 1.4 }}>
          {lang === "ar" ? "المهام هنا بانتظار اعتماد المدير." : "Tasks here await admin approval."}
        </div>
      )}
      <SortableContext items={tasks.map((tk) => tk.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "18px 6px" }}>—</div>
        )}
        {tasks.map((tk) => {
          const project = projects.find((p) => p.id === tk.project_id);
          const assignee = users.find((u) => u.id === tk.assignee_id);
          const overdue = isOverdue(tk.due_date, tk.status);
          const taskAssigneeIds = assigneesByTask?.[tk.id] ?? [];
          const taskAssignees = taskAssigneeIds
            .map((uid) => users.find((u) => u.id === uid))
            .filter(Boolean) as Profile[];
          const dragThis = isAdmin || tk.assignee_id === currentUserId || taskAssigneeIds.includes(currentUserId ?? "");
          return (
            <SortableCard
              key={tk.id}
              id={tk.id}
              title={tk.title}
              due={tk.due_date}
              priority={tk.priority}
              overdue={overdue}
              project={project}
              assignee={assignee}
              taskAssignees={taskAssignees}
              draggable={dragThis}
              onOpen={() => onOpen(tk.id)}
              lang={lang}
            />
          );
        })}
      </SortableContext>
    </div>
  );
}

function SortableCard({
  id, title, due, priority, overdue, project, assignee, taskAssignees,
  draggable, onOpen, lang,
}: {
  id: string;
  title: string;
  due: string | null;
  priority: string;
  overdue: boolean;
  project: Project | undefined;
  assignee: Profile | undefined;
  taskAssignees: Profile[];
  draggable: boolean;
  onOpen: () => void;
  lang: "ar" | "en";
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      onClick={() => onOpen()}
      style={{
        ...style,
        position: "relative",
        padding: 10,
        borderRadius: 10,
        background: "var(--surface-2)",
        border: `1px solid ${overdue ? "rgba(240,103,106,.5)" : "var(--border)"}`,
        cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
        opacity: isDragging ? 0.4 : 1,
        borderInlineStart: project ? `3px solid transparent` : undefined,
        backgroundImage: project
          ? `linear-gradient(var(--surface-2),var(--surface-2)), ${PROJECT_COLORS[project.color] ?? PROJECT_COLORS.blue}`
          : undefined,
        backgroundOrigin: "border-box",
        backgroundClip: "padding-box, border-box",
        touchAction: draggable ? "none" : "auto",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, marginBottom: 8, color: "var(--foreground)" }}>
        {title}
      </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: overdue ? "#F0676A" : "var(--muted)", fontWeight: overdue ? 700 : 500 }}>
            <PriorityDot p={priority} />
            <span>{due ? formatDate(due, lang) : "—"}</span>
          </div>
          <AssigneeNames
            users={taskAssignees.length > 0 ? taskAssignees : (assignee ? [assignee] : [])}
            size={20}
            maxNames={1}
          />
        </div>
    </div>
  );
}


function PriorityDot({ p }: { p: string }) {
  const c = p === "urgent" ? "#F0676A" : p === "high" ? "#FF9255" : p === "normal" ? "#42C2EE" : "var(--muted)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />;
}
