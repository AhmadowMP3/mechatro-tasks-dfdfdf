import { useMemo } from "react";
import { useApp } from "@/lib/app-context";
import type { Note } from "@/lib/notes";
import { preview } from "@/lib/notes";
import { Plus, Star, Clock, Pin, FileText, Sparkles } from "lucide-react";

export function HomeDashboard({
  notes,
  onOpen,
  onCreate,
  onTemplates,
}: {
  notes: Note[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onTemplates: () => void;
}) {
  const { t, lang } = useApp();
  const isAr = lang === "ar";

  const favorites = useMemo(() => notes.filter((n) => n.is_favorite).slice(0, 6), [notes]);
  const pinned = useMemo(() => notes.filter((n) => n.is_pinned).slice(0, 6), [notes]);
  const recents = useMemo(() => [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8), [notes]);

  return (
    <div style={{ padding: "36px 40px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 4, background: "linear-gradient(135deg,#189FD1,#7C5CFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {t("homeGreeting")}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>{t("homeSubtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onTemplates} style={{
            padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 10, color: "var(--foreground)", cursor: "pointer", fontWeight: 700, fontSize: 13,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}><Sparkles size={14} /> {t("templatesTitle")}</button>
          <button onClick={onCreate} style={{
            padding: "10px 18px", background: "var(--grad-blue)", border: "none",
            borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 13,
            display: "inline-flex", alignItems: "center", gap: 6,
            boxShadow: "0 6px 18px rgba(24,159,209,.35)",
          }}><Plus size={14} /> {t("newNote")}</button>
        </div>
      </div>

      {favorites.length > 0 && (
        <Section title={t("favorites")} icon={<Star size={14} />}>
          <Grid>{favorites.map((n) => <NoteCard key={n.id} note={n} onOpen={onOpen} isAr={isAr} accent="#D4AF37" />)}</Grid>
        </Section>
      )}

      {pinned.length > 0 && (
        <Section title={t("pinnedSection")} icon={<Pin size={14} />}>
          <Grid>{pinned.map((n) => <NoteCard key={n.id} note={n} onOpen={onOpen} isAr={isAr} accent="#189FD1" />)}</Grid>
        </Section>
      )}

      <Section title={t("recents")} icon={<Clock size={14} />}>
        {recents.length === 0 ? (
          <div style={{
            padding: 40, borderRadius: 14, background: "var(--surface-2)",
            border: "1px dashed var(--border)", textAlign: "center", color: "var(--muted)",
          }}>
            <FileText size={32} strokeWidth={1.3} style={{ opacity: 0.5, marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t("noNotesYet")}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{t("emptyStateHint")}</div>
          </div>
        ) : (
          <Grid>{recents.map((n) => <NoteCard key={n.id} note={n} onOpen={onOpen} isAr={isAr} accent="var(--muted)" />)}</Grid>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--muted)", fontSize: 11.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

function NoteCard({ note, onOpen, isAr, accent }: { note: Note; onOpen: (id: string) => void; isAr: boolean; accent: string }) {
  const { t } = useApp();
  return (
    <button
      onClick={() => onOpen(note.id)}
      style={{
        textAlign: "start", padding: 14, borderRadius: 12,
        background: note.cover_url ? `linear-gradient(rgba(15,23,42,.6), rgba(15,23,42,.9)), url(${note.cover_url}) center/cover` : "var(--surface-2)",
        border: "1px solid var(--border)", color: "var(--foreground)",
        cursor: "pointer", minHeight: 128, position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ position: "absolute", top: 0, insetInlineStart: 0, width: 3, height: "100%", background: accent }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {note.emoji && <span style={{ fontSize: 22, lineHeight: 1 }}>{note.emoji}</span>}
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {note.title || t("untitledNote")}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", flex: 1, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3 }}>
        {preview(note.content_text || "", 140) || (isAr ? "فارغة" : "Empty")}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
        {new Date(note.updated_at).toLocaleDateString(isAr ? "ar" : "en-GB", { day: "2-digit", month: "short" })}
      </div>
    </button>
  );
}
