import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PROJECT_COLORS } from "@/lib/ui-tokens";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { NewTaskModal } from "@/components/NewTaskModal";
import { formatDate, toLocalDigits } from "@/lib/format";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";

export const Route = createFileRoute("/_authenticated/projects/$id")({ component: ProjectDetail });

function ProjectDetail() {
  const { id } = Route.useParams();
  const { t, lang, users, isAdmin, user } = useApp();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [pr, tk] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("tasks").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      ]);
      return { project: pr.data, tasks: tk.data ?? [] };
    },
  });

  if (!data?.project) return <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>…</div>;
  const p = data.project;
  const total = data.tasks.length;
  const done = data.tasks.filter((t) => t.status === "done").length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <Link to="/projects" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", textDecoration: "none", marginBottom: 12, minHeight: 44 }}>
        <ArrowRight size={16} style={{ transform: lang === "ar" ? "none" : "scaleX(-1)" }} /> {t("projects")}
      </Link>

      <div className="brand-card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: 8, background: PROJECT_COLORS[p.color] ?? PROJECT_COLORS.blue }} />
        <div style={{ padding: 24 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>{lang === "ar" ? p.name_ar : p.name_en}</h1>
          {p.description && <p style={{ color: "var(--muted)", marginTop: 8 }}>{p.description}</p>}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, fontSize: 13 }}>
            <span>{t("status")}: <b>{t(p.status as never)}</b></span>
            <span>{t("dueDate")}: <b>{formatDate(p.due_date, lang)}</b></span>
            <span>{t("progress")}: <b>{toLocalDigits(progress, lang)}%</b> ({toLocalDigits(done, lang)}/{toLocalDigits(total, lang)})</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 20 }}>{t("tasks")}</h2>
        {isAdmin && (
          <>
            <button onClick={() => setNewOpen(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
              <Plus size={18} /> {t("addTaskHere")}
            </button>
            <button
              onClick={() => { setConfirmText(""); setDeleteOpen(true); }}
              className="brand-btn"
              aria-label={t("deleteProject")}
              title={t("deleteProject")}
              style={{ background: "var(--surface-2)", color: "#ff6b6b", border: "1px solid var(--border)" }}
            >
              <Trash2 size={16} /> {t("deleteProject")}
            </button>
          </>
        )}
      </div>

      {data.tasks.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noTasks")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 300px), 1fr))", gap: 14 }}>
          {data.tasks.map((tk) => (
            <TaskCard key={tk.id} task={tk} project={p}
              assignee={users.find((u) => u.id === tk.assignee_id) ?? null}
              onClick={() => setSelected(tk.id)} />
          ))}
        </div>
      )}

      {selected && <TaskDetailModal taskId={selected} onClose={() => setSelected(null)} onChanged={refetch} />}
      {newOpen && <NewTaskModal defaultProjectId={id} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refetch(); }} />}
    </div>
  );
}
