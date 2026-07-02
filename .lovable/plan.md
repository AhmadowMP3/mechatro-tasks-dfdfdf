## Show auto-captured creation date on project cards

The card currently shows only the due date (`24 Jul 2026` in the screenshot). `projects.created_at` is already stored automatically by the database on insert — no schema change needed.

### Edit `src/routes/_authenticated/projects.tsx` (around line 276–279)
Replace the single `<span>{formatDate(p.due_date, lang)}</span>` block with a compact two-line stack, right-aligned, so both dates are visible:

- Top line: small `Sparkles`/`CalendarPlus` icon + muted label `t("created")` + `formatDate(p.created_at, lang)` in `var(--brand-gold)` (subtle emphasis showing it's system-generated).
- Bottom line (only if `p.due_date`): muted label `t("dueDate")` + `formatDate(p.due_date, lang)` in `var(--foreground)`.

MembersList stays on the left; the dates stack on the right of the same row.

### Add i18n key
`src/i18n/dict.ts`: add `created: { ar: "أُنشئ", en: "Created" }` (if not already present).

No other pages, no schema, no query changes — `created_at` is already selected via `select("*")`.