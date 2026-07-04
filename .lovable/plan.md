## Goal
Give you two ready-to-use test accounts — one Admin, one Member — so you can log in, create tasks/projects, and test both sides of the app. When you say "close those users", I'll delete them.

## Why you couldn't create tasks/projects
Your app's access rules only allow **Admins** to create tasks and projects. Your account `minimamba1608@gmail.com` is a **Member**, so the create actions are blocked by design (this is intentional in the app's permission model). Creating dedicated test accounts is the cleanest fix without weakening security for real members.

## What I'll create

Two test accounts with known passwords (email auto-confirmed so you can sign in immediately):

| Role   | Email                       | Password        |
| ------ | --------------------------- | --------------- |
| Admin  | `admin.test@mechatro.test`  | `Test1234!Admin` |
| Member | `member.test@mechatro.test` | `Test1234!Member` |

Note: two profiles with these emails already exist from earlier testing but without known passwords. I'll reset them cleanly so the passwords above work.

## Technical steps

1. **Migration** that runs in one transaction:
   - Delete any existing `auth.users` rows for `admin.test@mechatro.test` and `member.test@mechatro.test` (cascades to `public.profiles`).
   - Insert fresh `auth.users` rows with `crypt(password, gen_salt('bf'))`, `email_confirmed_at = now()`, and `raw_user_meta_data` containing `full_name`.
   - The existing `handle_new_user` trigger auto-creates the matching `public.profiles` rows.
   - Explicitly set the admin test user's profile `role = 'admin'` and `status = 'active'`.

2. **Later cleanup** (on your "close those users" command): a one-line migration deleting both `auth.users` rows — cascades remove profiles, tasks, comments, etc.

## How to use
- Sign out, then sign in with the Admin credentials to create projects and tasks freely.
- Sign in with the Member credentials to see the member-side experience (view assigned tasks, submit for review, etc.).