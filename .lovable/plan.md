## Goal

Add a polished, error-free **Install app** button that works across:
- **Chromium desktop** (macOS/Windows/Linux — Chrome, Edge, Brave, Arc, Opera) → native install prompt.
- **Android Chrome** → native install prompt.
- **iOS Safari (iPhone/iPad)** → instructional bottom sheet ("Share → Add to Home Screen"), because iOS gives no programmatic prompt.
- **macOS Safari 17+** → instructional sheet ("File → Add to Dock").

Auto-hides when the app is already installed / running in standalone mode.

Scope is **manifest-only home-screen support** per the PWA skill — no service worker, no offline caching, no `vite-plugin-pwa`.

## Changes

### 1. Web app manifest — `public/manifest.webmanifest` (new)

```json
{
  "name": "Mechatro Tasks",
  "short_name": "Mechatro",
  "description": "Mechatro team tasks, projects, and reporting.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0B1220",
  "theme_color": "#0B1220",
  "icons": [
    { "src": "/icons/app-192.png",         "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/app-512.png",         "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/app-192-maskable.png","sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/app-512-maskable.png","sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 2. Icons — `public/icons/*.png` (new)

Generate four PNGs with `imagegen`:
- `app-192.png`, `app-512.png` — Mechatro mark centered on a dark navy background (matches app), full-bleed logo.
- `app-192-maskable.png`, `app-512-maskable.png` — same but with generous safe-zone padding (Android maskable spec) so Android's rounded/squircle masks don't crop the mark.
- One `apple-touch-icon.png` (180×180) for iOS home-screen — solid background, no transparency.

### 3. Head tags — `src/routes/__root.tsx`

Extend the existing `head()` `link`/`meta` arrays with:
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<meta name="apple-mobile-web-app-title" content="Mechatro">`
- Replace the current `theme-color: var(--background)` (invalid — CSS vars don't work in meta) with a real hex (`#0B1220`) plus a light-scheme variant via `media`.

### 4. Install button + iOS/macOS sheet — `src/components/InstallAppButton.tsx` (new)

A single small self-contained component:

- On mount, adds `beforeinstallprompt` listener → stashes the event, sets `canInstall=true`.
- Also detects: `iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream`, `macSafari = /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)`, `isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone`.
- Renders nothing when `isStandalone` (already installed).
- Otherwise renders a compact button with a download-cloud icon:
  - Chromium: click → `evt.prompt()`, then hide on `userChoice.outcome === "accepted"`; also listens to `appinstalled` to hide.
  - iOS or macOS Safari: click → open an accessible bottom sheet (portal to `document.body`, backdrop, focus trap-ish with initial focus on close button, `Esc` closes) that shows step-by-step instructions with an inline Share/File icon graphic. Bilingual (ar/en) from `useApp().lang`.
  - If none apply and no prompt captured: hide the button (nothing to do).

Styling matches the existing sidebar aesthetic (rounded, subtle gradient border, `min-h: 44` tap target). Uses only design tokens / existing inline-style palette — no hardcoded arbitrary colors.

### 5. Placement — `src/components/layout/Sidebar.tsx`

Mount `<InstallAppButton />` in the sidebar footer, directly above the existing Logout button (or above the share-mode banner in share mode: **omit** it, since share viewers shouldn't install an admin app). Same component on mobile drawer (the sidebar is shared).

No changes to any route, RLS, or auth code.

## Non-goals / explicitly out

- No offline support, no service worker, no `vite-plugin-pwa`, no cache-busting reloads (PWA skill).
- No push notifications.
- No Capacitor / native app store build.
- No visual redesign of the sidebar.
- No changes to the activity/filter fix from earlier.

## Verification

- Typecheck clean.
- Chrome desktop: Install button appears; clicking it opens Chrome's install dialog; after install, button disappears on next load.
- Android Chrome (via DevTools device mode + real device if possible): same behavior.
- iOS Safari: button appears, opens the instructional sheet; when the user adds to Home Screen and re-opens from icon, `standalone` matches and the button is hidden.
- macOS Safari: button opens the "File → Add to Dock" sheet.
- Firefox / already-installed contexts: button hidden, no console errors.
- Lighthouse PWA "Installable" check passes on the published site.