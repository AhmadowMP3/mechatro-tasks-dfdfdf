
CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username citext;

-- Backfill: derive from full_name (lowercased, spaces → '.', non-alnum stripped),
-- fall back to email local-part, then to a short id, and disambiguate collisions.
WITH base AS (
  SELECT
    id,
    NULLIF(
      regexp_replace(
        lower(
          replace(
            COALESCE(NULLIF(trim(full_name), ''),
                     split_part(COALESCE(email, ''), '@', 1),
                     'user'),
            ' ', '.'
          )
        ),
        '[^a-z0-9._-]', '', 'g'
      ),
      ''
    ) AS base_name
  FROM public.profiles
  WHERE username IS NULL
),
numbered AS (
  SELECT id,
         COALESCE(base_name, 'user_' || substr(id::text, 1, 8)) AS base_name,
         row_number() OVER (
           PARTITION BY COALESCE(base_name, 'user_' || substr(id::text, 1, 8))
           ORDER BY id
         ) AS rn
  FROM base
)
UPDATE public.profiles p
   SET username = CASE WHEN n.rn = 1 THEN n.base_name ELSE n.base_name || n.rn::text END
  FROM numbered n
 WHERE p.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key
  ON public.profiles (username)
  WHERE username IS NOT NULL;

-- Login resolver: name OR username → email (active users only).
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
    FROM public.profiles
   WHERE status = 'active'
     AND email IS NOT NULL
     AND (
       lower(username::text) = lower(trim(p_name))
       OR lower(full_name)   = lower(trim(p_name))
     )
   ORDER BY (lower(username::text) = lower(trim(p_name))) DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
