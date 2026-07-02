## Remove Google sign-in from the Auth page

Remove the "Continue with Google" button and the "or" divider above it from `src/routes/auth.tsx`, leaving only the email/password Sign-in, Sign-up, and Forgot Password flows.

### Technical details
- Delete the Google button JSX and its `or` separator in `src/routes/auth.tsx`.
- Remove the now-unused `lovable` import and Google click handler.
- Leave Supabase auth provider configuration untouched (no backend change), so Google can be re-enabled later without a migration.