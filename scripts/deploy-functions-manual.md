# Manual Edge Function Deployment (Self-Hosted Supabase)

If the automated script fails, deploy the functions manually on the VPS.

## Option A — Supabase CLI (cleanest)

1. SSH into your VPS.
2. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   # or
   bun install -g supabase
   ```
3. From the project root run:
   ```bash
   export SUPABASE_PROJECT_REF=supamecha
   supabase functions deploy admin-users --project-ref $SUPABASE_PROJECT_REF
   supabase functions deploy admin-invites --project-ref $SUPABASE_PROJECT_REF
   supabase functions deploy backup-snapshot --project-ref $SUPABASE_PROJECT_REF
   supabase functions deploy claim-device-slot --project-ref $SUPABASE_PROJECT_REF
   supabase functions deploy redeem-invite --project-ref $SUPABASE_PROJECT_REF
   supabase functions deploy share-access --project-ref $SUPABASE_PROJECT_REF
   ```

If the CLI complains about authentication on a self-hosted instance, use Option B.

## Option B — Direct file copy (most reliable for Coolify/self-hosted)

1. Find the Supabase functions directory on the server. On a typical Coolify Supabase deployment it is under the Docker volume mounted by the `supabase-functions` container:
   ```bash
   docker volume ls | grep functions
   ```
2. Locate the volume path (example):
   ```bash
   docker volume inspect <volume_name> --format '{{ .Mountpoint }}'
   ```
3. Copy the function folders from this repo into that directory:
   ```bash
   cp -r supabase/functions/* /path/to/supabase/functions/
   ```
4. Restart the functions container:
   ```bash
   docker restart <supabase-functions-container>
   ```

## Option C — Direct API with curl

Run the prepared script with your service role key:

```bash
export SUPABASE_SERVICE_ROLE_KEY="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
./scripts/deploy-edge-functions.sh
```

The script will bundle each function and POST it to:
`https://supamecha.hub4tech.net/v1/projects/supamecha/functions/deploy`
