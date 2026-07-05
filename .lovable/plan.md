## Goal

Group the sidebar links under clear, cool-looking section titles (like Notion / Linear sidebars) instead of one flat list — bilingual, respects share-mode filtering, no functional changes.

## Sections

Rendered top → bottom, each with a small pill-style header (uppercase, letter-spaced, muted color, tiny gradient underline). Icons/routes unchanged.

1. **Workspace** — `overviewSection` — Dashboard
2. **Work** — `workSection` — Projects · Tasks · References
3. **Team** — `teamSection` — Team · League
4. **Insights** *(admin only)* — `insightsSection` — Activity · Reports · Report history
5. **Administration** *(admin/master only)* — `adminSection` — People & Invites · Share Links
6. **Personal** — `personalSection` — Notifications · Settings

Share-mode viewers only see sections whose items survive the whitelist filter — empty sections are hidden automatically.

## Implementation (single file: `src/components/layout/Sidebar.tsx`)

- Replace the flat `NAV: NavItem[]` with `NAV_SECTIONS: { titleKey: DictKey; items: NavItem[] }[]`.
- Move the admin/master conditional pushes into their own section objects instead of appending to the flat list.
- In the render pass:
  - map over sections
  - filter each section's items with the existing share-mode / role logic
  - skip the section entirely if no items remain
  - render a `<div>` section header (12px uppercase, `letter-spacing: .12em`, `color: var(--muted)`, small 2-line gradient bar under the label using existing `--grad-blue`) then the item `<Link>`s
- Keep existing item styles (active pill, icon tile, RTL flipping). No changes to click handlers, routes, or `PAGE_TO_KEY`.

## i18n (`src/i18n/dict.ts`)

Add 6 keys, ar + en:
- `overviewSection`: "نظرة عامة" / "Overview"
- `workSection`: "العمل" / "Work"
- `teamSection`: "الفريق" / "Team & League"
- `insightsSection`: "التحليلات" / "Insights"
- `adminSection`: "الإدارة" / "Administration"
- `personalSection`: "شخصي" / "Personal"

## Out of scope

- No changes to routing, permissions, share-mode logic, or the account card.
- No collapsible sections (keeps it simple — can add later if wanted).
- No changes to the mobile drawer wrapper.

## Files touched
- edited: `src/components/layout/Sidebar.tsx`, `src/i18n/dict.ts`
