## References Page

A shared, company-wide library of important external links (Drive, Docs, Figma, sites, videos). Admins and managers curate; everyone views.

### Database (new migration)

Table `public.references`:
- `title`, `description`, `url`, `category` (text, admin-defined free tag), `tags` (text[]), `pinned` (bool), `icon` (text — auto-detected: drive/figma/youtube/notion/generic), `color` (accent hint), `created_by`, `created_at`, `updated_at`.

RLS + GRANTs:
- SELECT: any authenticated user.
- INSERT / UPDATE / DELETE: users where `role in ('admin','manager')` and `active`, via `is_admin_or_manager(auth.uid())`.
- service_role: ALL.

Activity logging: insert/update/delete writes into `activity_log` with entity `reference`.

### Route

`src/routes/_authenticated/references.tsx` — added to sidebar with a Library icon, visible to all authenticated users.

### Page layout (bento grid)

Top bar:
- Big page title + subtitle ("Company knowledge base / مركز المراجع").
- Search input (title, description, url, tags).
- Filter row combining everything the user asked for:
  - **Pinned** toggle chip
  - **Category** dropdown (dynamic from existing rows)
  - **Tag** multi-select chips
  - **Sort**: newest / most-used-category / A→Z
- All filter state lives in URL search params (zodValidator + fallback) so views are shareable.

Bento grid:
- Asymmetric tile sizes — pinned items span 2 cols, others 1. Responsive: 1 / 2 / 4 columns.
- Each tile: gradient header strip using brand blue/gold, source icon (Figma, Drive, YouTube, Notion, generic link) auto-detected from the URL host, title, 2-line description, category chip, tag chips, "Open ↗" primary action, small "copy link" secondary.
- Hover: subtle lift + glow using existing brand tokens. RTL-aware (icon flips side).
- Admin/manager tiles show a compact menu (edit / pin / delete).

Empty state: illustrated card with "Add your first reference" (admin/manager only) or "No references yet" for members.

### Admin/manager actions

- Header button "Add reference" (visible only when `is_admin_or_manager`).
- `AddReferenceModal` — title, url (validated), description, category (combobox that suggests existing + allows new), tags (chip input), pin toggle.
- Edit modal reuses the same form.
- Delete with confirm.
- URL host is parsed to set `icon` automatically (figma.com → Figma, drive.google/docs.google → Drive, youtube/youtu.be → YouTube, notion.so → Notion, github.com → GitHub, else generic).

### Bilingual + theming

- All strings added to `src/i18n/dict.ts` (EN + AR). RTL respected — bento grid, chips, and modals mirror.
- Uses existing design tokens (brand blue/gold gradients, dark default).

### Files

- New migration (table + RLS + grants).
- `src/routes/_authenticated/references.tsx`
- `src/components/references/ReferenceCard.tsx`
- `src/components/references/AddReferenceModal.tsx`
- `src/components/references/ReferenceFilters.tsx`
- `src/lib/references.ts` (host → icon/color helpers, query helpers)
- Sidebar entry + dict keys.
