// Global command palette (⌘K / Ctrl+K).
//
// - Debounced live search across tasks, projects, people, references.
// - Quick-jump to any app page.
// - Opens via the "cmdk:open" window event, ⌘K/Ctrl+K, or `/`.
//
// The palette is mounted once from AppShell.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Command as CmdRoot,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  ArrowUpRight, ListTodo, FolderKanban, Users, BookOpen, Bell, Settings,
  ShieldCheck, Trophy, ClipboardList, FileClock, Home, Search,
  Keyboard, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { isShareMode, shareAllowedPaths } from "@/lib/share-mode";

type Suggestion = {
  id: string;
  kind: "task" | "project" | "person" | "reference" | "nav" | "action";
  title: string;
  subtitle?: string;
  to: string;
  icon: React.ReactNode;
  keywords?: string;
};

/** Open the palette from anywhere. */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("cmdk:open"));
}

// Not every user sees every route. This is filtered against share-mode and
// admin-only surfaces at render time.
type NavEntry = {
  to: string;
  label: [string, string]; // [ar, en]
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const NAV: NavEntry[] = [
  { to: "/",                    label: ["الرئيسية", "Home"],                icon: <Home size={16} /> },
  { to: "/tasks",               label: ["المهام", "Tasks"],                 icon: <ListTodo size={16} /> },
  { to: "/projects",            label: ["المشاريع", "Projects"],            icon: <FolderKanban size={16} /> },
  { to: "/team",                label: ["الفريق", "Team"],                  icon: <Users size={16} /> },
  { to: "/league",              label: ["الترتيب العام", "Leaderboard"],                icon: <Trophy size={16} /> },
  { to: "/references",          label: ["المراجع", "References"],           icon: <BookOpen size={16} /> },
  { to: "/notifications",       label: ["الإشعارات", "Notifications"],      icon: <Bell size={16} /> },
  { to: "/settings",            label: ["الإعدادات", "Settings"],           icon: <Settings size={16} /> },
  { to: "/activity",            label: ["سجل النشاط", "Activity Log"],      icon: <ClipboardList size={16} />, adminOnly: true },
  { to: "/reports",             label: ["التقارير", "Reports"],             icon: <FileClock size={16} />, adminOnly: true },
  { to: "/reports-history",     label: ["أرشيف التقارير", "Report History"], icon: <FileClock size={16} />, adminOnly: true },
  { to: "/access-control",      label: ["المستخدمين والدعوات", "People & Invites"], icon: <ShieldCheck size={16} />, adminOnly: true },
];

export function CommandPalette() {
  const { lang, isAdmin, user } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const shareMode = isShareMode();
  const allowed = shareMode ? shareAllowedPaths().map((a) => a.path) : null;

  // Open triggers.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("cmdk:open", openIt);
    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K anywhere
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" focuses palette when not typing in an input
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("cmdk:open", openIt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Debounced live query.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2 || shareMode) {
      setLive([]);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const t = setTimeout(async () => {
      const like = `%${escapeIlike(q)}%`;
      try {
        let myTaskIds: string[] = [];
        if (!isAdmin && user) {
          const { data: ta } = await supabase.from("task_assignees").select("task_id").eq("user_id", user.id);
          myTaskIds = (ta ?? []).map((r) => r.task_id);
        }
        const taskQuery = supabase.from("tasks").select("id,title,status,project_id").ilike("title", like);
        const scopedTaskQuery = !isAdmin && user
          ? taskQuery.or(
              myTaskIds.length
                ? `assignee_id.eq.${user.id},id.in.(${myTaskIds.join(",")})`
                : `assignee_id.eq.${user.id}`,
            )
          : taskQuery;
        const [tasks, projects, refs, people] = await Promise.all([
          scopedTaskQuery.limit(6),
          supabase.from("projects")
            .select("id,name_ar,name_en")
            .or(`name_ar.ilike.${like},name_en.ilike.${like}`).limit(6),
          supabase.from("references")
            .select("id,title,description,category")
            .or(`title.ilike.${like},description.ilike.${like},category.ilike.${like}`).limit(6),
          isAdmin
            ? supabase.from("profiles")
                .select("id,full_name,username,email,role,status")
                .or(`full_name.ilike.${like},username.ilike.${like},email.ilike.${like}`).limit(6)
            : supabase.from("team_directory")
                .select("id,full_name,avatar_url")
                .ilike("full_name", like).limit(6),
        ]);
        if (controller.signal.aborted) return;
        const out: Suggestion[] = [];
        for (const r of tasks.data ?? []) {
          out.push({
            id: `task-${r.id}`, kind: "task", title: r.title,
            subtitle: lang === "ar" ? `مهمة · ${labelStatus(r.status, lang)}` : `Task · ${labelStatus(r.status, lang)}`,
            to: `/tasks?open=${r.id}`,
            icon: <ListTodo size={16} />,
          });
        }
        for (const r of projects.data ?? []) {
          out.push({
            id: `proj-${r.id}`, kind: "project",
            title: (lang === "ar" ? r.name_ar : r.name_en) || r.name_en || r.name_ar || "—",
            subtitle: lang === "ar" ? "مشروع" : "Project",
            to: `/projects/${r.id}`,
            icon: <FolderKanban size={16} />,
          });
        }
        for (const r of refs.data ?? []) {
          out.push({
            id: `ref-${r.id}`, kind: "reference",
            title: r.title || "—",
            subtitle: r.category ? `${lang === "ar" ? "مرجع" : "Reference"} · ${r.category}` : (lang === "ar" ? "مرجع" : "Reference"),
            to: `/references?open=${r.id}`,
            icon: <BookOpen size={16} />,
          });
        }
        for (const r of (people.data ?? []) as Array<Record<string, unknown>>) {
          const name = String(r.full_name ?? "—");
          const sub = isAdmin
            ? [r.username && `@${r.username}`, r.email, r.role].filter(Boolean).join(" · ")
            : (lang === "ar" ? "عضو" : "Member");
          out.push({
            id: `person-${r.id}`, kind: "person", title: name,
            subtitle: String(sub || ""),
            to: isAdmin ? "/access-control" : "/team",
            icon: <Users size={16} />,
          });
        }
        setLive(out);
      } catch {
        setLive([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { clearTimeout(t); controller.abort(); };
  }, [query, open, isAdmin, lang, shareMode]);

  const navItems = useMemo(() => {
    return NAV.filter((n) => {
      if (n.adminOnly && !isAdmin) return false;
      if (shareMode && allowed && !allowed.some((a) => a === n.to || n.to.startsWith(a + "/"))) return false;
      return true;
    });
  }, [isAdmin, shareMode, allowed]);

  const go = (to: string) => {
    setOpen(false);
    // Handle query-string search links (?open=...) via location for simplicity.
    if (to.includes("?")) {
      const [path, qs] = to.split("?");
      navigate({ to: path, search: Object.fromEntries(new URLSearchParams(qs)) as never });
    } else {
      navigate({ to });
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CmdRoot shouldFilter={true} label="Command palette">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 0" }}>
          <Search size={16} style={{ color: "var(--muted)" }} />
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={
              lang === "ar"
                ? "ابحث عن مهمة، مشروع، شخص، مرجع، أو صفحة…"
                : "Search tasks, projects, people, references, or pages…"
            }
            style={{ flex: 1, height: 44, background: "transparent", border: 0, outline: "none", fontSize: 14, color: "var(--foreground)" }}
          />
          <kbd style={kbd}>ESC</kbd>
        </div>
        <CommandList style={{ maxHeight: 440, padding: 8 }}>
          <CommandEmpty>
            {loading
              ? (lang === "ar" ? "جاري البحث…" : "Searching…")
              : query.length < 2
              ? (lang === "ar" ? "اكتب حرفين على الأقل" : "Type at least 2 characters")
              : (lang === "ar" ? "لا توجد نتائج" : "No results")}
          </CommandEmpty>

          {live.length > 0 && (
            <>
              <CommandGroup heading={lang === "ar" ? "النتائج" : "Results"}>
                {live.map((s) => (
                  <CommandItem key={s.id} value={`${s.title} ${s.subtitle ?? ""} ${s.id}`} onSelect={() => go(s.to)}>
                    <Row title={s.title} subtitle={s.subtitle} icon={s.icon} />
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading={lang === "ar" ? "الانتقال" : "Jump to"}>
            {navItems.map((n) => (
              <CommandItem key={n.to} value={`${n.label[0]} ${n.label[1]} ${n.to}`} onSelect={() => go(n.to)}>
                <Row title={n.label[lang === "ar" ? 0 : 1]} subtitle={n.to} icon={n.icon} />
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {user && !shareMode && (
            <CommandGroup heading={lang === "ar" ? "إجراءات" : "Actions"}>
              {isAdmin && (
                <CommandItem
                  value="new task create"
                  onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent("app:new-task")); }}
                >
                  <Row
                    title={lang === "ar" ? "مهمة جديدة" : "New task"}
                    subtitle={lang === "ar" ? "N" : "Press N anywhere"}
                    icon={<Sparkles size={16} />}
                  />
                </CommandItem>
              )}
              <CommandItem
                value="shortcuts cheatsheet"
                onSelect={() => { setOpen(false); window.dispatchEvent(new CustomEvent("app:shortcuts")); }}
              >
                <Row
                  title={lang === "ar" ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}
                  subtitle={lang === "ar" ? "?" : "Press ? anywhere"}
                  icon={<Keyboard size={16} />}
                />
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CmdRoot>
    </CommandDialog>
  );
}

function Row({ title, subtitle, icon }: { title: string; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "var(--foreground)", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
        )}
      </div>
      <ArrowUpRight size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
    </div>
  );
}

const kbd: React.CSSProperties = {
  fontSize: 10, fontFamily: "inherit", fontWeight: 700, letterSpacing: 0.4,
  padding: "3px 6px", borderRadius: 6,
  background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)",
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function labelStatus(s: string | null | undefined, lang: string): string {
  const map: Record<string, [string, string]> = {
    todo: ["قيد الانتظار", "To do"],
    in_progress: ["قيد التنفيذ", "In progress"],
    paused: ["متوقف", "Paused"],
    in_review: ["مراجعة", "In review"],
    done: ["مكتمل", "Done"],
  };
  const v = s ? map[s] : undefined;
  return v ? v[lang === "ar" ? 0 : 1] : s ?? "";
}
