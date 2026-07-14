## Problem

In light mode the `/auth` page still uses hardcoded dark values: navy gradient background, dark navy card (`rgba(10,26,43,.85)`), light-only text/muted, and the pill buttons use `rgba(255,255,255,.08)`. Result: dark island floating on a white page, poor contrast on the info banner and inputs.

## Fix — theme-aware, "cool" light look

Refactor `src/routes/auth.tsx` so every color reads from CSS variables + a small `isLight` flag driven by the app's `theme`. No dark-mode regression — it stays exactly as it looks now.

### Light mode look
- **Background**: soft cool gradient — pale sky wash top-right (`#DDEAFB`), whisper-mint bottom-left (`#E4F5EC`), on a `#F6F9FC` base. Feels airy, subtly premium.
- **Decorative glows**: keep the two radial glows but drop opacity (`.18` → `.12`) and shift hue to a brighter sky-blue / seafoam so they blend on white instead of muddying it.
- **Card**: white `#FFFFFF` with a hairline border `1px solid #E2E8F0`, `border-radius: 20`, layered shadow (`0 1px 2px rgba(15,32,49,.04), 0 24px 60px -20px rgba(24,100,180,.18)`), 32px padding. Adds a **subtle 1px top gradient stroke** (`linear-gradient(90deg, transparent, #1D9BF0, transparent)`) as an accent — one small "cool" flourish, not decoration overload.
- **Logo**: unchanged (the file already reads well on white).
- **App name subtitle**: `#5A6B7D` at 700 weight.
- **Info banner**: `#F1F7FE` fill, `#BFDBFA` border, `#1E3A5F` text. Reads clearly on white without shouting.
- **Inputs**: `#F5F8FB` fill, `#D7DEE5` border, `#0F2031` text. On focus: border → `#1D9BF0`, `box-shadow: 0 0 0 3px rgba(29,155,240,.18)`. Real focus ring, no browser default.
- **Primary button**: keep the current blue gradient (`#1D9BF0 → #0F6BB8`) — it already pops beautifully on both themes. Add hover lift: `translateY(-1px)` + intensified shadow `0 10px 24px -8px rgba(29,155,240,.55)`.
- **"Request access" ghost button**: `#5A6B7D`, underline on hover.
- **Lang / theme pills (top-right)**: white with `#E2E8F0` border and `#0F2031` text in light; keep the current dark-glass in dark.

### Implementation approach
- Introduce `const isLight = theme === "light";` at the top of `AuthPage`.
- Extract style objects into two branches (`pageBg`, `cardBg`, `cardBorder`, `cardShadow`, `bannerBg`, `bannerBorder`, `bannerText`, `inputBg`, `inputBorder`, `pillBg`, `pillBorder`, `pillText`, `glow1Color`, `glow2Color`).
- Add `:focus` state via a tiny inline `onFocus/onBlur` handler on the two inputs — no new global CSS, keeps the file self-contained.
- Add a `data-theme={theme}` attribute on the root div so future scoped tweaks are easy.

### Out of scope
- No layout changes (card stays centered, same width, same fields).
- No dark-mode restyling. Dark mode renders identically to today.
- No auth logic / RPC / navigation changes.
- No new dependencies, no new files.

## What you'll see

Light mode: a bright, airy sign-in card on a soft blue/mint gradient, crisp readable inputs, a single blue-line accent along the top of the card, and a subtle hover lift on Sign in. Dark mode: unchanged.
