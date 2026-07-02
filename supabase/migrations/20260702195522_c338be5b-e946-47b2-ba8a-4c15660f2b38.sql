DELETE FROM public.activity_log a
USING public.activity_log b
WHERE a.action = 'signed_in' AND b.action = 'signed_in'
  AND a.actor_id = b.actor_id
  AND a.id <> b.id
  AND a.created_at < b.created_at
  AND b.created_at - a.created_at < interval '10 minutes';