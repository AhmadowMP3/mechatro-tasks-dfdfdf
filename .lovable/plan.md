# Surface archived projects on the Projects page

## The problem
The projects list filters out archived projects by default. The only way to see them is buried inside the Filter drawer → Options → "Archived only" checkbox. Since you archived every project, the page correctly shows the empty state — but there's no obvious way to bring the archived ones back into view.

The per-project Archive / Unarchive action already exists in the card's three-dot menu; it just can't be reached while the archived items are hidden.

## Fix
Add a visible **"Active / Archived"** segmented toggle to the Projects toolbar (next to Search / Filters / Excel), matching the brand pill styling used by the dashboard filter bar.

- Default view stays on **Active** (unchanged behavior).
- Clicking **Archived** flips `f.archived` to `true`; the list re-renders showing your archived projects, each card's menu now offers **Unarchive** to restore it.
- The existing "Archived only" checkbox in the Filter drawer is removed to avoid two controls for the same thing.
- Empty-state copy updates per mode: "No active projects yet" vs. "No archived projects".
- Bilingual labels: نشطة / مؤرشفة · Active / Archived.

Small, presentation-only change — no schema, no data, no other pages touched.
