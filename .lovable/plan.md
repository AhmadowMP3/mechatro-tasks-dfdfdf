
## Goal

Every generated member report is saved to a persistent, admin-only history. Admins can browse, download the original PDF, delete, and pick any two saved reports to compare — both on-screen (side-by-side dashboard) and as an exportable branded Comparison PDF (which itself gets saved back into history).

## 1. Storage & Data Model

New private storage bucket `member-reports` (admin-only RLS on `storage.objects`).

New table `public.member_reports`:
- `member_id` (profile), `member_name_snapshot`
- `generated_by` (profile), `generated_by_name_snapshot`
- `language` (`ar` | `en` | `bilingual`)
- `range_key` (`7d` | `30d` | `90d` | `all` | `custom`), `range_from`, `range_to`
- `pdf_path` (storage key), `pdf_size_bytes`, `page_count`
- `kind` (`member` | `comparison`) — comparison rows also store `compare_member_a`, `compare_member_b`, `compare_report_a`, `compare_report_b`
- `kpi_snapshot` JSONB — the full computed KPI object used to render the PDF (so compare is instant, no re-fetching)
- standard `created_at`, `updated_at`

RLS: `SELECT / INSERT / DELETE` restricted to `is_admin_or_manager(auth.uid())`. Storage bucket policies mirror this. Grants for `authenticated` + `service_role`.

## 2. Generation flow (existing "PDF" button)

Extend `src/lib/report/generator.ts`:
1. Build HTML → render PDF with `html2pdf.js` (as today).
2. Instead of just triggering browser download, get the PDF as a `Blob`.
3. Trigger local download (unchanged UX).
4. In parallel: upload blob to `member-reports/{memberId}/{timestamp}-{lang}.pdf`, then `INSERT` a row into `member_reports` with the KPI snapshot from `data.ts`.
5. Log an activity entry `report.generated`.

## 3. New route: `/reports-history` (admin/manager only)

Sidebar entry "Report History" (bilingual, gated like Access Control).

Layout:
- Filter bar: member, generated-by, language, date range, kind (member/comparison), search.
- List of report cards grouped by day, each showing member avatar, range badge, language chip, generator, file size, and actions: **Download**, **Preview** (opens signed URL in new tab), **Delete**, **Select for compare** (checkbox).
- Sticky footer bar appears when 1 report is selected ("Select one more to compare…"); when 2 are selected, shows **Compare** button.

## 4. Compare experience

Route `/reports-history/compare?a={id}&b={id}` (search-param validated).

On load, fetches both `member_reports` rows and reads `kpi_snapshot` for each — no re-computation needed.

**On-screen dashboard** (two-column, RTL-aware):
- Header: Report A vs Report B with member name, period, language, generated date.
- KPI delta grid: total tasks, completed, on-time %, avg completion time, points, rank — each cell shows both values + arrow delta (green up / red down) + percentage change.
- Chart overlays (SVG): status distribution (grouped bars A/B), priority mix (paired donuts), activity sparkline overlay.
- Section diffs: projects touched (Venn-style list: only A / both / only B), top tasks table side by side.
- Winner highlights: subtle gold ring on the better value per KPI (configurable — higher-is-better vs lower-is-better).
- Sticky top-right: **Export Comparison PDF** button.

**Comparison PDF export**:
- Reuse `report-html.ts` engine, add `comparison-html.ts` module producing a 3–4 page branded doc (cover with both member avatars, KPI delta page, chart page, section diff page).
- After render: download locally AND upload + insert new `member_reports` row with `kind='comparison'` linking the two source reports, so comparisons themselves live in history.

## 5. i18n & polish

- Add all new strings to `src/i18n/dict.ts` (AR + EN): history, compare, delta labels, winner, download, preview, delete confirm, empty states.
- Full RTL: mirror arrows in delta chips (▲/▼ stay semantic, position flips).
- Dark + light mode tokens only, no hardcoded colors.
- Confirm-before-delete modal (also removes the storage object).
- Activity log entries: `report.generated`, `report.deleted`, `report.compared`.

## Technical notes

- Bucket creation via `supabase--storage_create_bucket` (not SQL).
- Migration adds table + RLS + grants + storage policies + updated_at trigger, following the required CREATE → GRANT → RLS → POLICY order.
- KPI snapshot schema is versioned (`snapshot_version: 1`) so future generator changes stay backward-compatible for comparison.
- Signed URLs for download/preview (60s expiry) — bucket stays private.
- No changes to existing member report visual output; we only wrap the generator to also persist.

