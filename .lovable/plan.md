# Google Drive section as dropdown menu

## Goal
Convert the entire Google Drive backup card in Settings into a single collapsible dropdown menu, similar to the existing backups list dropdown pattern.

## Current state
- `DriveConnectSection` in `src/routes/_authenticated/settings.tsx` renders a full `brand-card` that is always expanded.
- It contains: header with title/status, sign-in area, account info grid, target folders list, add-folder buttons, disconnect button, and `BackupErrorsPanel`.

## Plan
1. Add local state `const [open, setOpen] = useState(false)` inside `DriveConnectSection`.
2. Keep the card wrapper, but split the content into:
   - **Header row** (always visible): cloud icon, title, status badge, connected account email if linked, and a chevron toggle (`ChevronDown` / `ChevronUp`). Clicking anywhere on the header toggles `open`.
   - **Body** (visible only when `open` is true): everything currently below the header — sign-in hint/button, account info grid, target folders, add-folder buttons, disconnect button, and `BackupErrorsPanel`.
3. Reuse existing `ChevronDown` and `ChevronUp` imports already present in the file.
4. Preserve all existing handlers, modals, and queries unchanged.
5. Add a compact summary in the header when linked (e.g. account email and number of targets) so the collapsed row still conveys useful state.

## Files to edit
- `src/routes/_authenticated/settings.tsx`

## No new dependencies
