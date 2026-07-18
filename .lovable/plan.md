## Goal
Remove existing users (Zizo, Client, Ahmad, ahmad sabagh) and create 6 new accounts with English usernames and passwords. All last three are Members.

## New accounts

| Full name (AR) | Role | Username | Password |
|---|---|---|---|
| محمد غياث شنن | Master Admin | `ghiath` | `Ghiath!Master2026` |
| أحمد حج خلف | Admin (Technical) | `ahmad.hajkhalaf` | `Ahmad!Tech2026` |
| محمد أنيس | Admin (Administration) | `anas` | `Anas!Admin2026` |
| رويدة مكية | Member | `rawida` | `Rawida!Member2026` |
| حسن عاشور | Member | `hasan` | `Hasan!Member2026` |
| عبدالله قوقو | Member | `abdullah` | `Abdullah!Member2026` |

Login uses the **Name/Username** field on the sign-in page + password.

## Steps
1. Delete existing auth users (Zizo, Client, Ahmad, ahmad sabagh) and their `profiles` rows (cascades clear related data).
2. For each new user:
   - Create the `auth.users` account with a synthetic email (`<username>@mechatro.local`) and the password above, email pre-confirmed.
   - Insert/update `public.profiles` with `full_name` (Arabic), `username` (English), `role` (`admin` / `member`), `is_master_admin` for Ghiath, `status='active'`, `active=true`.
3. Update `app_config.master_admin_email` to Ghiath's synthetic email so master-admin sync stays correct.
4. Verify with a read query that all 6 profiles exist with correct roles and `resolve_login_email` returns the right email for each username.

## Notes
- Emails are synthetic (`@mechatro.local`) since sign-in is by username; users won't need to receive email.
- Passwords are shown once here — save them; they aren't recoverable from the DB.
- Any prior tasks/notes/points owned by the removed users will be deleted via FK cascade.
