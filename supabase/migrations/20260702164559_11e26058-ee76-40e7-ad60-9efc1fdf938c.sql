create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('mechatro-backup-10d');
exception when others then null;
end $$;

select cron.schedule(
  'mechatro-backup-10d',
  '0 3 */10 * *',
  $$
  select net.http_post(
    url := 'https://hxzttehtfnxpnfyeclzj.supabase.co/functions/v1/backup-snapshot',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);