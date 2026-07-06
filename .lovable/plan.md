## Notes — full polish, cool & creative

Turn Notes into a lightweight replacement for Word / Excel / Trello / Excalidraw, all in one clean two-pane workspace. Because this is a big surface, I'll ship it in **two shipping waves** so we can review before adding the heavier canvas pieces.

### Layout fix (immediate)

Collapse to **two panes**:

```text
┌──────────────┬──────────────────────────────────────────────┐
│ Sidebar      │  Editor OR "Home" grid                       │
│              │                                              │
│ + New note   │  ── when no note open ──                     │
│ 🔍 Search    │  Big search bar                              │
│ ⭐ Favorites │  ⭐ Favorites row (cards)                     │
│ 🕒 Recents   │  🕒 Recents row (cards)                       │
│ 📁 Folders   │  📌 Pinned grid                              │
│ 🏷 Tags      │                                              │
│ 👥 Shared    │  ── when a note open ──                       │
│              │  Cover image · emoji · title · tags · share  │
│              │  Toolbar · body                              │
└──────────────┴──────────────────────────────────────────────┘
```

Middle "list column" from the screenshot is gone. Note list surfaces as (a) sidebar sections and (b) the Home dashboard grid.

### Wave 1 — Rich doc + polish (this turn)

**Editor**
- **Slash menu** (`/`) to insert: H1/H2/H3, quote, bullet/numbered/todo list, divider, table, code, image, cover image, callout, page-break, template.
- **Templates**: Meeting notes · Weekly report · Decision log · Client brief · Blank spreadsheet — 5 built-in, one click inserts.
- **Cover image** (16:9 top banner, uploadable to Lovable Cloud storage) + **emoji icon** (native emoji picker, no extra dep) stored on the note.
- **Spreadsheet-lite**: TipTap table with a right-click bubble menu → Insert row/col, delete, align, and a **"∑ Sum row"** action that appends a footer row summing numeric columns. Live re-sum on edit. Export table → CSV.
- **AI assistant** bubble (via Lovable AI Gateway `google/gemini-2.5-flash`): Summarize · Rewrite · Translate AR↔EN · Continue writing · Fix grammar — acts on selection or whole doc. Server function under `src/lib/notes-ai.functions.ts` with `requireSupabaseAuth`.

**Organization**
- **Tags with colors** (already in schema `note_tags`): pill UI in the header, autocomplete + create-on-enter, filter chip row in the Home grid.
- **Favorites**: heart button toggles `is_pinned` (reused) or add `is_favorite` boolean via migration. Cleaner to add `is_favorite` — separate from Pinned.
- **Recents**: local + server-side — sort by `updated_at`, show last 6.
- **Full-text search with previews**: `content_text` already stored; use `websearch_to_tsquery` on a new `tsvector` generated column + GIN index; results show title + highlighted snippet.

**Sharing**
- Polish `ShareNoteModal`: member picker with avatars, permission chips (View / Edit — needs `permission` column on `note_shares`), "shared with N" badge on the note, and an **inline comments** side panel (new `note_comments` table). Comments show author avatar, timestamp, resolve toggle.
- No live-cursor CRDT this wave — comments + share invalidation is enough for team workflow.

**Visual polish**
- Brand-blue accents (existing `#189FD1` / navy), gold star for favorites, glassy cover-image header with gradient fade, sticky floating toolbar, keyboard shortcuts hint (`?`), auto-save indicator ("Saved · 2s ago"), skeleton loaders.

### Wave 2 — Kanban + Whiteboard (next turn, after approval)

- **Kanban board note** (`note_type = 'board'`): columns of cards stored as JSON, drag-and-drop via `@dnd-kit` (already in project if not, added then).
- **Whiteboard note** (`note_type = 'canvas'`): embed **Excalidraw** (`@excalidraw/excalidraw`), autosave scene JSON to the note. Cloudflare-Worker-safe (client-only component, dynamic import).

Splitting this wave keeps Wave 1 shippable and lets us verify the polish before adding two new note kinds.

### Database changes (Wave 1)

One new migration:

```sql
ALTER TABLE public.notes
  ADD COLUMN emoji TEXT,
  ADD COLUMN cover_url TEXT,
  ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content_text,'')), 'B')
  ) STORED;
CREATE INDEX idx_notes_search ON public.notes USING GIN (search_tsv);

ALTER TABLE public.note_shares ADD COLUMN permission TEXT NOT NULL DEFAULT 'edit'
  CHECK (permission IN ('view','edit'));

CREATE TABLE public.note_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_comments TO authenticated;
GRANT ALL ON public.note_comments TO service_role;
ALTER TABLE public.note_comments ENABLE ROW LEVEL SECURITY;
-- policies: readable by owner or share targets; writable by same set
```

Storage bucket `note-covers` (public read, authenticated write).

### Files touched (Wave 1)

- `src/routes/_authenticated/notes.tsx` — rebuild layout (two-pane + Home dashboard).
- `src/components/notes/NoteEditor.tsx` — cover, emoji, tag pills, favorite star, comments panel toggle, auto-save indicator.
- `src/components/notes/NoteToolbar.tsx` — extended toolbar + AI menu.
- **New** `src/components/notes/SlashMenu.tsx`, `TemplatesMenu.tsx`, `AiMenu.tsx`, `CoverPicker.tsx`, `EmojiPicker.tsx`, `TagChips.tsx`, `CommentsPanel.tsx`, `HomeDashboard.tsx`.
- **New** `src/lib/notes-ai.functions.ts` (server fn using Lovable AI Gateway).
- `src/lib/notes.ts` — extend queries (favorites, recents, tags, search, comments).
- `src/i18n/dict.ts` — new keys (EN + AR).
- One SQL migration as above.

### Out of scope (Wave 1)

- Real-time cursors / CRDT — comments cover the collaboration need.
- Kanban + Whiteboard note types → Wave 2.
- Version history / trash bin.