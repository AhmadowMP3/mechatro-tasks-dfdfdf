## The problem

The app is stuck on "…" because the database is now locked down (only signed-in users can read data), but there is no login screen yet. The browser is trying to load the user list without being signed in, so the backend rejects it and the shell never renders.

## The fix — add real sign-in

Wire Supabase Auth so users can log in, and remove the temporary "local user switcher" that assumed no auth.

### 1. Auth backend
- Enable Email + Password sign-in.
- Add Google sign-in (via the Lovable broker).
- Add a database trigger so a `profiles` row is auto-created on signup (id = auth user id, role defaults to `member`, name pulled from signup metadata / Google profile).
- Seed the first admin: after you sign up once with your email, we run a one-line migration to promote that account to `admin`.

### 2. Auth UI (bilingual AR/EN, dark/light, brand styling)
- New public route `/auth` with tabs: Sign in · Sign up · Forgot password.
- New public route `/reset-password` for the password-reset landing page.
- Google button on the sign-in tab.

### 3. Route protection
- Move every app page (Dashboard, Projects, Tasks, Team, League, Notifications, Settings) under `src/routes/_authenticated/` so the managed auth gate redirects signed-out visitors to `/auth`.
- Root route listens to auth changes and refreshes the router / query cache.

### 4. Replace the local user switcher
- `AppProvider` reads the real signed-in user from Supabase instead of `localStorage`.
- Sidebar shows the signed-in user's name/avatar + a "Sign out" action (no more manual account switcher).
- All "created_by / assignee = current user" writes use the real `auth.uid()`.

### 5. Verify
- Load every route signed-out → redirects to `/auth`.
- Sign up, confirm profile row is created, promote to admin, sign in, confirm Dashboard/Projects/Tasks/Team/League/Notifications/Settings all render with real data and no 401s.

## One decision I need from you

For first-time setup I need to know which email to promote to `admin` after you sign up. Reply with the email you'll use, or say "I'll tell you after signup" and I'll give you a one-click SQL snippet to run once you've created your account.

## Technical notes
- Uses the integration-managed `_authenticated/route.tsx` gate (`ssr: false`, redirects to `/auth`).
- Google via `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`; provider configured via `configure_social_auth`.
- Profile auto-creation via `on_auth_user_created` trigger inserting into `public.profiles`.
- Auto-confirm email stays OFF unless you ask otherwise (users get a confirmation email).
