
UPDATE auth.users 
SET encrypted_password = crypt('TestAdmin123!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email = 'admin.test@mechatro.test';

UPDATE auth.users 
SET encrypted_password = crypt('TestMember123!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email = 'member.test@mechatro.test';
